# RN TCP 通用传输层与可注入帧解析器 Spec

## Why
RN demo（apps/demo）需要通过 WiFi TCP 与设备端裸 TCP server 收发 HIF 协议帧。TCP 是无边界字节流，分包/粘包必须在应用层处理（参考 LEDPLUS_hmos_ex 的 MqttClient.ets 的 appendChunk + consume 骨架）。将「TCP 传输」与「协议帧解析」解耦为通用 TcpClient 传输层 + 可注入帧解析器，使 RN 拥有同等能力且协议可插拔。

## What Changes
- 新增依赖：`react-native-tcp-socket`（iOS/Android，社区成熟库）+ `@react-native-ohos/react-native-tcp-socket`（HarmonyOS SIG 适配包，beta，JS API 与上游一致）
- 新增 `src/tcp/TcpClient.ts`：通用 TCP 客户端传输层（连接 / 发原始字节 / 主动断开 / connect / data / close / error 事件），只管字节流，不含任何协议逻辑
- 新增 `src/tcp/frameParser.ts`：`FrameParser` 接口（`push(chunk): Uint8Array[]`），可注入、协议无关
- 新增 `src/tcp/HifFrameAssembler.ts`：HIF 协议帧解析器首个实现（`0x1A...0xAF` 与 `0xAA...0xBF` 起止标志），处理分包等待、粘包循环切分、噪声字节丢弃、缓冲上限保护
- 新增 `scripts/tcp-test-server.mjs`：Node 本地测试服务器，可配置以「整包 / 分包 / 粘包」方式回发 HIF 帧，用于三端验证
- 新增 demo 页面：`src/tcpDemo.tsx` + 在 `src/catalog.ts` 注册 `tcp` 模块 + `src/modules.tsx` 的 `ModuleDemo` 增加 `case 'tcp'`
- 不涉及 ESP32 固件改造（另行 spec）

## Impact
- Affected specs: 无（新增能力）
- Affected code:
  - `apps/demo/package.json`（依赖）
  - `apps/demo/src/tcp/TcpClient.ts`、`apps/demo/src/tcp/frameParser.ts`、`apps/demo/src/tcp/HifFrameAssembler.ts`（新增）
  - `apps/demo/src/tcpDemo.tsx`（新增）、`apps/demo/src/catalog.ts`、`apps/demo/src/modules.tsx`（注册）
  - `apps/demo/scripts/tcp-test-server.mjs`（新增）
  - HarmonyOS 侧如 autolinking 未自动生效，需参考 ble-nitro B 方式经验手动恢复配置

## ADDED Requirements

### Requirement: 通用 TcpClient 传输层
系统 SHALL 提供协议无关的 TCP 客户端传输层 `TcpClient`，覆盖三端（iOS / Android / HarmonyOS），接口包含：`connect({ host, port, timeout? }): Promise<void>`（成功 resolve、失败 reject 并触发 onError）、`send(bytes: Uint8Array)`、`destroy()`（主动断开，幂等）、事件 `onData(chunk: Uint8Array)`（原始字节流片段，不保证消息边界）/ `onClose` / `onError`，以及连接状态查询。

#### Scenario: 连接与主动断开
- **WHEN** 调用 `connect` 连接可达的 TCP server，随后调用 `destroy()`
- **THEN** 依次触发 `onConnect`、`onClose`，且重复 `destroy()` 不抛错

#### Scenario: 原始数据透传
- **WHEN** server 发送任意字节序列（含半帧）
- **THEN** `onData` 原样抛出字节片段，不做任何切分或拼接

### Requirement: 可注入帧解析器
系统 SHALL 定义 `FrameParser` 接口：`push(chunk: Uint8Array): Uint8Array[]`——输入一个原始片段，返回本次新解析出的完整帧数组；解析器内部维护待续缓冲。TcpClient 不耦合任何解析器，由页面/业务层自由组合。接口 SHALL 同时容纳两类帧边界策略：
- **分隔符式**：靠帧头/帧尾标志切分（如 HIF `0xAA...0xBF` / `0x1A...0xAF`）
- **长度字段式**：靠「固定头 + 长度字段」计算帧总长切分（参考 MqttClient.ets 的 header + remaining length 方式），不依赖帧尾标志

#### Scenario: 协议可插拔
- **WHEN** 业务层将不同 FrameParser 实现传入同一 TcpClient 的数据流
- **THEN** 传输层代码零改动即可输出不同协议的完整帧

#### Scenario: 长度字段式切分
- **WHEN** 使用长度字段式解析器，片段含「头 + 长度字段」且长度字段被拆在两个片段中
- **THEN** 长度字段未收全时返回空数组等待，收全后按长度切出完整帧

### Requirement: HIF 帧解析器实现
系统 SHALL 提供 `HifFrameAssembler` 实现：以 `0x1A`（帧尾 `0xAF`）与 `0xAA`（帧尾 `0xBF`）为起止标志，从字节流中累积并切分完整帧；帧尾未到达时保留缓冲等待（分包）；收到多帧时循环切分全部完整帧（粘包）；丢弃帧头之前的噪声字节；缓冲超过上限（如 4096 字节）时清空防 OOM。

#### Scenario: 分包等待
- **WHEN** 一帧被拆成两个片段先后到达（如 `1A 01` 与 `A1 23 45 66 AF`）
- **THEN** 第一片到达时返回空数组，第二片到达后返回完整帧

#### Scenario: 粘包切分
- **WHEN** 两个完整帧在同一片段内到达
- **THEN** 一次 `push` 返回两个完整帧

#### Scenario: 噪声丢弃
- **WHEN** 片段以非帧头字节开头
- **THEN** 噪声被丢弃，不影响后续帧解析

### Requirement: 长度字段帧解析器实现
系统 SHALL 提供 `LengthFieldFrameParser` 通用实现：按可配置参数（长度字段偏移、字节数 1/2、字节序、长度值含义——含头总长或净荷长）从字节流中按「头 + 长度」切帧；长度字段未收全或帧未到齐时保留缓冲等待，粘包时循环切分，缓冲超上限自清。具体协议参数在实际对接设备时配置。

#### Scenario: 按长度取帧
- **WHEN** 缓冲中已收齐「头 + 长度字段」且后续字节达到长度值要求
- **THEN** 切出完整帧；不足则等待，多余则留作下一帧

### Requirement: TCP demo 页面
系统 SHALL 在 demo 应用内提供 `tcp` 模块页面：输入 host / port，连接与断开按钮，十六进制数据发送，页面同时显示「原始片段日志」与「解析出的 HIF 帧日志」，以及连接状态；离开页面时自动断开连接。

#### Scenario: 三端冒烟
- **WHEN** 在 iOS / Android / HarmonyOS 真机或模拟器打开 tcp 页面，连接本机 `scripts/tcp-test-server.mjs`
- **THEN** 能完成连接、发送 HIF 帧、收到回发帧且解析正确；分包/粘包三种模式下帧输出一致

### Requirement: 本地测试服务器
系统 SHALL 提供 Node 测试服务器脚本，监听指定端口，收到字节后按可选模式（整包 / 按固定字节数切片延迟发送 / 多帧拼接一次发送）回发 HIF 响应帧，用于验证解析器。

#### Scenario: 粘包模拟
- **WHEN** 以粘包模式运行测试服务器
- **THEN** 客户端一次 `onData` 可收到两个帧拼接的字节，且 HifFrameAssembler 能全部解析

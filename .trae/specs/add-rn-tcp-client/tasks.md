# Tasks

- [x] Task 1: 集成 react-native-tcp-socket 三端依赖
  - [x] SubTask 1.1: 在 apps/demo 安装 `react-native-tcp-socket` 与 `@react-native-ohos/react-native-tcp-socket`，JS 侧统一从 `react-native-tcp-socket` 导入（鸿蒙适配包仅提供原生实现）
  - [x] SubTask 1.2: 验证鸿蒙侧 autolinking 自动生效（干跑 expo-harmony-autolinking search/resolve，tcp-socket 被自动发现、descriptor 完整；无需手动配置；assembleHap 构建验证归入 Task 6）
  - [x] SubTask 1.3: Android（prebuild + gradle）与 iOS（podspec）确认可链接（允许仅验证到构建通过，真机验证放 Task 6）

- [x] Task 2: 实现 TcpClient 通用传输层（`src/tcp/TcpClient.ts`）
  - [x] SubTask 2.1: connect / send / destroy / 状态查询与 connect、data、close、error 事件封装，屏蔽 react-native-tcp-socket 的 Buffer/Uint8Array 差异
  - [x] SubTask 2.2: 重复连接、重复销毁、未连接发送等边界防护

- [x] Task 3: 实现帧解析器接口与两种解析器实现（`src/tcp/frameParser.ts` + `src/tcp/HifFrameAssembler.ts` + `src/tcp/LengthFieldFrameParser.ts`）
  - [x] SubTask 3.1: `FrameParser` 接口定义（push 返回完整帧数组，内部缓冲），接口同时容纳分隔符式与长度字段式两类策略
  - [x] SubTask 3.2: `HifFrameAssembler`（分隔符式）：起止标志切分、分包等待、粘包循环、噪声丢弃、4096 字节缓冲上限
  - [x] SubTask 3.3: `LengthFieldFrameParser`（长度字段式，参考 MqttClient.ets 的 header+remaining length 取帧方式）：可配置长度偏移/字节数/字节序/长度含义，分包等待、粘包循环、缓冲上限

- [x] Task 4: 本地测试服务器（`scripts/tcp-test-server.mjs`）
  - [x] SubTask 4.1: 监听端口、回显/回发 HIF 帧，支持 `--mode=whole|split|sticky` 三种模式（整包 / 切片延迟 / 多帧粘发）

- [x] Task 5: TCP demo 页面与模块注册
  - [x] SubTask 5.1: `src/tcpDemo.tsx`（host/port 输入、连接/断开、hex 发送、原始片段与解析帧双日志、状态展示、离开页面自动断开）
  - [x] SubTask 5.2: `src/catalog.ts` 注册 `tcp` 模块 + `src/modules.tsx` 增加 `case 'tcp'`
  - [x] SubTask 5.3: `npm run typecheck` 通过

- [ ] Task 6: 三端验证（分包/粘包用例）
  - [ ] SubTask 6.1: HarmonyOS 真机：harmony-build 启动，连本机测试服务器，whole/split/sticky 三模式帧解析一致
  - [ ] SubTask 6.2: iOS 或 Android 至少一端：同样三模式验证通过

# Task Dependencies
- Task 2、3、4 相互独立，可并行
- Task 5 依赖 Task 2、3
- Task 6 依赖 Task 1、4、5

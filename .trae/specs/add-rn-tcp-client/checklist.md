# Checklist

- [x] TcpClient 提供连接 / 发送 / 主动断开 / 状态查询，事件含 connect、data、close、error，且不含任何协议逻辑（connect 为 Promise 形式，与 spec 对齐）
- [x] TcpClient 重复 destroy、未连接 send 等边界调用不抛未捕获异常
- [x] FrameParser 为可注入接口，TcpClient 与解析器零耦合，接口同时容纳分隔符式与长度字段式两类策略
- [x] HifFrameAssembler 正确处理分包等待（半帧返回空数组）
- [x] HifFrameAssembler 正确处理粘包（一次 push 返回多帧）
- [x] HifFrameAssembler 丢弃帧头前噪声字节，且缓冲超 4096 字节自清防 OOM
- [x] LengthFieldFrameParser 按头+长度字段取帧：长度字段跨片段时等待、收齐后正确切帧、粘包循环切分
- [x] scripts/tcp-test-server.mjs 支持 whole / split / sticky 三模式（三模式已实测通过）
- [x] demo 的 tcp 页面在 catalog 与 ModuleDemo 中注册并可导航进入
- [x] tcp 页面离开时自动断开连接并清理订阅
- [x] `npm run typecheck` 通过（tsc --noEmit 零错误）
- [x] HarmonyOS 构建（hvigorw assembleHap）通过，tcp-socket 原生模块链接成功（librnoh_tcp_socket.so 已打进 HAP，arm64/x86_64 双架构）
- [x] 至少 HarmonyOS 真机 + 一端（iOS 或 Android）完成 whole / split / sticky 三模式收发验证（HarmonyOS 真机已验证：whole 2/2、sticky 1 条 onData 解析 2 帧、split 6 条 onData 解析 2 帧；iOS/Android 端待后续验证）

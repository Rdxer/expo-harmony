import TcpSocket from 'react-native-tcp-socket';

/** 底层 socket 实例类型（取自 createConnection 返回值，避免依赖库内部导出细节） */
type Socket = ReturnType<typeof TcpSocket.createConnection>;

export type TcpConnectOptions = {
  host: string;
  port: number;
  /** 连接超时（毫秒），在 JS 侧实现；不传则一直等待 */
  timeout?: number;
};

type DataListener = (chunk: Uint8Array) => void;
type CloseListener = () => void;
type ErrorListener = (error: Error) => void;

/** 底层 'data' 事件负载统一转成 Uint8Array（零拷贝视图）；string 仅为类型兜底，运行时不会出现 */
function toUint8Array(data: string | Uint8Array): Uint8Array {
  if (typeof data === 'string') {
    const bytes = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i += 1) bytes[i] = data.charCodeAt(i) & 0xff;
    return bytes;
  }
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

/**
 * 通用 TCP 传输层（协议无关，不含任何帧解析）。
 *
 * 帧解析由注入的 FrameParser 完成；本类只负责连接生命周期、字节流收发与事件分发。
 */
export class TcpClient {
  private socket: Socket | null = null;
  private connected = false;
  /** 连接期间挂起的 finish 函数，destroy 时用它收尾，避免 connect promise 永久悬挂 */
  private pendingConnect: ((error?: Error) => void) | null = null;
  private readonly dataListeners = new Set<DataListener>();
  private readonly closeListeners = new Set<CloseListener>();
  private readonly errorListeners = new Set<ErrorListener>();

  /** 建立 TCP 连接：成功 resolve；失败（含超时）reject 并触发 onError */
  connect(options: TcpConnectOptions): Promise<void> {
    // 清掉旧连接，保证每次 connect 从干净状态开始（旧连接的 onClose 会先触发）
    this.destroy();

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const finish = (error?: Error): void => {
        this.pendingConnect = null;
        if (settled) return;
        settled = true;
        if (timer !== null) clearTimeout(timer);
        if (error) {
          this.connected = false;
          reject(error);
          this.emitError(error);
          return;
        }
        this.connected = true;
        resolve();
      };

      const socket = TcpSocket.createConnection(
        { host: options.host, port: options.port },
        () => finish(),
      );
      this.socket = socket;
      this.pendingConnect = finish;

      // 库的 connectTimeout 仅部分版本/平台支持，这里统一在 JS 侧实现超时
      const timeoutMs = options.timeout ?? 0;
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          finish(new Error(`TCP 连接超时（${timeoutMs}ms）`));
          // 超时后销毁底层 socket；先摘监听，避免残留事件进入状态机
          if (this.socket === socket) {
            this.socket = null;
            socket.removeAllListeners();
            socket.destroy();
          }
        }, timeoutMs);
      }

      socket.on('data', (data) => {
        this.emitData(toUint8Array(data));
      });
      socket.on('error', (error) => {
        if (!settled) {
          finish(error); // 连接阶段失败：reject + onError
          return;
        }
        this.emitError(error); // 已连接阶段出错：仅 onError，随后等 'close'
      });
      socket.on('close', () => {
        const wasConnected = this.connected;
        this.connected = false;
        if (this.socket === socket) this.socket = null;
        if (!settled) {
          // 未报错就断开（罕见）：让挂起的 connect 以失败收尾，避免悬挂
          finish(new Error('TCP 连接在建立前已关闭'));
          return;
        }
        if (wasConnected) this.emitClose();
      });
    });
  }

  /** 发送字节：write 接受 Uint8Array，底层会包装成 Buffer 再走原生桥；未连接时静默忽略 */
  send(bytes: Uint8Array): void {
    const socket = this.socket;
    if (!socket || !this.connected) return;
    socket.write(bytes);
  }

  /** 销毁连接：幂等，重复调用不抛错；主动销毁视为一次关闭，触发 onClose */
  destroy(): void {
    const socket = this.socket;
    this.socket = null;
    this.connected = false;

    // 连接尚未完成时，让挂起的 connect 以失败收尾（reject + onError）
    const pending = this.pendingConnect;
    this.pendingConnect = null;
    if (pending) pending(new Error('TCP 连接在建立前被销毁'));

    if (!socket) return;
    // 先摘掉底层监听，销毁产生的底层事件不再进入本类状态机
    socket.removeAllListeners();
    socket.destroy();
    this.emitClose();
  }

  isConnected(): boolean {
    return this.connected;
  }

  /** 订阅数据（原始字节流，未做帧解析）；返回取消订阅函数 */
  onData(listener: DataListener): () => void {
    this.dataListeners.add(listener);
    return () => {
      this.dataListeners.delete(listener);
    };
  }

  /** 订阅连接关闭（destroy 或对端断开，每次连接生命周期至多一次）；返回取消订阅函数 */
  onClose(listener: CloseListener): () => void {
    this.closeListeners.add(listener);
    return () => {
      this.closeListeners.delete(listener);
    };
  }

  /** 订阅错误；返回取消订阅函数 */
  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  private emitData(chunk: Uint8Array): void {
    for (const listener of this.dataListeners) listener(chunk);
  }

  private emitError(error: Error): void {
    for (const listener of this.errorListeners) listener(error);
  }

  private emitClose(): void {
    for (const listener of this.closeListeners) listener();
  }
}

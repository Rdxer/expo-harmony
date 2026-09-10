/**
 * 极简 MQTT 3.1.1 over WebSocket 客户端（零依赖）。
 *
 * 基于 React Native 内置全局 WebSocket 实现，可运行于 iOS / Android / HarmonyOS / Web，
 * 无需任何原生模块或 Metro polyfill。覆盖：
 *  - CONNECT / CONNACK（clientId、username、password、cleanSession、keepalive、超时）
 *  - SUBSCRIBE / SUBACK、UNSUBSCRIBE / UNSUBACK
 *  - PUBLISH（QoS 0 / 1 + PUBACK，retain）、接收与自动回 PUBACK
 *  - PINGREQ / PINGRESP 心跳保活与超时检测
 *
 * 设计上对齐项目内 TcpClient 的事件模式：onXxx 注册监听并返回取消订阅函数。
 */

// ---- 公开类型 ----

export type MqttQos = 0 | 1 | 2;

export type MqttConnectOptions = {
  /** ws:// 或 wss:// 地址 */
  url: string;
  clientId: string;
  username?: string;
  password?: string;
  /** 心跳周期（秒），实际为网络保活与超时判定的依据；传 0 表示禁用保活 */
  keepalive?: number;
  cleanSession?: boolean;
  /** 从发起连接到收到 CONNACK 的超时（毫秒） */
  connectTimeoutMs?: number;
};

export type MqttConnAck = {
  sessionPresent: boolean;
  returnCode: number;
  description: string;
};

export type MqttMessage = {
  topic: string;
  payload: Uint8Array;
  qos: MqttQos;
  retain: boolean;
};

export type MqttPublishOptions = {
  qos?: MqttQos;
  retain?: boolean;
};

// ---- MQTT 3.1.1 包类型 ----

const enum PacketType {
  CONNECT = 0x1,
  CONNACK = 0x2,
  PUBLISH = 0x3,
  PUBACK = 0x4,
  SUBSCRIBE = 0x8,
  SUBACK = 0x9,
  UNSUBSCRIBE = 0xa,
  UNSUBACK = 0xb,
  PINGREQ = 0xc,
  PINGRESP = 0xd,
  DISCONNECT = 0xe,
}

/** CONNACK 返回码释义 */
const CONNACK_RETURN_CODES: Record<number, string> = {
  0: '连接已被接受',
  1: '不支持的协议版本',
  2: '客户端标识符被拒绝',
  3: '服务不可用',
  4: '用户名或密码错误',
  5: '未授权',
};

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

const CONNECT_TIMEOUT_MS_DEFAULT = 15000;
const ACK_TIMEOUT_MS = 10000;

// ---- 协议编解码工具 ----

/** 剩余长度编码（1-4 字节，MQTT 3.1.1 规范） */
function encodeRemainingLength(value: number): number[] {
  const out: number[] = [];
  do {
    let byte = value % 128;
    value = Math.floor(value / 128);
    if (value > 0) byte |= 0x80;
    out.push(byte);
  } while (value > 0);
  return out;
}

/** 追加「2 字节大端长度 + UTF-8 内容」 */
function pushUtf8(target: number[], value: string): void {
  const raw = ENCODER.encode(value);
  target.push((raw.length >> 8) & 0xff, raw.length & 0xff);
  for (let i = 0; i < raw.length; i += 1) target.push(raw[i]!);
}

/** 从 offset 读取 UTF-8 字符串，返回取值与下一偏移 */
function readUtf8(bytes: Uint8Array, offset: number): { value: string; next: number } {
  const length = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
  const value = DECODER.decode(bytes.subarray(offset + 2, offset + 2 + length));
  return { next: offset + 2 + length, value };
}

/** 解析位于 start 处的单个 MQTT 包；剩余长度越界时返回 null */
function parsePacketAt(
  bytes: Uint8Array,
  start: number,
): { type: number; flags: number; body: Uint8Array; end: number } | null {
  if (start >= bytes.length) return null;
  const headerByte = bytes[start]!;
  let multiplier = 1;
  let remaining = 0;
  let index = start + 1;
  while (true) {
    if (index >= bytes.length) return null;
    const digit = bytes[index]!;
    remaining += (digit & 0x7f) * multiplier;
    index += 1;
    if ((digit & 0x80) === 0) break;
    multiplier *= 128;
  }
  const end = index + remaining;
  if (end > bytes.length) return null;
  return {
    body: bytes.subarray(index, end),
    end,
    flags: headerByte & 0x0f,
    type: headerByte >> 4,
  };
}

/** Base64 字符串转字节（不依赖 atob/Buffer，兼容所有 JS 运行时） */
function base64ToBytes(input: string): Uint8Array {
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of input.replace(/\s+/g, '')) {
    if (char === '=') break;
    const value = BASE64_ALPHABET.indexOf(char);
    if (value === -1) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

/**
 * 把 WebSocket onmessage 的 data 统一转成 Uint8Array：
 * RN 各平台上二进制消息可能是 ArrayBuffer / Uint8Array / base64 字符串，逐一兜底。
 */
function toUint8Array(data: unknown): Uint8Array | null {
  if (typeof data === 'string') {
    try {
      return base64ToBytes(data);
    } catch {
      return null;
    }
  }
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return null;
}

/** RN 全局 WebSocket 的 binaryType 不在官方类型里，运行时实际支持 */
type RNWebSocket = WebSocket & { binaryType?: string };

type MessageListener = (message: MqttMessage) => void;
type CloseListener = () => void;
type ErrorListener = (error: Error) => void;

interface PendingAck {
  label: string;
  reject: (error: Error) => void;
  resolve: (value: number) => void;
}

export class MqttClient {
  private ws: RNWebSocket | null = null;
  private connected = false;

  /** 心跳参数（毫秒），0 表示禁用 */
  private heartbeatMs = 30000;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastPacketSentAt = 0;
  private lastPacketReceivedAt = 0;

  private packetIdCounter = 0;
  private closeEmitted = false;

  /** CONNACK 未决 Promise */
  private connAckResolve: ((ack: MqttConnAck) => void) | null = null;
  private connAckReject: ((error: Error) => void) | null = null;

  /** SUBACK / PUBACK / UNSUBACK 未决表 */
  private readonly ackMap = new Map<number, PendingAck>();

  private readonly messageListeners = new Set<MessageListener>();
  private readonly closeListeners = new Set<CloseListener>();
  private readonly errorListeners = new Set<ErrorListener>();

  /**
   * 建立 MQTT over WebSocket 连接。
   * 成功：收到 CONNACK 且返回码为 0 时 resolve（随后开启心跳保活）。
   * 失败：连接超时、WebSocket 关闭或 CONNACK 返回码非 0 时 reject 并触发 onError。
   */
  connect(options: MqttConnectOptions): Promise<MqttConnAck> {
    const url = options.url.trim();
    const clientId = options.clientId.trim();
    if (!/^wss?:\/\//i.test(url)) {
      return Promise.reject(new Error('仅支持 ws:// 或 wss:// 地址'));
    }
    if (clientId.length === 0) {
      return Promise.reject(new Error('clientId 不能为空'));
    }

    // 从干净状态开始（销毁旧连接，避免旧回调影响新连接状态机）
    this.reset();

    const connectTimeoutMs = options.connectTimeoutMs ?? CONNECT_TIMEOUT_MS_DEFAULT;
    const keepalive = options.keepalive ?? 30;
    const cleanSession = options.cleanSession ?? true;

    return new Promise<MqttConnAck>((resolveConnect, rejectConnect) => {
      let ws: RNWebSocket;
      try {
        // 多数 MQTT WebSocket Broker（EMQX/Mosquitto/自建）要求 Sec-WebSocket-Protocol: mqtt
        ws = new WebSocket(url, ['mqtt']) as RNWebSocket;
      } catch (error) {
        rejectConnect(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      this.ws = ws;
      ws.binaryType = 'arraybuffer';
      this.heartbeatMs = keepalive > 0 ? keepalive * 1000 : 0;

      // 注意必须挂接 finishConnAck（而非裸 resolve）：它负责置 connected 并启动心跳
      const finishConnAck = (ack: MqttConnAck): void => {
        this.clearConnectTimer();
        this.connAckResolve = null;
        this.connAckReject = null;
        this.connected = true;
        // 以当前时刻作为保活计时起点
        this.lastPacketSentAt = Date.now();
        this.lastPacketReceivedAt = Date.now();
        this.startHeartbeat();
        resolveConnect(ack);
      };
      this.connAckResolve = finishConnAck;
      this.connAckReject = rejectConnect;

      ws.onopen = () => {
        // 读取当前选项，构建并发送 CONNECT 报文
        const connectFlags
          = (cleanSession ? 0x02 : 0x00)
          | (options.username !== undefined && options.username !== '' ? 0x80 : 0x00)
          | (options.username !== undefined && options.username !== '' && options.password !== undefined ? 0x40 : 0x00);
        const body: number[] = [
          0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, // "MQTT"
          0x04, // MQTT 3.1.1
          connectFlags,
          (keepalive >> 8) & 0xff,
          keepalive & 0xff,
        ];
        pushUtf8(body, clientId);
        if (connectFlags & 0x80) pushUtf8(body, options.username!);
        if (connectFlags & 0x40) pushUtf8(body, options.password!);
        this.sendFrame(PacketType.CONNECT << 4, body);
      };

      ws.onmessage = (event) => {
        this.handleFrame(event.data);
      };

      ws.onerror = (event) => {
        // 兼容不同全局 WebSocket 类型（RN 的 WebSocketErrorEvent 带 message，lib.dom 的 Event 没有）
        const message = typeof event === 'object' && event !== null && 'message' in event
          ? String((event as { message: unknown }).message)
          : '';
        this.emitError(new Error(`WebSocket 错误：${message || '未知错误'}`));
      };

      ws.onclose = (event) => {
        if (this.ws !== ws) return; // 已被主动关闭流程处理
        this.ws = null;
        this.connected = false;
        this.stopHeartbeat();
        const reject = this.connAckReject;
        this.connAckResolve = null;
        this.connAckReject = null;
        const closeReason = `WebSocket 连接已关闭（code=${event.code ?? '?'}）${event.reason ? `：${event.reason}` : ''}`;
        if (reject) reject(new Error(closeReason));
        this.rejectAllPending(closeReason);
        this.emitCloseSafe();
      };

      this.connectTimer = setTimeout(() => {
        if (this.ws !== ws) return;
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        ws.close();
        this.fail(new Error(`MQTT 连接超时（${connectTimeoutMs / 1000} 秒）`));
      }, connectTimeoutMs);
    });
  }

  isConnected(): boolean {
    return this.connected;
  }

  /**
   * 订阅主题。resolve 为 SUBACK 授予的 QoS（0/1/2）；0x80（被拒绝）会 reject。
   */
  subscribe(topic: string, qos: MqttQos = 0): Promise<MqttQos> {
    const id = this.nextPacketId();
    const body: number[] = [id >> 8, id & 0xff];
    pushUtf8(body, topic);
    body.push(qos);
    const label = `订阅 ${topic}`;
    const pending = this.awaitAck(id, label);
    this.sendFrame(PacketType.SUBSCRIBE << 4 | 0x02, body);
    return pending.then((code) => {
      if (code === 0x80) throw new Error(`订阅 ${topic} 被服务器拒绝（返回 0x80）`);
      return code as MqttQos;
    });
  }

  unsubscribe(topic: string): Promise<void> {
    const id = this.nextPacketId();
    const body: number[] = [id >> 8, id & 0xff];
    pushUtf8(body, topic);
    const pending = this.awaitAck(id, `取消订阅 ${topic}`);
    this.sendFrame(PacketType.UNSUBSCRIBE << 4 | 0x02, body);
    return pending.then(() => undefined);
  }

  /**
   * 发布消息。QoS 0 即时发送；QoS 1 等待 PUBACK 后 resolve。
   * 本客户端仅支持 QoS 0/1（QoS 2 明确拒绝）。
   */
  publish(topic: string, payload: string | Uint8Array, options: MqttPublishOptions = {}): Promise<void> {
    if (topic.length === 0) return Promise.reject(new Error('发布主题不能为空'));
    const qos = options.qos ?? 0;
    const retain = options.retain ?? false;
    if (qos === 2) return Promise.reject(new Error('本演示客户端仅支持 QoS 0 与 QoS 1'));
    if (!this.connected) return Promise.reject(new Error('尚未连接到 MQTT 服务器'));

    const raw = typeof payload === 'string' ? ENCODER.encode(payload) : payload;
    const body: number[] = [];
    pushUtf8(body, topic);
    const id = qos > 0 ? this.nextPacketId() : 0;
    if (id > 0) body.push(id >> 8, id & 0xff);
    for (let i = 0; i < raw.length; i += 1) body.push(raw[i]!);

    const headerByte = (PacketType.PUBLISH << 4) | (qos << 1) | (retain ? 0x01 : 0x00);
    if (qos === 0) {
      this.sendFrame(headerByte, body);
      return Promise.resolve();
    }
    const pending = this.awaitAck(id, `发布到 ${topic}`);
    this.sendFrame(headerByte, body);
    return pending.then(() => undefined);
  }

  /** 发送 DISCONNECT 报文后关闭连接（幂等，可重复调用） */
  disconnect(): void {
    if (this.connected) this.sendFrame(PacketType.DISCONNECT << 4, []);
    this.closeSocketAndNotify();
  }

  /** 直接销毁连接，不发送 DISCONNECT（幂等） */
  destroy(): void {
    this.closeSocketAndNotify();
  }

  // ---- 事件订阅 ----

  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
  }

  onClose(listener: CloseListener): () => void {
    this.closeListeners.add(listener);
    return () => {
      this.closeListeners.delete(listener);
    };
  }

  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  // ---- 内部实现 ----

  /** 重置到初始状态，销毁旧连接（旧连接的 onclose 已被摘除，不会回调） */
  private reset(): void {
    this.stopHeartbeat();
    this.clearConnectTimer();
    this.connAckResolve = null;
    this.connAckReject = null;
    this.rejectAllPending('连接链已重置');
    this.closeEmitted = false;
    this.connected = false;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close();
    }
  }

  private fail(error: Error): void {
    this.emitError(error);
    const reject = this.connAckReject;
    this.connAckResolve = null;
    this.connAckReject = null;
    if (reject) reject(error);
    this.closeSocketAndNotify();
  }

  /** 主动关闭：摘监听 → close → 通知 onClose（带重复通知保护） */
  private closeSocketAndNotify(): void {
    this.stopHeartbeat();
    this.clearConnectTimer();
    this.rejectAllPending('连接已关闭');
    const reject = this.connAckReject;
    this.connAckResolve = null;
    this.connAckReject = null;
    if (reject) reject(new Error('连接被主动关闭'));
    this.connected = false;
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close();
    }
    this.emitCloseSafe();
  }

  /** 发送一个完整 MQTT 帧：固定头 + 剩余长度 + 包体 */
  private sendFrame(headerByte: number, body: number[]): void {
    const raw: number[] = [headerByte, ...encodeRemainingLength(body.length), ...body];
    this.sendRaw(raw);
  }

  private sendRaw(payload: number[]): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(Uint8Array.from(payload).buffer as ArrayBuffer);
    this.lastPacketSentAt = Date.now();
  }

  private nextPacketId(): number {
    this.packetIdCounter = (this.packetIdCounter % 0xffff) + 1;
    return this.packetIdCounter;
  }

  /** 注册一个等待 ACK 的未决项：resolve 后返回授权值并携带超时 */
  private awaitAck(id: number, label: string): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.ackMap.delete(id);
        reject(new Error(`${label} 等待确认超时（${ACK_TIMEOUT_MS / 1000} 秒）`));
      }, ACK_TIMEOUT_MS);
      this.ackMap.set(id, {
        label,
        reject,
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
      });
    });
  }

  private settleAck(id: number, value: number): void {
    const pending = this.ackMap.get(id);
    this.ackMap.delete(id);
    pending?.resolve(value);
  }

  private rejectAllPending(reason: string): void {
    const entries = Array.from(this.ackMap.values());
    this.ackMap.clear();
    for (const pending of entries) pending.reject(new Error(`${pending.label} 失败：${reason}`));
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    if (this.heartbeatMs <= 0) return;
    this.heartbeatTimer = setInterval(() => this.checkHeartbeat(), Math.max(1000, Math.floor(this.heartbeatMs / 3)));
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private clearConnectTimer(): void {
    if (this.connectTimer !== null) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
  }

  private checkHeartbeat(): void {
    const now = Date.now();
    if (now - this.lastPacketReceivedAt > this.heartbeatMs * 2) {
      this.fail(new Error('MQTT 心跳超时：连续超过 2 个 keepalive 周期未收到服务端任何数据包'));
      return;
    }
    if (now - this.lastPacketSentAt >= this.heartbeatMs) {
      this.sendFrame(PacketType.PINGREQ << 4, []);
    }
  }

  /** WebSocket 帧 → 逐包解析分发（一个帧理论只有一个包，防御性循环） */
  private handleFrame(data: unknown): void {
    const bytes = toUint8Array(data);
    if (!bytes) return;
    this.lastPacketReceivedAt = Date.now();
    let offset = 0;
    while (offset < bytes.length) {
      const packet = parsePacketAt(bytes, offset);
      if (!packet) break;
      offset = packet.end;
      this.dispatch(packet.type, packet.flags, packet.body);
    }
  }

  private dispatch(type: number, flags: number, body: Uint8Array): void {
    switch (type) {
      case PacketType.CONNACK:
        this.handleConnAck(body);
        break;
      case PacketType.PUBLISH:
        this.handlePublish(flags, body);
        break;
      case PacketType.PUBACK:
        this.handlePubAck(body);
        break;
      case PacketType.SUBACK:
        this.handleSubAck(body);
        break;
      case PacketType.UNSUBACK:
        this.handleUnsubAck(body);
        break;
      case PacketType.PINGRESP:
        // 心跳周期中 lastPacketReceivedAt 已在 handleFrame 更新，无需额外处理
        break;
      default:
        // PUBREC/PUBREL/PUBCOMP 等 QoS2 流转包暂不支持，静默忽略
        break;
    }
  }

  private handleConnAck(body: Uint8Array): void {
    const sessionPresent = ((body[0] ?? 0) & 0x01) === 1;
    const returnCode = body[1] ?? 0;
    const ack: MqttConnAck = {
      description: CONNACK_RETURN_CODES[returnCode] ?? `未知返回码（${returnCode}）`,
      returnCode,
      sessionPresent,
    };
    const resolve = this.connAckResolve;
    if (returnCode === 0 && resolve) {
      resolve(ack);
      return;
    }
    // 非 0 返回码：连接被拒，reject + 关闭
    this.fail(new Error(`MQTT 连接被拒绝：${ack.description}`));
  }

  private handlePublish(flags: number, body: Uint8Array): void {
    const retain = (flags & 0x01) === 1;
    const qos = (flags >> 1) & 0x03;
    let offset = 0;
    const { next, value: topic } = readUtf8(body, offset);
    offset = next;
    let packetId = 0;
    if (qos === 1 || qos === 2) {
      packetId = ((body[offset] ?? 0) << 8) | (body[offset + 1] ?? 0);
      offset += 2;
    }
    const payload = body.subarray(offset);

    // QoS 1 消息必须回 PUBACK，否则 broker 会反复重发
    if (qos === 1) {
      this.sendRaw([0x40, 0x02, (packetId >> 8) & 0xff, packetId & 0xff]);
    }
    // QoS 2 不做 PUBREC 应答：订阅界面只提供 QoS 0/1，此情况理论上不会出现

    for (const listener of this.messageListeners) {
      listener({ payload, qos: qos as MqttQos, retain, topic });
    }
  }

  private handlePubAck(body: Uint8Array): void {
    const id = ((body[0] ?? 0) << 8) | (body[1] ?? 0);
    this.settleAck(id, 0);
  }

  private handleSubAck(body: Uint8Array): void {
    const id = ((body[0] ?? 0) << 8) | (body[1] ?? 0);
    this.settleAck(id, body[2] ?? 0);
  }

  private handleUnsubAck(body: Uint8Array): void {
    const id = ((body[0] ?? 0) << 8) | (body[1] ?? 0);
    this.settleAck(id, 0);
  }

  private emitCloseSafe(): void {
    if (this.closeEmitted) return;
    this.closeEmitted = true;
    for (const listener of this.closeListeners) listener();
  }

  private emitError(error: Error): void {
    for (const listener of this.errorListeners) listener(error);
  }
}

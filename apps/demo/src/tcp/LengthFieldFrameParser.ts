import type { FrameParser } from './frameParser';

/** 待续缓冲上限，超过即清空，防止噪声/错位流导致内存无限增长（OOM） */
const MAX_BUFFER_BYTES = 4096;

export type LengthFieldFrameParserOptions = {
  /** 帧头魔法字节（帧首字节期望值）。缺省不校验（仅按长度取帧，不推荐用于不可信流） */
  magic?: number;
  /**
   * 错位时是否向后逐字节扫描魔法字节重新对齐（重同步）。
   * true：魔法不匹配或长度值无效时丢弃 1 字节继续扫描，最多损失错位前几个字节；
   * false（默认）：魔法不匹配或长度值无效时清空全部缓冲。
   * 仅在设置 magic 时生效。
   */
  syncScan?: boolean;
  /** 长度字段在帧中的偏移（字节），默认 1（偏移 0 留给魔法字节） */
  lengthOffset?: number;
  /** 长度字段的字节宽度：1~4，默认 1 */
  lengthBytes?: 1 | 2 | 3 | 4;
  /** 长度字段是否为小端字节序，默认 false（大端） */
  littleEndian?: boolean;
  /** 长度值是否已包含帧头部分（headerBytes），默认 false（长度值仅表示帧头之后的字节数） */
  lengthIncludesHeader?: boolean;
};

/**
 * 长度字段式帧解析器，参考 MqttClient.ets 的 header + remaining length 思路。
 *
 * 解析流程：缓冲不足 headerBytes（lengthOffset + lengthBytes）时等待 →
 * （可选）校验魔法字节，不匹配则重同步或清空 →
 * 读出长度并计算帧总长（lengthIncludesHeader ? value : headerBytes + value）→
 * 长度无效时重同步或清空兜底 → 缓冲不足总长时等待 → 够了切出帧并继续循环（粘包）。
 *
 * 注意：MQTT 原生协议的剩余长度是 1~4 字节 varint（每字节低 7 位 + 0x80 续位标志，
 * 低位在前），不是定宽整数；如需对接 MQTT varint 应另加 encoding 选项。
 */
export class LengthFieldFrameParser implements FrameParser {
  /** 能读出长度字段所需收齐的字节数，即 lengthOffset + lengthBytes */
  readonly headerBytes: number;

  private readonly magic: number | undefined;
  private readonly syncScan: boolean;
  private readonly lengthOffset: number;
  private readonly lengthBytes: 1 | 2 | 3 | 4;
  private readonly littleEndian: boolean;
  private readonly lengthIncludesHeader: boolean;
  private buffer: Uint8Array = new Uint8Array(0);

  constructor(options: LengthFieldFrameParserOptions = {}) {
    const lengthOffset = options.lengthOffset ?? 1;
    if (!Number.isInteger(lengthOffset) || lengthOffset < 0) {
      throw new RangeError(`lengthOffset 必须是非负整数，实际为 ${lengthOffset}`);
    }
    const lengthBytes = options.lengthBytes ?? 1;
    if (lengthBytes < 1 || lengthBytes > 4) {
      throw new RangeError(`lengthBytes 必须是 1~4 的整数，实际为 ${lengthBytes}`);
    }
    this.magic = options.magic;
    this.syncScan = options.syncScan ?? false;
    this.lengthOffset = lengthOffset;
    this.lengthBytes = lengthBytes;
    this.littleEndian = options.littleEndian ?? false;
    this.lengthIncludesHeader = options.lengthIncludesHeader ?? false;
    this.headerBytes = lengthOffset + lengthBytes;
  }

  push(chunk: Uint8Array): Uint8Array[] {
    this.append(chunk);

    const frames: Uint8Array[] = [];
    let consumed = 0;

    while (consumed < this.buffer.length) {
      const available = this.buffer.length - consumed;
      // 缓冲不足以读出魔法+长度字段，等待更多数据（分包）
      if (available < this.headerBytes) break;

      // 魔法字节校验：不匹配则重同步（丢 1 字节续扫）或清空缓冲
      if (this.magic !== undefined && this.buffer[consumed] !== this.magic) {
        if (this.syncScan) {
          consumed += 1;
          continue;
        }
        this.buffer = new Uint8Array(0);
        return frames;
      }

      const value = this.readLength(consumed);
      // 帧总长：长度值含帧头时直接使用，否则为 headerBytes + 长度值
      const total = this.lengthIncludesHeader ? value : this.headerBytes + value;
      const minTotal = this.lengthIncludesHeader ? this.headerBytes : 1;
      if (total < minTotal || total > MAX_BUFFER_BYTES) {
        // 长度取值无效（噪声流或错位）：重同步扫描或清空缓冲兜底，防 OOM
        if (this.magic !== undefined && this.syncScan) {
          consumed += 1;
          continue;
        }
        this.buffer = new Uint8Array(0);
        return frames;
      }
      // 帧未收全，等待更多数据（分包）
      if (available < total) break;

      // 切出完整帧，继续循环处理粘包
      frames.push(this.buffer.slice(consumed, consumed + total));
      consumed += total;
    }

    if (consumed > 0) this.buffer = this.buffer.slice(consumed);
    if (this.buffer.length > MAX_BUFFER_BYTES) this.buffer = new Uint8Array(0);
    return frames;
  }

  reset(): void {
    this.buffer = new Uint8Array(0);
  }

  /** 从缓冲 base 处读出长度字段的数值（按配置的字节宽度与字节序） */
  private readLength(base: number): number {
    let value = 0;
    for (let i = 0; i < this.lengthBytes; i += 1) {
      const byte = this.buffer[base + this.lengthOffset + i] ?? 0;
      // 用乘法而非 <<，避免 4 字节大端时触发 32 位有符号溢出（0xFFFFFFFF → -1）
      value = this.littleEndian ? value + byte * 256 ** i : value * 256 + byte;
    }
    return value;
  }

  private append(chunk: Uint8Array): void {
    if (chunk.length === 0) return;
    const next = new Uint8Array(this.buffer.length + chunk.length);
    next.set(this.buffer);
    next.set(chunk, this.buffer.length);
    this.buffer = next;
  }
}

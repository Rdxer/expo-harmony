import type { FrameParser } from './frameParser';

/** 帧头 → 帧尾 的映射：0x1A 对应 0xAF；0xAA 对应 0xBF */
const HEADER_TO_TAIL: Record<number, number> = {
  0x1a: 0xaf,
  0xaa: 0xbf,
};

/** 待续缓冲上限，超过即清空，防止噪声/错位流导致内存无限增长（OOM） */
const MAX_BUFFER_BYTES = 4096;

/**
 * 分隔符式帧解析器（HIF 演示协议）。
 *
 * 解析流程：丢弃帧头之前的噪声字节 → 找到帧头后扫描对应帧尾 →
 * 找到则切出完整帧并继续循环（粘包）→ 找不到帧尾则保留缓冲返回空数组（分包等待）。
 */
export class HifFrameAssembler implements FrameParser {
  private buffer: Uint8Array = new Uint8Array(0);

  push(chunk: Uint8Array): Uint8Array[] {
    this.append(chunk);

    const frames: Uint8Array[] = [];
    let consumed = 0;

    while (consumed < this.buffer.length) {
      const headerIndex = this.indexOfHeader(consumed);
      if (headerIndex < 0) {
        // 剩余全是噪声字节（帧头之前），整体丢弃
        consumed = this.buffer.length;
        break;
      }

      const header = this.buffer[headerIndex]!;
      const tail = HEADER_TO_TAIL[header]!;
      const tailIndex = this.indexOf(tail, headerIndex + 1);
      if (tailIndex < 0) {
        // 帧尾未到齐（分包）：丢弃帧头之前的噪声，保留帧头及之后的数据等待续传
        consumed = headerIndex;
        break;
      }

      // 切出完整帧（含帧头帧尾），继续循环处理粘包
      frames.push(this.buffer.slice(headerIndex, tailIndex + 1));
      consumed = tailIndex + 1;
    }

    if (consumed > 0) this.buffer = this.buffer.slice(consumed);
    if (this.buffer.length > MAX_BUFFER_BYTES) this.buffer = new Uint8Array(0);
    return frames;
  }

  reset(): void {
    this.buffer = new Uint8Array(0);
  }

  private append(chunk: Uint8Array): void {
    if (chunk.length === 0) return;
    const next = new Uint8Array(this.buffer.length + chunk.length);
    next.set(this.buffer);
    next.set(chunk, this.buffer.length);
    this.buffer = next;
  }

  /** 从 from 开始找第一个已注册的帧头字节，找不到返回 -1 */
  private indexOfHeader(from: number): number {
    for (let i = from; i < this.buffer.length; i += 1) {
      const byte = this.buffer[i];
      if (byte !== undefined && HEADER_TO_TAIL[byte] !== undefined) return i;
    }
    return -1;
  }

  /** 从 from 开始找指定字节，找不到返回 -1 */
  private indexOf(byte: number, from: number): number {
    for (let i = from; i < this.buffer.length; i += 1) {
      if (this.buffer[i] === byte) return i;
    }
    return -1;
  }
}

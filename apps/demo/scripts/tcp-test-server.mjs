#!/usr/bin/env node
/**
 * HIF 帧本地 TCP 测试服务器（纯 Node 实现，无第三方依赖）。
 *
 * 收到任意字节后，按 --mode 回发两条演示帧（--frames 选择帧集）：
 *   hif（默认）—— HIF 分隔符式：
 *     帧 A（checkPassword 应答）：1A 05 00 FF FF FF FF FF AF
 *     帧 B：                     AA FF 1A 01 02 04 BF（载荷含 0x1A，可检验帧头误判防护）
 *   length —— 长度字段式（偏移 1 处 1 字节长度，不含 2 字节帧头）：
 *     帧 A：C1 05 11 22 33 44 55
 *     帧 B：C2 03 AA 1A AF（载荷含 0x1A/0xAF，验证分隔符字节按普通数据处理）
 *
 * 用法示例：
 *   node scripts/tcp-test-server.mjs
 *   node scripts/tcp-test-server.mjs --port 9001 --mode split --chunk 2 --delay 30
 *   node scripts/tcp-test-server.mjs --frames length --mode sticky
 * 
 * cd scripts

# 1 字节长度字段（默认配置：偏移 1、不含帧头） 
node tcp-test-server.mjs --frames length

# 4 字节小端长度字段
node tcp-test-server.mjs --frames length4

# 也可以组合其他模式，比如分片传输
node tcp-test-server.mjs --frames length --mode split --chunk 3

 * 
 */

import net from 'node:net';

const MODES = ['whole', 'split', 'sticky'];
const FRAME_SETS = ['hif', 'length', 'length4'];
const DEFAULTS = { port: 9000, mode: 'whole', chunk: 3, delay: 50, frames: 'hif' };

// HIF 分隔符式帧（0x1A↔0xAF / 0xAA↔0xBF），配 HifFrameAssembler
const FRAME_A = Uint8Array.from([0x1a, 0x05, 0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xaf]);
const FRAME_B = Uint8Array.from([0xaa, 0xff, 0x1a, 0x01, 0x02, 0x04, 0xbf]);

// 长度字段式帧（偏移 1 处 1 字节长度，长度不含 2 字节帧头），配 LengthFieldFrameParser 默认配置
// 载荷故意混入 0x1A/0xAF，验证分隔符字节在长度字段式下只是普通数据
const LEN_A = Uint8Array.from([0xc1, 0x05, 0x11, 0x22, 0x33, 0x44, 0x55]);
const LEN_B = Uint8Array.from([0xc2, 0x03, 0xaa, 0x1a, 0xaf]);

// 4 字节小端长度帧（偏移 1~4 处为长度低位在前，长度不含 5 字节帧头，魔法字节统一 0xC1）
// 长度 5 = 05 00 00 00，长度 3 = 03 00 00 00
const LEN4_A = Uint8Array.from([0xc1, 0x05, 0x00, 0x00, 0x00, 0x11, 0x22, 0x33, 0x44, 0x55]);
const LEN4_B = Uint8Array.from([0xc1, 0x03, 0x00, 0x00, 0x00, 0xaa, 0x1a, 0xaf]);

function fail(message) {
  console.error(`[tcp-test-server] ${message}`);
  process.exit(1);
}

function parseInteger(name, raw, min, max) {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    fail(`参数 --${name} 必须是 ${min}~${max} 的整数，实际为：${raw}`);
  }
  return value;
}

function parseArgs(argv) {
  const options = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) fail(`无法识别的参数：${arg}（仅支持 --key value 或 --key=value）`);
    const eq = arg.indexOf('=');
    const key = (eq === -1 ? arg : arg.slice(0, eq)).slice(2);
    const raw = eq === -1 ? argv[(i += 1)] : arg.slice(eq + 1);
    if (raw === undefined || raw === '') fail(`参数 --${key} 缺少取值`);
    switch (key) {
      case 'port':
        options.port = parseInteger('port', raw, 1, 65535);
        break;
      case 'mode':
        if (!MODES.includes(raw)) fail(`参数 --mode 必须是 ${MODES.join('|')}，实际为：${raw}`);
        options.mode = raw;
        break;
      case 'frames':
        if (!FRAME_SETS.includes(raw)) fail(`参数 --frames 必须是 ${FRAME_SETS.join('|')}，实际为：${raw}`);
        options.frames = raw;
        break;
      case 'chunk':
        options.chunk = parseInteger('chunk', raw, 1, 65535);
        break;
      case 'delay':
        options.delay = parseInteger('delay', raw, 0, 600000);
        break;
      default:
        fail(`无法识别的参数：--${key}`);
    }
  }
  return options;
}

function hex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(' ');
}

function concatFrames(frames) {
  const total = frames.reduce((sum, frame) => sum + frame.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const frame of frames) {
    out.set(frame, offset);
    offset += frame.length;
  }
  return out;
}

const options = parseArgs(process.argv.slice(2));
const frames = options.frames === 'length4' ? [LEN4_A, LEN4_B]
  : options.frames === 'length' ? [LEN_A, LEN_B]
  : [FRAME_A, FRAME_B];
const payload = concatFrames(frames);
const connLabels = new WeakMap();
let connSeq = 0;

const server = net.createServer((socket) => {
  connSeq += 1;
  const label = `[conn ${connSeq} ${socket.remoteAddress}:${socket.remotePort}]`;
  connLabels.set(socket, label);
  console.log(`${label} 已连接（mode=${options.mode}）`);

  let replying = false;

  const finishReply = () => {
    replying = false;
    console.log(`${label} 回发完成：2 帧 / ${payload.length} 字节`);
  };

  const replyWhole = () => {
    for (const [index, frame] of frames.entries()) {
      socket.write(frame);
      console.log(`${label} whole：第 ${index + 1} 帧单独发送（${frame.length} 字节）: ${hex(frame)}`);
    }
    finishReply();
  };

  const replySplit = () => {
    const pieces = [];
    for (let i = 0; i < payload.length; i += options.chunk) {
      pieces.push(payload.subarray(i, i + options.chunk));
    }
    console.log(
      `${label} split：${payload.length} 字节 → ${pieces.length} 片`
      + `（每片 ≤${options.chunk} 字节，间隔 ${options.delay}ms）`,
    );
    pieces.forEach((piece, index) => {
      setTimeout(() => {
        socket.write(piece);
        console.log(`${label} split：分片 ${index + 1}/${pieces.length}（${piece.length} 字节）: ${hex(piece)}`);
        if (index === pieces.length - 1) finishReply();
      }, options.delay * index);
    });
  };

  const replySticky = () => {
    socket.write(payload);
    console.log(`${label} sticky：两帧拼接后一次性发送（${payload.length} 字节）: ${hex(payload)}`);
    finishReply();
  };

  const replies = { whole: replyWhole, split: replySplit, sticky: replySticky };

  socket.on('data', (data) => {
    console.log(`${label} 收到 ${data.length} 字节: ${hex(data)}`);
    if (replying) {
      console.log(`${label} 上一次回发尚未完成，忽略本次触发`);
      return;
    }
    replying = true;
    replies[options.mode]();
  });

  socket.on('error', (error) => {
    console.error(`${label} 连接错误: ${error.message}`);
  });
  socket.on('close', () => {
    console.log(`${label} 已断开`);
  });
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    fail(`端口 ${options.port} 已被占用`);
  }
  fail(`服务器错误: ${error.message}`);
});

server.listen(options.port, () => {
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : options.port;
  console.log(
    `[tcp-test-server] 监听端口 ${port}（mode=${options.mode}`
    + `${options.mode === 'split' ? `，chunk=${options.chunk}，delay=${options.delay}ms` : ''}）`,
  );
  console.log('[tcp-test-server] 帧 A: ' + hex(frames[0]));
  console.log('[tcp-test-server] 帧 B: ' + hex(frames[1]));
});

process.on('SIGINT', () => {
  console.log('\n[tcp-test-server] 收到 SIGINT，关闭服务器');
  server.close(() => process.exit(0));
});

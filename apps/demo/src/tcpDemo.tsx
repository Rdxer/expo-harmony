import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { HifFrameAssembler } from './tcp/HifFrameAssembler';
import { LengthFieldFrameParser } from './tcp/LengthFieldFrameParser';
import type { FrameParser } from './tcp/frameParser';
import { TcpClient } from './tcp/TcpClient';
import { palette } from './theme';
import { ActionButton, ActionRow, DataRow, Field, Note, Panel, Tag } from './ui';

type ParserKind = 'hif' | 'length';

type ConnState = 'idle' | 'connecting' | 'connected' | 'closed' | 'error';

type LogEntry = { id: number; text: string };

const CONNECT_TIMEOUT_MS = 10000;
const MAX_LOG_ENTRIES = 50;
/** 单条日志最多展示的字节数，防止大片段撑爆渲染 */
const MAX_HEX_BYTES_PER_LOG = 64;

const CONN_STATE_LABELS: Record<ConnState, string> = {
  closed: '已断开',
  connected: '已连接',
  connecting: '连接中',
  error: '错误',
  idle: '未连接',
};

const CONN_STATE_TONES: Record<ConnState, 'neutral' | 'signal' | 'success' | 'danger'> = {
  closed: 'neutral',
  connected: 'success',
  connecting: 'signal',
  error: 'danger',
  idle: 'neutral',
};

function createParser(kind: ParserKind): FrameParser {
  return kind === 'hif'
    ? new HifFrameAssembler()
    // 4 字节小端长度（不含 5 字节帧头）+ 魔法字节 0xC1 校验 + 错位重同步
    : new LengthFieldFrameParser({ magic: 0xc1, lengthBytes: 4, littleEndian: true, syncScan: true });
}

/** 字节转十六进制文本（空格分隔、大写），超长片段截断展示 */
function toHex(bytes: Uint8Array): string {
  const shown = bytes.length > MAX_HEX_BYTES_PER_LOG ? bytes.subarray(0, MAX_HEX_BYTES_PER_LOG) : bytes;
  const text = Array.from(shown, byte => byte.toString(16).padStart(2, '0')).join(' ').toUpperCase();
  return bytes.length > MAX_HEX_BYTES_PER_LOG ? `${text} …（共 ${bytes.length} 字节）` : text;
}

/** 十六进制文本转字节（容忍空格与 0x 前缀，忽略其他非法字符） */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '').replace(/^0x/i, '').replace(/[^0-9a-fA-F]/g, '');
  if (clean.length % 2 !== 0) throw new Error('十六进制长度必须为偶数');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

export function TcpDemo() {
  const [host, setHost] = useState('192.168.2.104');
  const [portText, setPortText] = useState('9000');
  const [connState, setConnState] = useState<ConnState>('idle');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [parserKind, setParserKind] = useState<ParserKind>('hif');
  const [hexInput, setHexInput] = useState('1A 01 A1 23 45 66 AF');
  const [sendError, setSendError] = useState<string | null>(null);
  const [rawLog, setRawLog] = useState<LogEntry[]>([]);
  const [frameLog, setFrameLog] = useState<LogEntry[]>([]);

  const clientRef = useRef<TcpClient | null>(null);
  const parserRef = useRef<FrameParser | null>(null);
  if (parserRef.current === null) parserRef.current = createParser('hif');
  const connectingRef = useRef(false);
  const chunkSeqRef = useRef(0);
  const logIdRef = useRef(0);
  // 用 ref 镜像维护日志数组：updater 形式的 setState 在 dev 下可能被 double-invoke，
  // 在 updater 内读 ref 会产生重复条目（duplicate key），因此全部在 updater 外构建
  const rawLogRef = useRef<LogEntry[]>([]);
  const frameLogRef = useRef<LogEntry[]>([]);

  useEffect(() => {
    const client = new TcpClient();
    clientRef.current = client;

    // 用 ref 镜像维护日志数组（定义见组件顶层），updater 外构建，避免 duplicate key
    const appendRaw = (text: string) => {
      logIdRef.current += 1;
      rawLogRef.current = [{ id: logIdRef.current, text }, ...rawLogRef.current].slice(0, MAX_LOG_ENTRIES);
      setRawLog(rawLogRef.current);
    };
    const appendFrame = (text: string) => {
      logIdRef.current += 1;
      frameLogRef.current = [{ id: logIdRef.current, text }, ...frameLogRef.current].slice(0, MAX_LOG_ENTRIES);
      setFrameLog(frameLogRef.current);
    };

    const unsubscribeData = client.onData((chunk) => {
      chunkSeqRef.current += 1;
      const seq = chunkSeqRef.current;
      appendRaw(`#${seq} · ${chunk.length}B · ${toHex(chunk)}`);
      const parser = parserRef.current;
      if (!parser) return;
      parser.push(chunk).forEach((frame, index) => {
        appendFrame(`#${seq} 帧${index + 1} · ${frame.length}B · ${toHex(frame)}`);
      });
    });
    const unsubscribeClose = client.onClose(() => {
      // 连接流程内部会先销毁旧 socket 触发一次 close，连接中不应据此改写状态
      if (connectingRef.current) return;
      setConnState('closed');
    });
    const unsubscribeError = client.onError((error) => {
      setErrorText(error.message);
      setConnState('error');
    });

    return () => {
      unsubscribeData();
      unsubscribeClose();
      unsubscribeError();
      client.destroy();
      clientRef.current = null;
    };
  }, []);

  const parsedPort = Number.parseInt(portText.trim(), 10);
  const canConnect = host.trim().length > 0
    && Number.isInteger(parsedPort)
    && parsedPort >= 1
    && parsedPort <= 65535;

  const connect = () => {
    const client = clientRef.current;
    if (!client || !canConnect) return;

    setErrorText(null);
    connectingRef.current = true;
    chunkSeqRef.current = 0;
    setRawLog([]);
    setFrameLog([]);
    rawLogRef.current = [];
    frameLogRef.current = [];
    setConnState('connecting');

    void client.connect({ host: host.trim(), port: parsedPort, timeout: CONNECT_TIMEOUT_MS }).then(() => {
      connectingRef.current = false;
      setConnState('connected');
    }).catch((error: unknown) => {
      connectingRef.current = false;
      setErrorText(error instanceof Error ? error.message : String(error));
      setConnState('error');
    });
  };

  const disconnect = () => {
    const client = clientRef.current;
    if (!client) return;
    connectingRef.current = false;
    setErrorText(null);
    // destroy 触发的 onClose 会把状态置为「已断开」
    client.destroy();
  };

  const switchParser = (kind: ParserKind) => {
    setParserKind(kind);
    // 换用全新实例：内部缓冲为空，等价于先 reset 再切换
    parserRef.current = createParser(kind);
  };

  const sendHex = () => {
    const client = clientRef.current;
    if (!client || !client.isConnected()) return;
    try {
      const bytes = hexToBytes(hexInput);
      if (bytes.length === 0) throw new Error('请输入至少一个字节的十六进制数据');
      setSendError(null);
      client.send(bytes);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <>
      <Panel eyebrow="连接" title="TCP 服务器">
        <Field
          label="主机地址"
          onChangeText={setHost}
          placeholder="192.168.1.100"
          value={host}
        />
        <Field
          keyboardType="numeric"
          label="端口"
          onChangeText={setPortText}
          value={portText}
        />
        <DataRow label="连接状态" value={<Tag tone={CONN_STATE_TONES[connState]}>{CONN_STATE_LABELS[connState]}</Tag>} />
        <DataRow label="当前解析器" value={parserKind === 'hif' ? 'HIF 分隔符式' : '长度字段式'} />
        <ActionRow>
          <ActionButton
            disabled={connState === 'connecting' || connState === 'connected' || !canConnect}
            label="连接"
            onPress={connect}
            testID="tcp-connect"
          />
          <ActionButton
            disabled={connState !== 'connecting' && connState !== 'connected'}
            label="断开"
            onPress={disconnect}
            testID="tcp-disconnect"
            tone="danger"
          />
        </ActionRow>
        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
        <Note>连接超时 10 秒。断开后可修改地址重新连接；离开页面会自动销毁连接并取消所有订阅。</Note>
      </Panel>

      <Panel eyebrow="帧解析" title="选择 FrameParser">
        <View style={styles.methodRow}>
          <ActionButton
            label="HIF 分隔符式"
            onPress={() => switchParser('hif')}
            tone={parserKind === 'hif' ? 'primary' : 'secondary'}
          />
          <ActionButton
            label="长度字段式"
            onPress={() => switchParser('length')}
            tone={parserKind === 'length' ? 'primary' : 'secondary'}
          />
        </View>
        <Note>
          HIF 分隔符式按 0x1A→0xAF、0xAA→0xBF 帧头帧尾切帧；长度字段式配置为魔法字节 0xC1、长度字段偏移 1、宽度 4 字节小端、长度不含 5 字节帧头、开启错位重同步。
          连接期间也可切换：会换用全新实例，内部缓冲清空（等价 reset），后续字节按新解析器重新同步。
        </Note>
      </Panel>

      <Panel eyebrow="发送" title="十六进制报文">
        <Field
          label="HEX 数据（容忍空格）"
          onChangeText={setHexInput}
          placeholder="1A 01 A1 23 45 66 AF"
          value={hexInput}
        />
        <ActionRow>
          <ActionButton disabled={connState !== 'connected'} label="发送" onPress={sendHex} testID="tcp-send" />
        </ActionRow>
        {sendError ? <Text style={styles.errorText}>{sendError}</Text> : null}
        <Note>未连接时无法发送。示例为一条完整 HIF 帧：帧头 0x1A，帧尾 0xAF。</Note>
      </Panel>

      <Panel eyebrow="原始片段" title={`onData · ${rawLog.length} 条`}>
        {rawLog.length === 0
          ? <Note>尚未收到数据。连接后每个 TCP 数据片段（序号 · 字节数 · hex）都会记录在此。</Note>
          : (
            <View style={styles.logBox}>
              {rawLog.map(entry => <Text key={entry.id} style={styles.logLine}>{entry.text}</Text>)}
            </View>
          )}
        <ActionRow>
          <ActionButton
            disabled={rawLog.length === 0}
            label="清空"
            onPress={() => { rawLogRef.current = []; setRawLog([]); }}
            tone="secondary"
          />
        </ActionRow>
      </Panel>

      <Panel eyebrow="解析帧" title={`parser.push · ${frameLog.length} 条`}>
        {frameLog.length === 0
          ? <Note>尚未解析出完整帧。分包（帧拆多次到达）与粘包（多帧一次到达）都能在此观察。</Note>
          : (
            <View style={styles.logBox}>
              {frameLog.map(entry => <Text key={entry.id} style={styles.logLine}>{entry.text}</Text>)}
            </View>
          )}
        <ActionRow>
          <ActionButton
            disabled={frameLog.length === 0}
            label="清空"
            onPress={() => { frameLogRef.current = []; setFrameLog([]); }}
            tone="secondary"
          />
        </ActionRow>
      </Panel>
    </>
  );
}

const styles = StyleSheet.create({
  errorText: { color: palette.danger, fontSize: 12, lineHeight: 17 },
  logBox: {
    backgroundColor: palette.canvas,
    borderRadius: 8,
    gap: 2,
    maxHeight: 220,
    overflow: 'hidden',
    padding: 10,
  },
  logLine: { color: palette.muted, fontFamily: 'monospace', fontSize: 10, lineHeight: 15 },
  methodRow: { flexDirection: 'row', gap: 10 },
});

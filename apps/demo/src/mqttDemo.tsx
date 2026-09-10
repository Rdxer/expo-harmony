import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';

import { MqttClient, type MqttMessage, type MqttQos } from './mqtt/MqttClient';
import { palette } from './theme';
import { ActionButton, ActionRow, DataRow, Field, Note, Panel, Tag } from './ui';

type ConnState = 'idle' | 'connecting' | 'connected' | 'closed' | 'error';

type LogEntry = { id: number; text: string };

const MAX_LOG_ENTRIES = 50;
/** 单条消息日志最多展示的 payload 字节数 */
const MAX_PAYLOAD_CHARS = 96;

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

/** 当前时间 HH:MM:SS（鸿蒙 Hermes 无 Intl，不能依赖 toLocaleTimeString） */
function nowTime(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** payload 展示：可打印则按 UTF-8 文本，否则回退到十六进制，超长截断 */
function formatPayload(bytes: Uint8Array): string {
  const shown = bytes.length > MAX_PAYLOAD_CHARS ? bytes.subarray(0, MAX_PAYLOAD_CHARS) : bytes;
  let printable = true;
  for (let i = 0; i < shown.length; i += 1) {
    const code = shown[i]!;
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      printable = false;
      break;
    }
  }
  let text: string;
  if (printable) {
    text = new TextDecoder().decode(shown);
  } else {
    text = Array.from(shown, b => b.toString(16).padStart(2, '0')).join(' ').toUpperCase();
  }
  return bytes.length > MAX_PAYLOAD_CHARS ? `${text} …（共 ${bytes.length} 字节）` : text;
}

export function MqttDemo() {
  // ---- 连接配置（默认填充用户提供的测试 Broker） ----
  const [url, setUrl] = useState('ws://119.29.206.224:31884/mqtt');
  const [clientId, setClientId] = useState(`mqttx_ws_${Math.random().toString(16).slice(2, 10)}`);
  const [username, setUsername] = useState('mqttx_ws_expotest1');
  const [password, setPassword] = useState('mqttx_ws_expotest1');

  const [connState, setConnState] = useState<ConnState>('idle');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [connAckText, setConnAckText] = useState<string | null>(null);

  // ---- 订阅 ----
  const [subTopic, setSubTopic] = useState('expo/demo');
  const [subQos, setSubQos] = useState<MqttQos>(0);
  const [subscriptions, setSubscriptions] = useState<Record<string, MqttQos>>({});

  // ---- 发布 ----
  const [pubTopic, setPubTopic] = useState('expo/demo');
  const [pubPayload, setPubPayload] = useState('hello from expo-harmony demo');
  const [pubQos, setPubQos] = useState<MqttQos>(0);
  const [pubRetain, setPubRetain] = useState(false);

  // ---- 日志 ----
  const [msgLog, setMsgLog] = useState<LogEntry[]>([]);
  const [eventLog, setEventLog] = useState<LogEntry[]>([]);

  const clientRef = useRef<MqttClient | null>(null);
  const connectingRef = useRef(false);
  const logIdRef = useRef(0);
  // ref 镜像数组：updater 形式 setState 在 dev 下可能 double-invoke，
  // updater 内读 ref 会产生重复条目（duplicate key），全部在 updater 外构建
  const msgLogRef = useRef<LogEntry[]>([]);
  const eventLogRef = useRef<LogEntry[]>([]);

  // 追加日志（appender 全部在 updater 外构建，避免 dev 下 duplicate key）
  const appendMsg = (text: string) => {
    logIdRef.current += 1;
    msgLogRef.current = [{ id: logIdRef.current, text }, ...msgLogRef.current].slice(0, MAX_LOG_ENTRIES);
    setMsgLog(msgLogRef.current);
  };
  const appendEvent = (text: string) => {
    logIdRef.current += 1;
    eventLogRef.current = [{ id: logIdRef.current, text }, ...eventLogRef.current].slice(0, MAX_LOG_ENTRIES);
    setEventLog(eventLogRef.current);
  };

  useEffect(() => {
    const client = new MqttClient();
    clientRef.current = client;

    const unsubscribeMessage = client.onMessage((message: MqttMessage) => {
      appendMsg(
        `[${nowTime()}] ${message.topic} · QoS ${message.qos}${message.retain ? ' · retain' : ''}\n  ${formatPayload(message.payload)}`,
      );
    });
    const unsubscribeClose = client.onClose(() => {
      // 连接流程内部会先销毁旧连接触发一次 close，连接中不应据此改写状态
      if (connectingRef.current) return;
      setConnState('closed');
    });
    const unsubscribeError = client.onError((error) => {
      appendEvent(`[${nowTime()}] 连接出错：${error.message}`);
      setErrorText(error.message);
      setConnState('error');
    });

    return () => {
      unsubscribeMessage();
      unsubscribeClose();
      unsubscribeError();
      client.destroy();
      clientRef.current = null;
    };
  }, []);

  const canConnect = url.trim().length > 0 && /^wss?:\/\//i.test(url.trim()) && clientId.trim().length > 0;

  const connect = () => {
    const client = clientRef.current;
    if (!client || !canConnect) return;

    setErrorText(null);
    setConnAckText(null);
    connectingRef.current = true;
    logIdRef.current = 0;
    msgLogRef.current = [];
    eventLogRef.current = [];
    setMsgLog([]);
    setEventLog([]);
    setConnState('connecting');

    void client.connect({
      clientId: clientId.trim(),
      connectTimeoutMs: 15000,
      keepalive: 30,
      password,
      url: url.trim(),
      username,
    }).then((ack) => {
      connectingRef.current = false;
      setConnAckText(
        `returnCode=${ack.returnCode}（${ack.description}）${ack.sessionPresent ? ' · 会话延续' : ' · 全新会话'}`,
      );
      setConnState('connected');
      appendEvent(`[${nowTime()}] MQTT 连接成功 → ${url.trim()}`);
    }).catch((error: unknown) => {
      connectingRef.current = false;
      const message = error instanceof Error ? error.message : String(error);
      setErrorText(message);
      setConnState('error');
    });
  };

  const disconnect = () => {
    const client = clientRef.current;
    if (!client) return;
    connectingRef.current = false;
    client.disconnect();
  };

  const subscribe = async () => {
    const client = clientRef.current;
    const topic = subTopic.trim();
    if (!client || !client.isConnected()) return;
    if (!topic) {
      setErrorText('订阅主题不能为空');
      return;
    }
    setErrorText(null);
    try {
      const granted = await client.subscribe(topic, subQos);
      setSubscriptions(prev => ({ ...prev, [topic]: granted }));
      appendEvent(`[${nowTime()}] 已订阅 ${topic}（授予 QoS ${granted}）`);
    } catch (error) {
      appendEvent(`[${nowTime()}] 订阅失败 ${topic}：${error instanceof Error ? error.message : String(error)}`);
      setErrorText(error instanceof Error ? error.message : String(error));
    }
  };

  const unsubscribe = async (topic: string) => {
    const client = clientRef.current;
    if (!client) return;
    try {
      await client.unsubscribe(topic);
      setSubscriptions(prev => {
        const next = { ...prev };
        delete next[topic];
        return next;
      });
      appendEvent(`[${nowTime()}] 已取消订阅 ${topic}`);
    } catch (error) {
      appendEvent(`[${nowTime()}] 退订失败 ${topic}：${error instanceof Error ? error.message : String(error)}`);
      setErrorText(error instanceof Error ? error.message : String(error));
    }
  };

  const publish = async () => {
    const client = clientRef.current;
    const topic = pubTopic.trim();
    if (!client || !client.isConnected()) return;
    if (!topic) {
      setErrorText('发布主题不能为空');
      return;
    }
    setErrorText(null);
    try {
      await client.publish(topic, pubPayload, { qos: pubQos, retain: pubRetain });
      appendEvent(
        `[${nowTime()}] 已发布 → ${topic}（QoS ${pubQos}${pubRetain ? ' · retain' : ''}） · ${pubPayload.length} 字符`,
      );
    } catch (error) {
      appendEvent(`[${nowTime()}] 发布失败：${error instanceof Error ? error.message : String(error)}`);
      setErrorText(error instanceof Error ? error.message : String(error));
    }
  };

  const subscriptionEntries = Object.entries(subscriptions);

  return (
    <>
      <Panel eyebrow="连接" title="MQTT Broker（WebSocket）">
        <Field label="服务地址 (ws:// 或 wss://)" onChangeText={setUrl} placeholder="ws://host:port/mqtt" value={url} />
        <Field label="Client ID" onChangeText={setClientId} placeholder="mqttx_ws_expotest1" value={clientId} />
        <Field label="用户名" onChangeText={setUsername} value={username} />
        <Field label="密码" onChangeText={setPassword} secureTextEntry value={password} />
        <DataRow label="连接状态" value={<Tag tone={CONN_STATE_TONES[connState]}>{CONN_STATE_LABELS[connState]}</Tag>} />
        <DataRow label="keepalive" value="30 秒 / 保活+超时检测" />
        <ActionRow>
          <ActionButton
            disabled={connState === 'connecting' || connState === 'connected' || !canConnect}
            label="连接"
            onPress={connect}
            testID="mqtt-connect"
          />
          <ActionButton
            disabled={connState !== 'connecting' && connState !== 'connected'}
            label="断开"
            onPress={disconnect}
            testID="mqtt-disconnect"
            tone="danger"
          />
        </ActionRow>
        {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
        {connAckText ? <DataRow label="CONNACK" value={connAckText} /> : null}
        <Note>
          连接超时 15 秒。基于 RN 内置 WebSocket 的自研 MQTT 3.1.1 客户端，三端（iOS / Android / HarmonyOS）零依赖。
          连接成功后每空闲 30 秒发一次 PINGREQ，超过 2 个 keepalive 周期没收到数据判为心跳超时。
        </Note>
      </Panel>

      <Panel eyebrow="订阅" title={subscriptionEntries.length > 0 ? `已订阅 ${subscriptionEntries.length} 个主题` : '首次订阅'}>
        <Field label="主题过滤器" onChangeText={setSubTopic} placeholder="expo/demo" value={subTopic} />
        <View style={styles.methodRow}>
          <ActionButton label="QoS 0" onPress={() => setSubQos(0)} tone={subQos === 0 ? 'primary' : 'secondary'} />
          <ActionButton label="QoS 1" onPress={() => setSubQos(1)} tone={subQos === 1 ? 'primary' : 'secondary'} />
        </View>
        <ActionRow>
          <ActionButton
            disabled={connState !== 'connected' || subTopic.trim().length === 0}
            label="订阅"
            onPress={() => void subscribe()}
            testID="mqtt-subscribe"
          />
        </ActionRow>
        {subscriptionEntries.length > 0
          ? (
              <View style={styles.logBox}>
                {subscriptionEntries.map(([topic, qos]) => (
                  <View key={topic} style={styles.subRow}>
                    <Text style={styles.logLine}>{topic} · QoS {qos}</Text>
                    <ActionButton
                      label="退订"
                      onPress={() => void unsubscribe(topic)}
                      testID={`mqtt-unsubscribe-${topic}`}
                      tone="secondary"
                    />
                  </View>
                ))}
              </View>
            )
          : <Note>订阅后，发往该主题的消息会实时出现在下方「接收消息」面板。支持通配符，如 expo/#。</Note>}
      </Panel>

      <Panel eyebrow="发布" title="PUBLISH">
        <Field label="主题" onChangeText={setPubTopic} placeholder="expo/demo" value={pubTopic} />
        <Field label="消息内容（UTF-8 文本）" onChangeText={setPubPayload} value={pubPayload} />
        <View style={styles.methodRow}>
          <ActionButton label="QoS 0" onPress={() => setPubQos(0)} tone={pubQos === 0 ? 'primary' : 'secondary'} />
          <ActionButton label="QoS 1" onPress={() => setPubQos(1)} tone={pubQos === 1 ? 'primary' : 'secondary'} />
        </View>
        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={styles.switchTitle}>Retain</Text>
            <Text style={styles.switchCaption}>让 Broker 保留最后一条消息，新订阅者立即收到。</Text>
          </View>
          <Switch
            onValueChange={setPubRetain}
            thumbColor={pubRetain ? palette.signal : palette.muted}
            trackColor={{ false: palette.lineStrong, true: palette.signalSoft }}
            value={pubRetain}
          />
        </View>
        <ActionRow>
          <ActionButton
            disabled={connState !== 'connected' || pubTopic.trim().length === 0}
            label="发布消息"
            onPress={() => void publish()}
            testID="mqtt-publish"
          />
        </ActionRow>
      </Panel>

      <Panel eyebrow="接收消息" title={`onMessage · ${msgLog.length} 条`}>
        {msgLog.length === 0
          ? <Note>尚未收到消息。请订阅主题后再试，或从另一个客户端向已订阅主题发布。</Note>
          : (
              <View style={styles.logBox}>
                {msgLog.map(entry => <Text key={entry.id} selectable style={styles.logLine}>{entry.text}</Text>)}
              </View>
            )}
        <ActionRow>
          <ActionButton
            disabled={msgLog.length === 0}
            label="清空"
            onPress={() => { msgLogRef.current = []; setMsgLog([]); }}
            tone="secondary"
          />
        </ActionRow>
      </Panel>

      <Panel eyebrow="事件日志" title={`连接/订阅/发布 · ${eventLog.length} 条`}>
        {eventLog.length === 0
          ? <Note>连接、断开、心跳超时、订阅与发布的结果都会记录在此。</Note>
          : (
              <View style={styles.logBox}>
                {eventLog.map(entry => <Text key={entry.id} selectable style={styles.logLine}>{entry.text}</Text>)}
              </View>
            )}
        <ActionRow>
          <ActionButton
            disabled={eventLog.length === 0}
            label="清空"
            onPress={() => { eventLogRef.current = []; setEventLog([]); }}
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
    maxHeight: 240,
    overflow: 'hidden',
    padding: 10,
  },
  logLine: { color: palette.muted, fontFamily: 'monospace', fontSize: 10, lineHeight: 15 },
  methodRow: { flexDirection: 'row', gap: 10 },
  subRow: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  switchRow: { alignItems: 'center', flexDirection: 'row', gap: 16, justifyContent: 'space-between' },
  switchCopy: { flex: 1, gap: 4 },
  switchTitle: { color: palette.text, fontSize: 16, fontWeight: '700' },
  switchCaption: { color: palette.muted, fontSize: 12, lineHeight: 18 },
});

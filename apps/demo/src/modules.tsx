import AntDesign from '@expo/vector-icons/AntDesign';
import * as Application from 'expo-application';
import { Asset } from 'expo-asset';
import * as BackgroundFetch from 'expo-background-fetch';
import * as BackgroundTask from 'expo-background-task';
import * as Battery from 'expo-battery';
import Constants from 'expo-constants';
import { CameraView, useCameraPermissions } from 'expo-camera';
import type { CameraCapturedPicture, CameraType } from 'expo-camera';
import { Directory, File, Paths } from 'expo-file-system';
import * as Font from 'expo-font';
import {
  activateKeepAwakeAsync,
  deactivateKeepAwake,
  isAvailableAsync,
  useKeepAwake,
} from 'expo-keep-awake';
import * as Linking from 'expo-linking';
import { LinearGradient } from 'expo-linear-gradient';
import * as NavigationBar from 'expo-navigation-bar';
import * as Network from 'expo-network';
import * as Sharing from 'expo-sharing';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import * as TaskManager from 'expo-task-manager';
import { fetch as expoFetch } from 'expo/fetch';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, PermissionsAndroid, Platform, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { BleNitro, BleNitroManager, type AsyncSubscription, type BLEDevice } from 'react-native-ble-nitro';

import { antDesignFontAsset, DYNAMIC_FONT_FAMILY } from './fixtures';
import { AppMetricsDemo } from './appMetrics';
import { AudioDemo } from './audio';
import {
  BACKGROUND_FETCH_OPTIONS,
  BACKGROUND_FETCH_TASK,
  getBackgroundFetchExecution,
  subscribeToBackgroundFetchExecution,
} from './backgroundFetch';
import {
  BACKGROUND_TASK,
  BACKGROUND_TASK_OPTIONS,
  getBackgroundTaskExecution,
  subscribeToBackgroundTaskExecution,
} from './backgroundTask';
import type { ModuleId } from './catalog';
import { ExpoModulesDemo } from './expoModules/ExpoModulesDemo';
import { HapticsDemo } from './haptics';
import { AdditionalModuleDemo } from './packageScreens';
import { palette } from './theme';
import {
  ActionButton,
  ActionRow,
  DataRow,
  Field,
  Note,
  Panel,
  ResultPanel,
  Tag,
  useAsyncResult,
} from './ui';

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

const BATTERY_STATE_LABELS: Record<Battery.BatteryState, string> = {
  [Battery.BatteryState.UNKNOWN]: '未知',
  [Battery.BatteryState.UNPLUGGED]: '未充电',
  [Battery.BatteryState.CHARGING]: '充电中',
  [Battery.BatteryState.FULL]: '已充满',
};

function batteryLevelLabel(level: number): string {
  return level < 0 ? '未知' : `${Math.round(level * 100)}%`;
}

function isBatteryLevel(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -1 && value <= 1;
}

function isBatteryState(value: unknown): value is Battery.BatteryState {
  return typeof value === 'number' && Object.prototype.hasOwnProperty.call(BATTERY_STATE_LABELS, value);
}

function photoSummary(photo: CameraCapturedPicture): string {
  return json({
    exifKeys: photo.exif ? Object.keys(photo.exif).sort() : [],
    format: photo.format,
    height: photo.height,
    uri: photo.uri,
    width: photo.width,
  });
}

function CameraDemo() {
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(true);
  const action = useAsyncResult();

  if (!permission) {
    return (
      <Panel eyebrow="相机权限" title="读取原生权限状态">
        <Tag>加载中</Tag>
      </Panel>
    );
  }

  if (!permission.granted) {
    return (
      <Panel eyebrow="相机权限" title="允许使用虚拟相机">
        <DataRow label="状态" value={permission.status} />
        <DataRow label="可再次询问" value={String(permission.canAskAgain)} />
        <ActionButton
          disabled={!permission.canAskAgain}
          label="申请相机权限"
          onPress={() => void requestPermission()}
          testID="camera-request-permission"
        />
      </Panel>
    );
  }

  const takePhoto = () => action.run(async () => {
    const photo = await camera.current?.takePictureAsync({ exif: true, quality: 0.82 });
    if (!photo) throw new Error('相机未返回拍摄结果。');

    return photoSummary(photo);
  });

  const takeRef = () => action.run(async () => {
    const picture = await camera.current?.takePictureAsync({ pictureRef: true });
    if (!picture) throw new Error('相机未返回图片引用。');

    const saved = await picture.savePictureAsync({ quality: 0.73 });

    return json({
      height: picture.height,
      saved,
      width: picture.width,
    });
  });

  const inspect = () => action.run(async () => {
    const [available, codecs, lenses, sizes] = await Promise.all([
      CameraView.isAvailableAsync(),
      CameraView.getAvailableVideoCodecsAsync(),
      camera.current?.getAvailableLensesAsync() ?? Promise.resolve([]),
      camera.current?.getAvailablePictureSizesAsync() ?? Promise.resolve([]),
    ]);

    return json({ available, codecs, lenses, sizes: sizes.slice(0, 12) });
  });

  return (
    <>
      <Panel eyebrow="CAMERAKIT 画面" title="Harmony 实时预览">
        <View style={styles.cameraFrame}>
          {active
            ? (
                <CameraView
                  active
                  animateShutter
                  facing={facing}
                  onCameraReady={() => setReady(true)}
                  onMountError={(error) => {
                    setReady(false);
                    void action.run(() => {
                      throw new Error(error.message);
                    });
                  }}
                  ref={camera}
                  responsiveOrientationWhenOrientationLocked
                  style={styles.cameraPreview}
                />
              )
            : <Text style={styles.cameraInactive}>相机已停用</Text>}
        </View>
        <DataRow label="会话状态" value={<Tag tone={ready ? 'success' : 'signal'}>{ready ? '就绪' : '启动中'}</Tag>} />
        <DataRow label="朝向" value={facing} />
        <ActionRow>
          <ActionButton
            label={facing === 'back' ? '切换前摄像头' : '切换后摄像头'}
            onPress={() => {
              setReady(false);
              setFacing(value => value === 'back' ? 'front' : 'back');
            }}
            tone="secondary"
          />
          <ActionButton
            label={active ? '停用相机' : '启用相机'}
            onPress={() => {
              setReady(false);
              setActive(value => !value);
            }}
            tone="secondary"
          />
        </ActionRow>
      </Panel>

      <Panel eyebrow="拍摄管线" title="照片处理与 SharedRef">
        <ActionRow>
          <ActionButton disabled={!ready || action.state.phase === 'running'} label="拍摄照片" onPress={() => void takePhoto()} testID="camera-take-photo" />
          <ActionButton disabled={!ready || action.state.phase === 'running'} label="拍摄图片引用" onPress={() => void takeRef()} testID="camera-take-ref" tone="secondary" />
        </ActionRow>
        <Note>
          照片拍摄会验证实际尺寸、EXIF 元数据、质量编码以及 PictureRef 保存行为。
        </Note>
      </Panel>

      <Panel eyebrow="设备能力" title="查询当前虚拟设备">
        <ActionButton disabled={!ready || action.state.phase === 'running'} label="读取相机能力" onPress={() => void inspect()} testID="camera-read-capabilities" />
      </Panel>

      <ResultPanel state={action.state} />
    </>
  );
}

function AssetDemo() {
  const bundled = useAsyncResult();
  const remote = useAsyncResult();
  const [url, setUrl] = useState('https://example.com');

  return (
    <>
      <Panel eyebrow="内置资源" title="解析内置的 AntDesign 字体">
        <Note>这里使用与 Font 载体在运行时注册时相同的静态 Metro 资源。</Note>
        <ActionButton
          disabled={bundled.state.phase === 'running'}
          label="解析内置资源"
          onPress={() => void bundled.run(async () => {
            const asset = Asset.fromModule(antDesignFontAsset());
            await asset.downloadAsync();
            return json({
              downloaded: asset.downloaded,
              hash: asset.hash,
              localUri: asset.localUri,
              type: asset.type,
              uri: asset.uri,
            });
          })}
        />
        <ResultPanel state={bundled.state} />
      </Panel>

      <Panel eyebrow="远程缓存" title="下载任意 URL">
        <Field label="资源 URL" onChangeText={setUrl} value={url} />
        <ActionButton
          disabled={!url.trim() || remote.state.phase === 'running'}
          label="下载到资源缓存"
          onPress={() => void remote.run(async () => {
            const asset = Asset.fromURI(url.trim());
            await asset.downloadAsync();
            return json({ downloaded: asset.downloaded, localUri: asset.localUri, type: asset.type, uri: asset.uri });
          })}
        />
        <ResultPanel state={remote.state} />
      </Panel>
    </>
  );
}

type HarmonyPlatformConstants = {
  apiVersion?: number;
  bundleName?: string;
  deviceType?: string;
  osFullName?: string;
  versionCode?: number;
  versionName?: string;
};

function ConstantsDemo() {
  const userAgent = useAsyncResult();
  const harmony = (Constants.platform as { harmony?: HarmonyPlatformConstants } | undefined)?.harmony;
  const harmonyConfig = (Constants.expoConfig as typeof Constants.expoConfig & {
    harmony?: { bundleName?: string; targetApiVersion?: number };
  } | null)?.harmony;

  return (
    <>
      <Panel eyebrow="运行时" title="Expo 常量">
        <DataRow label="executionEnvironment" value={Constants.executionEnvironment} />
        <DataRow label="sessionId" value={Constants.sessionId} />
        <DataRow label="deviceName" value={Constants.deviceName || '不可用'} />
        <DataRow label="systemVersion" value={String(Constants.systemVersion ?? '不可用')} />
        <DataRow label="statusBarHeight" value={`${Constants.statusBarHeight}px`} />
        <DataRow label="debugMode" value={String(Constants.debugMode)} />
      </Panel>

      <Panel eyebrow="HARMONY 清单" title="原生与内嵌信息">
        <DataRow label="bundleName" value={harmony?.bundleName || harmonyConfig?.bundleName || '缺失'} />
        <DataRow label="version" value={harmony ? `${harmony.versionName ?? '?'} (${harmony.versionCode ?? '?'})` : '缺失'} />
        <DataRow label="设备 / API" value={harmony ? `${harmony.deviceType ?? '?'} · API ${harmony.apiVersion ?? '?'}` : '缺失'} />
        <DataRow label="系统全名" value={harmony?.osFullName || '不可用'} />
        <DataRow label="系统字体数量" value={String(Constants.systemFonts.length)} />
        <Text selectable style={styles.compactCode}>{Constants.systemFonts.slice(0, 12).join('\n') || '未上报系统字体。'}</Text>
      </Panel>

      <Panel eyebrow="平台服务" title="WebView 用户代理">
        <ActionButton
          disabled={userAgent.state.phase === 'running'}
          label="读取 User Agent"
          onPress={() => void userAgent.run(async () => (await Constants.getWebViewUserAgentAsync()) || '平台返回了 null。')}
        />
        <ResultPanel state={userAgent.state} />
      </Panel>
    </>
  );
}

function FileSystemDemo() {
  const operation = useAsyncResult();

  const runSandbox = () => operation.run(async () => {
    const directory = new Directory(Paths.cache, 'expo-harmony-demo-manual');
    try {
      directory.create({ idempotent: true, intermediates: true });
      const source = new File(directory, 'source.txt');
      source.create({ overwrite: true });
      source.write('Harmony file system\n', { append: false });
      source.write(new TextEncoder().encode('shared object API'), { append: true });

      const copied = new File(directory, 'copy.txt');
      source.copy(copied);
      const moved = new File(directory, 'moved.txt');
      copied.move(moved);
      copied.rename('renamed.txt');

      const handle = source.open();
      let prefix: Uint8Array;
      try {
        handle.offset = 0;
        prefix = handle.readBytes(7);
      } finally {
        handle.close();
      }

      return json({
        contentUri: source.contentUri,
        entries: directory.list().map(entry => entry.uri),
        md5: source.info({ md5: true }).md5,
        prefix: new TextDecoder().decode(prefix),
        size: source.size,
        text: await source.text(),
      });
    } finally {
      if (directory.exists) directory.delete();
    }
  });

  const pickFile = () => operation.run(async () => {
    const selection = await File.pickFileAsync(undefined, '*/*');
    const file = Array.isArray(selection) ? selection[0] : selection;
    if (!file) throw new Error('选择器未返回文件。');
    const handle = file.open();
    let sample: Uint8Array;
    try {
      sample = handle.readBytes(Math.min(file.size, 64));
    } finally {
      handle.close();
    }
    return json({
      contentUri: file.contentUri,
      exists: file.exists,
      mimeType: file.type,
      sampleBytes: Array.from(sample),
      size: file.size,
      uri: file.uri,
    });
  });

  const pickDirectory = () => operation.run(async () => {
    const directory = await Directory.pickDirectoryAsync();
    return json({
      entries: directory.list().slice(0, 12).map(entry => entry.uri),
      exists: directory.exists,
      size: directory.size,
      uri: directory.uri,
    });
  });

  const runReadContracts = () => operation.run(async () => {
    const { assertFileSystemReadContracts, assertFileSystemRawDirectoryContracts } = await import('./fileSystemAssertions');
    return json({
      reads: await assertFileSystemReadContracts(),
      resources: await assertFileSystemRawDirectoryContracts(),
    });
  });

  const requestLegacyDirectory = (explicitNull: boolean) => operation.run(async () => {
    const { StorageAccessFramework } = await import('expo-file-system/legacy');
    const result = explicitNull
      ? await StorageAccessFramework.requestDirectoryPermissionsAsync(null)
      : await StorageAccessFramework.requestDirectoryPermissionsAsync();
    return json(result);
  });

  return (
    <>
      <Panel eyebrow="沙箱" title="演练现代文件对象">
        <Note>测试只会在应用缓存目录下写入，并在输出结果后删除该目录。</Note>
        <ActionButton
          disabled={operation.state.phase === 'running'}
          label="执行 创建 · 复制 · 移动 · 句柄"
          onPress={() => void runSandbox()}
        />
        <ActionButton
          disabled={operation.state.phase === 'running'}
          label="验证 连续读取 · Seek · EOF · 资源目录"
          onPress={() => void runReadContracts()}
          tone="secondary"
        />
      </Panel>

      <Panel eyebrow="系统选择器" title="检查持久化授权">
        <ActionRow>
          <ActionButton disabled={operation.state.phase === 'running'} label="选择文件" onPress={() => void pickFile()} />
          <ActionButton disabled={operation.state.phase === 'running'} label="选择目录" onPress={() => void pickDirectory()} tone="secondary" />
        </ActionRow>
        <ActionRow>
          <ActionButton disabled={operation.state.phase === 'running'} label="Legacy 目录授权（无参）" onPress={() => void requestLegacyDirectory(false)} tone="secondary" />
          <ActionButton disabled={operation.state.phase === 'running'} label="Legacy 目录授权（null）" onPress={() => void requestLegacyDirectory(true)} tone="secondary" />
        </ActionRow>
        <Note>
          选中的内容仅作抽样读取，演示不会编辑或删除用户选择的文件和目录。
        </Note>
      </Panel>
      <ResultPanel state={operation.state} />
    </>
  );
}

function FontDemo() {
  const action = useAsyncResult();
  const [revision, setRevision] = useState(0);
  const loaded = Font.getLoadedFonts();
  const glyphValue = AntDesign.glyphMap.experiment;
  const glyph = typeof glyphValue === 'number' ? String.fromCodePoint(glyphValue) : glyphValue;

  const refresh = async (operation: () => Promise<void>, message: string) => {
    await operation();
    setRevision(value => value + 1);
    return `${message}\n\n已加载的字体系列：\n${Font.getLoadedFonts().join('\n')}`;
  };

  return (
    <>
      <Panel eyebrow="CNG 资源" title="应用启动时的内置字体">
        <View style={styles.fontSpecimen}>
          <AntDesign color={palette.signal} name="experiment" size={42} />
          <View style={styles.specimenCopy}>
            <Text style={styles.specimenTitle}>AntDesign</Text>
            <Text style={styles.specimenCaption}>已在 JavaScript 运行前完成注册</Text>
          </View>
          <Tag tone={Font.isLoaded('AntDesign') ? 'success' : 'danger'}>
            {Font.isLoaded('AntDesign') ? '已加载' : '未加载'}
          </Tag>
        </View>
      </Panel>

      <Panel eyebrow="运行时注册" title="加载与卸载字体系列别名">
        <View key={revision} style={styles.dynamicSpecimen}>
          <Text style={[styles.dynamicGlyph, { fontFamily: DYNAMIC_FONT_FAMILY }]}>{glyph}</Text>
          <Text style={styles.specimenCaption}>{DYNAMIC_FONT_FAMILY}</Text>
        </View>
        <ActionRow>
          <ActionButton
            disabled={action.state.phase === 'running'}
            label="加载别名"
            onPress={() => void action.run(() => refresh(
              () => Font.loadAsync(DYNAMIC_FONT_FAMILY, antDesignFontAsset()),
              '动态字体系列已注册。'
            ))}
          />
          <ActionButton
            disabled={action.state.phase === 'running' || !Font.isLoaded(DYNAMIC_FONT_FAMILY)}
            label="卸载别名"
            onPress={() => void action.run(() => refresh(
              () => Font.unloadAsync(DYNAMIC_FONT_FAMILY),
              '动态字体系列已注销。'
            ))}
            tone="secondary"
          />
        </ActionRow>
        <DataRow label="已加载字体系列数" value={String(loaded.length)} />
        <ResultPanel state={action.state} />
      </Panel>
    </>
  );
}

const MANUAL_KEEP_AWAKE_TAG = 'expo-harmony-demo-manual';

function HookKeepAwakeProbe() {
  useKeepAwake('expo-harmony-demo-hook');
  return <Tag tone="success">Hook 已挂载</Tag>;
}

function KeepAwakeDemo() {
  const action = useAsyncResult();
  const [manualActive, setManualActive] = useState(false);
  const [hookActive, setHookActive] = useState(false);

  useEffect(() => () => {
    void deactivateKeepAwake(MANUAL_KEEP_AWAKE_TAG);
  }, []);

  const toggleManual = () => action.run(async () => {
    if (manualActive) {
      await deactivateKeepAwake(MANUAL_KEEP_AWAKE_TAG);
      setManualActive(false);
      return '手动标签已释放，屏幕可以正常休眠。';
    }
    await activateKeepAwakeAsync(MANUAL_KEEP_AWAKE_TAG);
    setManualActive(true);
    return '手动标签已生效。请将应用切到后台再切回，验证常亮状态是否恢复。';
  });

  return (
    <>
      <Panel eyebrow="标签常亮锁" title="手动生命周期">
        <DataRow label="本地 UI 状态" value={<Tag tone={manualActive ? 'success' : 'neutral'}>{manualActive ? '生效中' : '已释放'}</Tag>} />
        <ActionButton
          disabled={action.state.phase === 'running'}
          label={manualActive ? '释放标签' : '激活标签'}
          onPress={() => void toggleManual()}
          tone={manualActive ? 'secondary' : 'primary'}
        />
        <ResultPanel state={action.state} />
      </Panel>

      <Panel eyebrow="React Hook" title="随挂载生效的常亮锁">
        <View style={styles.switchRow}>
          <View style={styles.switchCopy}>
            <Text style={styles.switchTitle}>useKeepAwake</Text>
            <Text style={styles.switchCaption}>卸载探针时会自动释放其独立标签。</Text>
          </View>
          <Switch
            onValueChange={setHookActive}
            thumbColor={hookActive ? palette.signal : palette.muted}
            trackColor={{ false: palette.lineStrong, true: palette.signalSoft }}
            value={hookActive}
          />
        </View>
        {hookActive ? <HookKeepAwakeProbe /> : <Tag>Hook 已卸载</Tag>}
      </Panel>

      <Panel eyebrow="能力探测" title="官方可用性 API">
        <ActionButton
          disabled={action.state.phase === 'running'}
          label="检查可用性"
          onPress={() => void action.run(async () => `isAvailableAsync() → ${await isAvailableAsync()}`)}
        />
      </Panel>
    </>
  );
}

function appendPreview(
  current: Uint8Array<ArrayBufferLike>,
  chunk: Uint8Array<ArrayBufferLike>,
  limit = 2048
): Uint8Array<ArrayBufferLike> {
  if (current.length >= limit) return current;
  const addition = chunk.subarray(0, limit - current.length);
  const result = new Uint8Array(current.length + addition.length);
  result.set(current);
  result.set(addition, current.length);
  return result;
}

function FetchDemo() {
  const action = useAsyncResult();
  const [method, setMethod] = useState<'GET' | 'POST'>('GET');
  const [url, setUrl] = useState('https://example.com');
  const controller = useRef<AbortController | null>(null);
  const isRunning = action.state.phase === 'running';

  useEffect(() => () => controller.current?.abort(), []);

  const request = () => action.run(async () => {
    const requestController = new AbortController();
    controller.current = requestController;
    try {
      const response = await expoFetch(url.trim(), {
        body: method === 'POST' ? JSON.stringify({ source: 'expo-harmony-demo' }) : undefined,
        credentials: 'include',
        headers: method === 'POST' ? { 'content-type': 'application/json' } : undefined,
        method,
        redirect: 'follow',
        signal: requestController.signal,
      });
      let bytes = 0;
      let chunks = 0;
      let preview: Uint8Array<ArrayBufferLike> = new Uint8Array();
      if (response.body) {
        const reader = response.body.getReader();
        while (true) {
          const item = await reader.read();
          if (item.done) break;
          chunks += 1;
          bytes += item.value.length;
          preview = appendPreview(preview, item.value);
        }
      }
      return json({
        bodyPreview: new TextDecoder().decode(preview),
        bytes,
        chunks,
        headers: Object.fromEntries([...response.headers.entries()].slice(0, 16)),
        redirected: response.redirected,
        status: response.status,
        url: response.url,
      });
    } finally {
      if (controller.current === requestController) controller.current = null;
    }
  });

  const requestHint = useMemo(
    () => method === 'GET'
      ? '可使用任意 HTTP(S) 地址。重定向、Set-Cookie 与分块响应体都会体现在结果中。'
      : 'POST 会发送一个较小的 JSON 请求体，并保持重定向与凭据处理开启。',
    [method]
  );

  return (
    <Panel eyebrow="网络试验场" title="流式读取 HTTP 响应">
      <Field label="请求 URL" onChangeText={setUrl} value={url} />
      <View style={styles.methodRow}>
        {(['GET', 'POST'] as const).map(value => (
          <ActionButton
            key={value}
            disabled={isRunning}
            label={value}
            onPress={() => setMethod(value)}
            tone={method === value ? 'primary' : 'secondary'}
          />
        ))}
      </View>
      <Note>{requestHint}</Note>
      <ActionRow>
        <ActionButton disabled={isRunning || !url.trim()} label="发送请求" onPress={() => void request()} />
        <ActionButton
          disabled={!isRunning}
          label="中止"
          onPress={() => controller.current?.abort()}
          tone="danger"
        />
      </ActionRow>
      <ResultPanel state={action.state} />
    </Panel>
  );
}

function LinkingDemo() {
  const action = useAsyncResult();
  const linkingURL = Linking.useLinkingURL();
  const [url, setUrl] = useState(linkingURL || 'expoharmonydemo://module/linking');

  return (
    <>
      <Panel eyebrow="原生生命周期" title="当前链接 URL">
        <DataRow label="getLinkingURL()" value={Linking.getLinkingURL() || 'null'} />
        <DataRow label="useLinkingURL()" value={linkingURL || 'null'} />
        <ActionButton
          label="清除缓存的初始 URL"
          onPress={() => void action.run(async () => {
            const initialURL = await Linking.getInitialURL();
            Linking.clearInitialURL();
            const next = Linking.getLinkingURL();
            if (next !== null) throw new Error(`清除后应为 null，实际为 ${next}。`);
            const retainedInitialURL = await Linking.getInitialURL();
            if (retainedInitialURL !== initialURL) {
              throw new Error(
                `React Native 初始 URL 由 ${String(initialURL)} 变为 ${String(retainedInitialURL)}。`
              );
            }
            return 'Expo 缓存已清除，React Native 冷启动 URL 保持不变。';
          })}
          testID="linking-clear-initial-url"
          tone="secondary"
        />
        <ResultPanel state={action.state} />
      </Panel>

      <Panel eyebrow="纯 URL API" title="解析任意深链接">
        <Field label="URL" onChangeText={setUrl} value={url} />
        <ActionRow>
          <ActionButton
            disabled={!url.trim()}
            label="解析 URL"
            onPress={() => void action.run(() => json(Linking.parse(url.trim())))}
          />
          <ActionButton
            disabled={!url.trim() || action.state.phase === 'running'}
            label="检测能否打开"
            onPress={() => void action.run(async () => `canOpenURL() → ${await Linking.canOpenURL(url.trim())}`)}
            tone="secondary"
          />
          <ActionButton
            disabled={!url.trim() || action.state.phase === 'running'}
            label="打开 URL"
            onPress={() => void action.run(async () => `openURL() → ${await Linking.openURL(url.trim())}`)}
            tone="secondary"
          />
        </ActionRow>
      </Panel>
    </>
  );
}

function NetworkDemo() {
  const action = useAsyncResult();
  const state = Network.useNetworkState();
  const [events, setEvents] = useState(0);
  const [lastEvent, setLastEvent] = useState<Network.NetworkState>();

  useEffect(() => {
    const subscription = Network.addNetworkStateListener((event) => {
      setEvents(value => value + 1);
      setLastEvent(event);
    });

    return () => subscription.remove();
  }, []);

  const inspect = () => action.run(async () => {
    const [current, ipAddress, airplaneMode] = await Promise.all([
      Network.getNetworkStateAsync(),
      Network.getIpAddressAsync(),
      Network.isAirplaneModeEnabledAsync(),
    ]);

    return json({ airplaneMode, ipAddress, state: current });
  });

  return (
    <>
      <Panel eyebrow="实时状态" title="观察 Harmony 网络连接">
        <DataRow label="连接类型" value={state.type ?? '加载中'} />
        <DataRow label="已连接" value={String(state.isConnected ?? '未知')} />
        <DataRow label="互联网可达" value={String(state.isInternetReachable ?? '未知')} />
        <DataRow label="状态事件数" value={String(events)} />
        {lastEvent ? <Text selectable style={styles.compactCode}>{json(lastEvent)}</Text> : null}
      </Panel>

      <Panel eyebrow="原生方法" title="读取当前网络快照">
        <Note>返回当前承载网络、本地 IPv4 地址与系统飞行模式设置。</Note>
        <ActionButton
          disabled={action.state.phase === 'running'}
          label="读取网络状态"
          onPress={() => void inspect()}
          testID="network-read-state"
        />
        <ResultPanel state={action.state} />
      </Panel>
    </>
  );
}

function SharingDemo() {
  const action = useAsyncResult();
  const incoming = Sharing.useIncomingShare();

  const shareFile = () => action.run(async () => {
    if (!await Sharing.isAvailableAsync()) throw new Error('Harmony 系统分享不可用。');

    const directory = new Directory(Paths.cache, 'expo-harmony-demo-sharing');
    try {
      directory.create({ idempotent: true, intermediates: true });
      const file = new File(directory, 'expo-sharing-check.txt');
      file.create({ overwrite: true });
      file.write('Expo Sharing on HarmonyOS\n本地文件 · text/plain · 系统分享面板\n');

      await Sharing.shareAsync(file.uri, {
        dialogTitle: 'Expo Harmony 分享检测',
        mimeType: 'text/plain',
      });

      return `系统分享面板已打开并关闭。\n${file.uri}`;
    } finally {
      if (directory.exists) directory.delete();
    }
  });

  const validateURL = () => action.run(async () => {
    try {
      await Sharing.shareAsync('https://example.com/not-a-local-file.txt', { mimeType: 'text/plain' });
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code)
        : undefined;
      if (code !== 'ERR_SHARING_INVALID_URL') {
        throw new Error(`预期错误码 ERR_SHARING_INVALID_URL，实际为 ${code || '无错误码'}。`);
      }

      return code;
    }

    throw new Error('远程 HTTPS URL 不应进入系统分享面板。');
  });

  return (
    <>
      <Panel eyebrow="接收分享" title="检查发送到本应用的数据">
        <DataRow label="负载数量" value={String(incoming.sharedPayloads.length)} />
        <DataRow label="已解析数量" value={String(incoming.resolvedSharedPayloads.length)} />
        <DataRow label="是否解析中" value={String(incoming.isResolving)} />
        {incoming.error ? <Text selectable style={styles.compactCode}>{incoming.error.message}</Text> : null}
        {incoming.sharedPayloads.length > 0
          ? <Text selectable style={styles.compactCode}>{json(incoming.sharedPayloads)}</Text>
          : <Note>向本应用分享文本、网页链接或文件，即可验证接收链路。</Note>}
        {incoming.resolvedSharedPayloads.length > 0
          ? <Text selectable style={styles.compactCode}>{json(incoming.resolvedSharedPayloads)}</Text>
          : null}
        <ActionRow>
          <ActionButton
            label="刷新分享负载"
            onPress={() => void incoming.refreshSharePayloads()}
            testID="sharing-refresh-payloads"
          />
          <ActionButton
            label="清空分享负载"
            onPress={() => {
              incoming.clearSharedPayloads();
              void incoming.refreshSharePayloads();
            }}
            testID="sharing-clear-payloads"
            tone="secondary"
          />
        </ActionRow>
      </Panel>

      <Panel eyebrow="能力探测" title="Harmony 系统分享">
        <ActionButton
          disabled={action.state.phase === 'running'}
          label="检查可用性"
          onPress={() => void action.run(async () => `isAvailableAsync() → ${await Sharing.isAvailableAsync()}`)}
          testID="sharing-check-availability"
        />
      </Panel>

      <Panel eyebrow="本地文件" title="打开系统分享面板">
        <Note>
          会在应用缓存中创建一个临时的 UTF-8 文本文件，以 text/plain 分享，面板关闭后随即删除。
        </Note>
        <ActionButton
          disabled={action.state.phase === 'running'}
          label="分享测试文件"
          onPress={() => void shareFile()}
          testID="sharing-open-panel"
        />
      </Panel>

      <Panel eyebrow="错误契约" title="拒绝非本地 URL">
        <ActionButton
          disabled={action.state.phase === 'running'}
          label="验证 URL 校验"
          onPress={() => void validateURL()}
          testID="sharing-invalid-url"
          tone="secondary"
        />
        <ResultPanel state={action.state} />
      </Panel>
    </>
  );
}

function ApplicationDemo() {
  const action = useAsyncResult();

  return (
    <>
      <Panel eyebrow="已安装应用" title="原生应用包标识">
        <DataRow label="applicationId" value={Application.applicationId || 'null'} />
        <DataRow label="applicationName" value={Application.applicationName || 'null'} />
        <DataRow label="nativeApplicationVersion" value={Application.nativeApplicationVersion || 'null'} />
        <DataRow label="nativeBuildVersion" value={Application.nativeBuildVersion || 'null'} />
      </Panel>
      <Panel eyebrow="安装记录" title="系统报告的时间戳">
        <ActionButton
          disabled={action.state.phase === 'running'}
          label="读取安装时间"
          onPress={() => void action.run(async () => {
            const installedAt = await Application.getInstallationTimeAsync();
            if (Number.isNaN(installedAt.getTime())) throw new Error('原生安装时间无效。');
            return installedAt.toISOString();
          })}
        />
        <ResultPanel state={action.state} />
      </Panel>
    </>
  );
}

function SystemUIDemo() {
  const action = useAsyncResult();

  return (
    <Panel eyebrow="窗口根视图" title="运行时背景色">
      <ActionRow>
        <ActionButton
          disabled={action.state.phase === 'running'}
          label="设为实验室背景"
          onPress={() => void action.run(async () => {
            await SystemUI.setBackgroundColorAsync(palette.canvas);
            return `getBackgroundColorAsync() → ${String(await SystemUI.getBackgroundColorAsync())}`;
          })}
          testID="system-ui-set-background"
        />
        <ActionButton
          disabled={action.state.phase === 'running'}
          label="清除覆盖"
          onPress={() => void action.run(async () => {
            await SystemUI.setBackgroundColorAsync(null);
            return `getBackgroundColorAsync() → ${String(await SystemUI.getBackgroundColorAsync())}`;
          })}
          testID="system-ui-reset-background"
          tone="secondary"
        />
      </ActionRow>
      <ResultPanel state={action.state} />
    </Panel>
  );
}

function SplashScreenDemo() {
  const action = useAsyncResult();

  return (
    <>
      <Panel eyebrow="启动交接" title="原生启动屏状态机">
        <Note>
          根布局在模块作用域调用 preventAutoHideAsync，加载内置字体后，恰好在 React 内容就绪时隐藏启动屏。
        </Note>
        <ActionButton
          disabled={action.state.phase === 'running'}
          label="验证幂等交接"
          onPress={() => void action.run(async () => {
            SplashScreen.setOptions({ duration: 0, fade: false });
            const prevented = await SplashScreen.preventAutoHideAsync();
            SplashScreen.hide();
            await SplashScreen.hideAsync();
            return `就绪后 prevent → ${String(prevented)}；重复 hide 已完成`;
          })}
        />
        <ResultPanel state={action.state} />
      </Panel>
      <Panel eyebrow="CNG 资源" title="冷启动视觉契约">
        <DataRow label="背景色" value={palette.canvas} />
        <DataRow label="缩放模式" value="contain" />
        <DataRow label="图片" value="assets/app-icon.svg" />
      </Panel>
    </>
  );
}

function LinearGradientDemo() {
  const [direction, setDirection] = useState<'horizontal' | 'vertical'>('horizontal');
  const start = { x: 0, y: 0 } as const;
  const end = direction === 'horizontal' ? { x: 1, y: 0 } as const : { x: 0, y: 1 } as const;

  return (
    <>
      <Panel eyebrow="多色渐变" title="精确的对角端点">
        <LinearGradient
          colors={['#FFB000', '#72D8FF', '#7B61FF']}
          end={{ x: 1, y: 1 }}
          locations={[0, 0.45, 1]}
          start={{ x: 0, y: 0 }}
          style={styles.gradientHero}
          testID="linear-gradient-multi-stop"
        >
          <Text style={styles.gradientEyebrow}>原生画布</Text>
          <Text style={styles.gradientTitle}>三种颜色，一个原生视图。</Text>
          <Text style={styles.gradientCopy}>
            子内容浮于渐变之上，原生图层始终跟随视图边界。
          </Text>
        </LinearGradient>
      </Panel>

      <Panel eyebrow="动态属性" title="切换渐变方向">
        <LinearGradient
          colors={['#FF7064', '#FFB000', '#51D88A']}
          end={end}
          locations={[0, 0.52, 1]}
          start={start}
          style={styles.gradientDirection}
          testID="linear-gradient-direction"
        >
          <Text style={styles.gradientDirectionText}>{direction === 'horizontal' ? '水平' : '垂直'}</Text>
        </LinearGradient>
        <DataRow label="起点 → 终点" value={direction === 'horizontal' ? '(0, 0) → (1, 0)' : '(0, 0) → (0, 1)'} />
        <ActionRow>
          <ActionButton label="水平" onPress={() => setDirection('horizontal')} tone="secondary" />
          <ActionButton label="垂直" onPress={() => setDirection('vertical')} tone="secondary" />
        </ActionRow>
      </Panel>

      <Panel eyebrow="断点与裁剪" title="硬过渡与单独圆角">
        <LinearGradient
          colors={['#111920', '#111920', '#72D8FF', '#7B61FF']}
          end={{ x: 1, y: 0 }}
          locations={[0, 0.5, 0.5, 1]}
          start={{ x: 0, y: 0 }}
          style={styles.gradientHardStop}
          testID="linear-gradient-hard-stop"
        >
          <Text style={styles.gradientHardStopText}>50% 硬过渡</Text>
        </LinearGradient>
      </Panel>

      <Panel eyebrow="边界情况" title="偏移断点与视图外坐标">
        <LinearGradient
          colors={['#FF7064', '#FFB000', '#72D8FF']}
          end={{ x: 1, y: 0 }}
          locations={[0.2, 0.65, 1]}
          start={{ x: 0, y: 0 }}
          style={styles.gradientPartial}
          testID="linear-gradient-partial-locations"
        >
          <Text style={styles.gradientEdgeText}>三个颜色对应 20% / 65% / 100%</Text>
        </LinearGradient>
        <LinearGradient
          colors={['#FF7064', '#51D88A']}
          end={{ x: 1.5, y: 0.5 }}
          start={{ x: -0.5, y: 0.5 }}
          style={styles.gradientDegenerate}
          testID="linear-gradient-degenerate"
        >
          <Text style={styles.gradientEdgeText}>渐变轴可延伸到视图边界之外</Text>
        </LinearGradient>
      </Panel>
    </>
  );
}

function NavigationBarDemo() {
  const action = useAsyncResult();
  const observedVisibility = NavigationBar.useVisibility();

  useEffect(() => () => {
    void Promise.all([
      NavigationBar.setBackgroundColorAsync(palette.canvas),
      NavigationBar.setButtonStyleAsync('light'),
      NavigationBar.setPositionAsync('relative'),
      NavigationBar.setVisibilityAsync('visible'),
    ]).catch(() => undefined);
  }, []);

  const inspect = () => action.run(async () => json({
    backgroundColor: await NavigationBar.getBackgroundColorAsync(),
    buttonStyle: await NavigationBar.getButtonStyleAsync(),
    position: await NavigationBar.unstable_getPositionAsync(),
    visibility: await NavigationBar.getVisibilityAsync(),
  }));

  return (
    <>
      <Panel eyebrow="实时状态" title="读取 Harmony 导航栏">
        <DataRow
          label="可见性事件 Hook"
          value={<Tag tone={observedVisibility === 'hidden' ? 'danger' : 'success'}>{observedVisibility ?? '加载中'}</Tag>}
        />
        <ActionButton
          disabled={action.state.phase === 'running'}
          label="读取原生状态"
          onPress={() => void inspect()}
          testID="navigation-bar-read"
        />
        <ResultPanel state={action.state} />
      </Panel>

      <Panel eyebrow="颜色与按键" title="修改原生系统栏属性">
        <ActionRow>
          <ActionButton
            label="设置主题色"
            onPress={() => void NavigationBar.setBackgroundColorAsync(palette.signal)}
            testID="navigation-bar-signal-color"
          />
          <ActionButton
            label="恢复默认背景"
            onPress={() => void NavigationBar.setBackgroundColorAsync(palette.canvas)}
            tone="secondary"
          />
        </ActionRow>
        <ActionRow>
          <ActionButton label="浅色按键" onPress={() => void NavigationBar.setButtonStyleAsync('light')} />
          <ActionButton label="深色按键" onPress={() => void NavigationBar.setButtonStyleAsync('dark')} tone="secondary" />
        </ActionRow>
      </Panel>

      <Panel eyebrow="布局与可见性" title="演练系统栏生命周期">
        <ActionRow>
          <ActionButton label="显示导航栏" onPress={() => void NavigationBar.setVisibilityAsync('visible')} />
          <ActionButton
            label="隐藏导航栏"
            onPress={() => void NavigationBar.setVisibilityAsync('hidden')}
            testID="navigation-bar-hide"
            tone="secondary"
          />
        </ActionRow>
        <ActionRow>
          <ActionButton label="相对定位" onPress={() => void NavigationBar.setPositionAsync('relative')} />
          <ActionButton label="绝对定位" onPress={() => void NavigationBar.setPositionAsync('absolute')} tone="secondary" />
        </ActionRow>
        <Note>
          绝对定位模式下 React 内容会延伸到系统栏下方。离开本页面时会自动恢复实验室默认设置。
        </Note>
      </Panel>
    </>
  );
}

function BatteryDemo() {
  const powerState = Battery.usePowerState();
  const action = useAsyncResult();
  const [events, setEvents] = useState({ level: 0, mode: 0, state: 0 });
  const [payloads, setPayloads] = useState({ level: '暂无', mode: '暂无', state: '暂无' });
  const [invalidEvent, setInvalidEvent] = useState<string | null>(null);
  const [removal, setRemoval] = useState({ calls: 0, phase: 'idle' });
  const removalSubscription = useRef<Battery.Subscription | null>(null);

  useEffect(() => {
    const subscriptions = [
      Battery.addBatteryLevelListener((event) => {
        if (!isBatteryLevel(event?.batteryLevel)) {
          setInvalidEvent(`无效的电量事件：${json(event)}`);
        } else {
          setPayloads(value => ({ ...value, level: String(event.batteryLevel) }));
        }

        setEvents(value => ({ ...value, level: value.level + 1 }));
      }),
      Battery.addBatteryStateListener((event) => {
        if (!isBatteryState(event?.batteryState)) {
          setInvalidEvent(`无效的电池状态事件：${json(event)}`);
        } else {
          setPayloads(value => ({ ...value, state: String(event.batteryState) }));
        }

        setEvents(value => ({ ...value, state: value.state + 1 }));
      }),
      Battery.addLowPowerModeListener((event) => {
        if (typeof event?.lowPowerMode !== 'boolean') {
          setInvalidEvent(`无效的低电量模式事件：${json(event)}`);
        } else {
          setPayloads(value => ({ ...value, mode: String(event.lowPowerMode) }));
        }

        setEvents(value => ({ ...value, mode: value.mode + 1 }));
      }),
    ];

    return () => {
      subscriptions.forEach(subscription => subscription.remove());
      removalSubscription.current?.remove();
      removalSubscription.current = null;
    };
  }, []);

  const armRemovalProbe = () => {
    removalSubscription.current?.remove();
    removalSubscription.current = null;
    setRemoval({ calls: 0, phase: '等待首个电量事件' });

    let calls = 0;
    const subscription = Battery.addBatteryLevelListener((event) => {
      calls += 1;

      if (!isBatteryLevel(event?.batteryLevel)) {
        setInvalidEvent(`无效的移除探针事件：${json(event)}`);
      }

      setRemoval({
        calls,
        phase: calls === 1 ? '首个事件后已移除' : '失败：回调被重复触发',
      });

      if (calls === 1) {
        subscription.remove();
        if (removalSubscription.current === subscription) removalSubscription.current = null;
      }
    });

    removalSubscription.current = subscription;
  };

  const inspect = () => action.run(async () => {
    const [available, current, optimized] = await Promise.all([
      Battery.isAvailableAsync(),
      Battery.getPowerStateAsync(),
      Battery.isBatteryOptimizationEnabledAsync(),
    ]);

    return json({ available, batteryOptimization: optimized, ...current });
  });

  return (
    <>
      <Panel eyebrow="实时 Hook" title="观察 Harmony 电源状态">
        <DataRow label="电量" value={batteryLevelLabel(powerState.batteryLevel)} />
        <DataRow
          label="电池状态"
          value={`${BATTERY_STATE_LABELS[powerState.batteryState]} (${String(powerState.batteryState)})`}
        />
        <DataRow label="低电量模式" value={String(powerState.lowPowerMode)} />
      </Panel>

      <Panel eyebrow="原生事件" title="跟踪 Expo Battery 的全部公开事件">
        <DataRow label="电量事件数" value={String(events.level)} />
        <DataRow label="状态事件数" value={String(events.state)} />
        <DataRow label="低电量模式事件数" value={String(events.mode)} />
        <DataRow label="最近电量事件值" value={payloads.level} />
        <DataRow label="最近状态事件值" value={payloads.state} />
        <DataRow label="最近模式事件值" value={payloads.mode} />
        <DataRow
          label="事件数据契约"
          value={<Tag tone={invalidEvent === null ? 'success' : 'danger'}>{invalidEvent ?? '有效'}</Tag>}
        />
        <Note>
          请在本页面停留期间修改模拟器的电量或充电状态。Hook 数值与对应计数器应即时更新，无需重新进入页面。
        </Note>
        <Text selectable style={styles.compactCode}>
          {'Emulator -instance "<name>" -battery 37\nEmulator -instance "<name>" -batteryStatus 1'}
        </Text>
      </Panel>

      <Panel eyebrow="移除契约" title="在首个事件后移除监听器">
        <DataRow label="探针状态" value={removal.phase} />
        <DataRow label="回调次数" value={String(removal.calls)} />
        <ActionButton
          label="启动「首个事件后移除」探针"
          onPress={armRemovalProbe}
          testID="battery-arm-removal-probe"
          tone="secondary"
        />
        <Note>
          启动探针后，连续修改两次模拟器电量。回调次数应达到一次，且第二次修改后仍保持一次。
        </Note>
      </Panel>

      <Panel eyebrow="原生方法" title="读取一致的电源快照">
        <ActionButton
          disabled={action.state.phase === 'running'}
          label="读取电池状态"
          onPress={() => void inspect()}
          testID="battery-read-state"
        />
        <ResultPanel state={action.state} />
      </Panel>
    </>
  );
}

function backgroundFetchStatusLabel(status: BackgroundFetch.BackgroundFetchStatus | null): string {
  if (status === null) return '不可用';

  return BackgroundFetch.BackgroundFetchStatus[status] ?? String(status);
}

function BackgroundFetchDemo() {
  const action = useAsyncResult();
  const [registered, setRegistered] = useState(false);
  const [execution, setExecution] = useState(getBackgroundFetchExecution);

  useEffect(() => subscribeToBackgroundFetchExecution(setExecution), []);

  const inspect = () => action.run(async () => {
    const [available, status, isRegistered] = await Promise.all([
      TaskManager.isAvailableAsync(),
      BackgroundFetch.getStatusAsync(),
      TaskManager.isTaskRegisteredAsync(BACKGROUND_FETCH_TASK),
    ]);
    const options = isRegistered
      ? await TaskManager.getTaskOptionsAsync<BackgroundFetch.BackgroundFetchOptions>(BACKGROUND_FETCH_TASK)
      : null;

    setRegistered(isRegistered);

    return json({ available, options, registered: isRegistered, status: backgroundFetchStatusLabel(status) });
  });

  const register = () => action.run(async () => {
    await BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, BACKGROUND_FETCH_OPTIONS);

    setRegistered(true);

    return `已注册 ${BACKGROUND_FETCH_TASK}，最小间隔为不精确的 20 分钟。`;
  });

  const unregister = () => action.run(async () => {
    await BackgroundFetch.unregisterTaskAsync(BACKGROUND_FETCH_TASK);

    setRegistered(false);

    return `已取消注册 ${BACKGROUND_FETCH_TASK}。`;
  });

  return (
    <>
      <Panel eyebrow="原生状态" title="检查 BackgroundFetch 与 TaskManager">
        <DataRow label="任务名" value={BACKGROUND_FETCH_TASK} />
        <DataRow label="已注册" value={<Tag tone={registered ? 'success' : 'signal'}>{registered ? '是' : '否'}</Tag>} />
        <ActionButton
          disabled={action.state.phase === 'running'}
          label="读取原生状态"
          onPress={() => void inspect()}
          testID="background-fetch-inspect"
        />
      </Panel>

      <Panel eyebrow="WORKSCHEDULER" title="注册 Expo 后台拉取任务">
        <ActionRow>
          <ActionButton
            disabled={registered || action.state.phase === 'running'}
            label="注册任务"
            onPress={() => void register()}
            testID="background-fetch-register"
          />
          <ActionButton
            disabled={!registered || action.state.phase === 'running'}
            label="取消注册"
            onPress={() => void unregister()}
            testID="background-fetch-unregister"
            tone="secondary"
          />
        </ActionRow>
        <Note>
          HarmonyOS 对延迟任务的调度并不精确，且强制最小间隔 20 分钟。请保持应用进程存活，将其切到后台并等待系统回调；出于功耗策略，调度器可能会推迟执行。
        </Note>
      </Panel>

      <Panel eyebrow="任务执行" title="观察 JavaScript 回调">
        <DataRow label="回调次数" value={String(execution?.count ?? 0)} />
        <DataRow label="最近事件" value={execution?.eventId ?? '尚未观测到'} />
        <DataRow label="发生时间" value={execution?.occurredAt ?? '尚未观测到'} />
        <DataRow label="错误" value={execution?.error ?? '无'} />
        <Note>
          回调记录保存在当前 JavaScript 运行时中。进程重启后此处会清空，但原生注册仍会保留，可在上方查看。
        </Note>
      </Panel>

      <ResultPanel state={action.state} />
    </>
  );
}

function backgroundTaskStatusLabel(status: BackgroundTask.BackgroundTaskStatus): string {
  return BackgroundTask.BackgroundTaskStatus[status] ?? String(status);
}

function BackgroundTaskDemo() {
  const action = useAsyncResult();
  const [registered, setRegistered] = useState(false);
  const [execution, setExecution] = useState(getBackgroundTaskExecution);
  const [expirations, setExpirations] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeToBackgroundTaskExecution(setExecution);
    const expiration = BackgroundTask.addExpirationListener(() => {
      setExpirations(value => value + 1);
    });

    return () => {
      unsubscribe();
      expiration.remove();
    };
  }, []);

  const inspect = () => action.run(async () => {
    const [available, status, isRegistered, tasks] = await Promise.all([
      TaskManager.isAvailableAsync(),
      BackgroundTask.getStatusAsync(),
      TaskManager.isTaskRegisteredAsync(BACKGROUND_TASK),
      TaskManager.getRegisteredTasksAsync(),
    ]);

    const options = isRegistered
      ? await TaskManager.getTaskOptionsAsync<BackgroundTask.BackgroundTaskOptions>(BACKGROUND_TASK)
      : null;
    const task = tasks.find(value => value.taskName === BACKGROUND_TASK) ?? null;

    setRegistered(isRegistered);

    return json({
      available,
      options,
      registered: isRegistered,
      status: backgroundTaskStatusLabel(status),
      taskType: task?.taskType ?? null,
    });
  });

  const register = () => action.run(async () => {
    await BackgroundTask.registerTaskAsync(BACKGROUND_TASK, BACKGROUND_TASK_OPTIONS);

    setRegistered(true);

    return `已注册 ${BACKGROUND_TASK}，最小间隔为不精确的 20 分钟。`;
  });

  const unregister = () => action.run(async () => {
    await BackgroundTask.unregisterTaskAsync(BACKGROUND_TASK);

    setRegistered(false);

    return `已取消注册 ${BACKGROUND_TASK}。`;
  });

  const trigger = () => action.run(async () => {
    const triggered = await BackgroundTask.triggerTaskWorkerForTestingAsync();
    const current = getBackgroundTaskExecution();

    return json({
      callbackCount: current?.count ?? 0,
      eventId: current?.eventId ?? null,
      triggered,
    });
  });

  return (
    <>
      <Panel eyebrow="原生状态" title="检查 BackgroundTask 与 TaskManager">
        <DataRow label="任务名" value={BACKGROUND_TASK} />
        <DataRow label="已注册" value={<Tag tone={registered ? 'success' : 'signal'}>{registered ? '是' : '否'}</Tag>} />
        <ActionButton
          disabled={action.state.phase === 'running'}
          label="读取原生状态"
          onPress={() => void inspect()}
          testID="background-task-inspect"
        />
      </Panel>

      <Panel eyebrow="WORKSCHEDULER" title="注册新一代 Expo 后台任务">
        <ActionRow>
          <ActionButton
            disabled={registered || action.state.phase === 'running'}
            label="注册任务"
            onPress={() => void register()}
            testID="background-task-register"
          />
          <ActionButton
            disabled={!registered || action.state.phase === 'running'}
            label="取消注册"
            onPress={() => void unregister()}
            testID="background-task-unregister"
            tone="secondary"
          />
        </ActionRow>
        <Note>
          HarmonyOS 强制最小间隔 20 分钟，并可能出于功耗策略推迟周期任务。即使 JavaScript 运行时重启，注册信息与任务元数据也会保留。
        </Note>
      </Panel>

      <Panel eyebrow="调试执行" title="立即运行原生 worker">
        <ActionButton
          disabled={!registered || action.state.phase === 'running'}
          label="触发调试 worker"
          onPress={() => void trigger()}
          testID="background-task-trigger"
        />
        <DataRow label="回调次数" value={String(execution?.count ?? 0)} />
        <DataRow label="最近事件" value={execution?.eventId ?? '尚未观测到'} />
        <DataRow label="发生时间" value={execution?.occurredAt ?? '尚未观测到'} />
        <DataRow label="错误" value={execution?.error ?? '无'} />
        <DataRow label="过期事件数" value={String(expirations)} />
        <Note>
          触发 API 仅在 debug 构建中可用；常规周期执行仍由系统调度。
        </Note>
      </Panel>

      <ResultPanel state={action.state} />
    </>
  );
}

// ---- BLE 工具函数 ----

/** 将 128 位 UUID 转为短格式 */
function shortUUID(uuid: string): string {
  const bleBase = '-0000-1000-8000-00805f9b34fb';
  if (uuid.endsWith(bleBase)) return `0x${uuid.replace(bleBase, '')}`;
  if (uuid.length === 36) return uuid.split('-').pop() || uuid;
  if (uuid.length === 4 || uuid.length === 6) return `0x${uuid}`;
  return uuid;
}

/** 将字节数组转为十六进制字符串 */
function bytesToHex(data: number[]): string {
  return data.map(b => b.toString(16).padStart(2, '0')).join(' ');
}

/** 将字节数组转为 ASCII 字符串（可打印字符） */
function bytesToAscii(data: number[]): string {
  return data.map(b => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.')).join('');
}

/** 格式化当前时间 HH:MM:SS（鸿蒙 Hermes 无 Intl，toLocaleTimeString 会抛 "dateformat not implemented"） */
function nowTime(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 解析十六进制字符串为字节数组 */
function hexToBytes(hex: string): number[] {
  const clean = hex.replace(/\s+/g, '').replace(/^0x/i, '').replace(/[^0-9a-fA-F]/g, '');
  if (clean.length % 2 !== 0) throw new Error('十六进制长度必须为偶数');
  const result: number[] = [];
  for (let i = 0; i < clean.length; i += 2) result.push(parseInt(clean.substring(i, i + 2), 16));
  return result;
}

/** 格式化字节数组为可读字符串 */
function formatByteData(data: number[]): { hex: string; ascii: string } {
  return { hex: bytesToHex(data), ascii: bytesToAscii(data) };
}

// ---- BLE 演示组件 ----

function BleDemo() {
  const manager = useRef<BleNitroManager | null>(null);
  const [bleState, setBleState] = useState<string>('检查中');
  const [scanning, setScanning] = useState(false);
  const [devices, setDevices] = useState<BLEDevice[]>([]);
  const [scanError, setScanError] = useState<string | null>(null);
  const [requestingPerm, setRequestingPerm] = useState(false);
  const [connectedDeviceId, setConnectedDeviceId] = useState<string | null>(null);
  const [hasNameOnly, setHasNameOnly] = useState(true);

  // 服务和特征探索
  const [services, setServices] = useState<{ id: string; chars: string[] }[]>([]);
  const [expandedServices, setExpandedServices] = useState<Set<string>>(new Set());
  const [subscribedChars, setSubscribedChars] = useState<Set<string>>(new Set());
  const [notificationLog, setNotificationLog] = useState<string[]>([]);
  const [charResults, setCharResults] = useState<Record<string, string>>({});

  // 写操作输入
  const [writeHexInputs, setWriteHexInputs] = useState<Record<string, string>>({});
  const [writeWithResponse, setWriteWithResponse] = useState(true);
  // 填充写入（用于测试 MTU）：弹出输入目标字节数
  const [padInfo, setPadInfo] = useState<{ serviceId: string; charId: string } | null>(null);
  const [padTargetSize, setPadTargetSize] = useState('');

  // 独立的操作状态跟踪
  const action = useAsyncResult();
  const exploreAction = useAsyncResult();
  const readAction = useAsyncResult();
  const writeAction = useAsyncResult();

  // 保存当前连接的设备 ID，供 cleanup 使用（ref 避免闭包过期）
  const connectedIdRef = useRef<string | null>(null);
  const mtuRef = useRef<number>(23); // 协商后的 MTU，默认 23
  // 订阅回调引用，避免组件重新渲染时丢失订阅
  const subRefs = useRef<Map<string, AsyncSubscription>>(new Map());

  useEffect(() => {
    const mgr = BleNitro.instance();
    manager.current = mgr;
    const sub = mgr.subscribeToStateChange((state) => {
      setBleState(state);
    }, true);
    return () => {
      sub.remove();
      // 离开页面时：先等待所有取消订阅完成（CCCD 写入 0x0000），再断开连接
      // 避免 GATT 操作队列（gattOperationQueue）的 isGattOperationInProgress 卡死
      // 导致下次订阅时 CCCD 写入被阻塞
      const deviceId = connectedIdRef.current;
      if (deviceId) {
        const unsubPromises = Array.from(subRefs.current.values()).map(s =>
          s.remove().catch(() => {}),
        );
        subRefs.current.clear();
        Promise.all(unsubPromises).finally(() => {
          mgr.disconnect(deviceId).catch(() => {});
        });
      } else {
        subRefs.current.clear();
      }
      mgr.stopScan();
    };
  }, []);

  // Android 12+ 需要运行时请求 BLE 相关权限
  // HarmonyOS 也需要运行时请求 ohos.permission.ACCESS_BLUETOOTH
  const requestBlePermissions = async () => {
    if ((Platform.OS as string) === 'harmony') {
      setRequestingPerm(true);
      try {
        const mgr = manager.current;
        if (!mgr) return false;
        // HarmonyOS：requestBluetoothEnable 内部先检测/申请 ACCESS_BLUETOOTH + 模糊定位权限，
        // 已授权时静默通过（不弹窗），未授权时弹系统授权框
        const ok = await mgr.requestBluetoothEnable();
        setBleState(mgr.state());
        setNotificationLog(prev => [...prev, `[${nowTime()}] 蓝牙权限${ok ? '已授权 ✓' : '未授权 ✗（扫描无法发现设备）'}`]);
        if (!ok) {
          Alert.alert(
            '蓝牙权限未授权',
            '未授予蓝牙/模糊定位权限，扫描无法发现设备。可再次点击"检测/申请蓝牙权限"，或到系统设置 > 隐私 > 权限管理中手动授权。',
          );
        }
        return ok;
      } catch {
        return false;
      } finally {
        setRequestingPerm(false);
      }
    }
    if (Platform.OS !== 'android') return;
    setRequestingPerm(true);
    try {
      const permissions = [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ];
      const results = await PermissionsAndroid.requestMultiple(permissions);
      const allGranted = Object.values(results).every(
        r => r === PermissionsAndroid.RESULTS.GRANTED,
      );
      if (allGranted) {
        const mgr = manager.current;
        if (mgr) setBleState(mgr.state());
      }
      return allGranted;
    } finally {
      setRequestingPerm(false);
    }
  };

  const isUnauthorized = bleState === 'Unauthorized';
  const isPoweredOff = bleState === 'PoweredOff';
  const isPoweredOn = bleState === 'PoweredOn';
  // HarmonyOS 的 state() 只反映蓝牙开关，不反映权限状态（未授权时也显示 PoweredOn），
  // 因此权限按钮需要常显，点击即"检测 + 按需申请"
  const isHarmony = (Platform.OS as string) === 'harmony';

  const startScan = () => {
    setDevices([]);
    setScanError(null);
    setScanning(true);
    const mgr = manager.current;
    if (!mgr) return;
    mgr.startScan({}, (device) => {
      setDevices(prev => {
        const exists = prev.find(d => d.id === device.id);
        if (exists) return prev.map(d => d.id === device.id ? device : d);
        return [...prev, device];
      });
    }, (error) => {
      setScanning(false);
      setScanError(error);
    });
  };

  const stopScan = () => action.run(async () => {
    manager.current?.stopScan();
    setScanning(false);
    return `扫描已停止，共发现 ${devices.length} 个设备`;
  });

  const connectToDevice = (device: BLEDevice) => action.run(async () => {
    const mgr = manager.current;
    if (!mgr) throw new Error('BLE 管理器未初始化');

    // 如果设备已存在连接，先断开确保干净的 native 状态
    // 避免 cleanup 中未完成的 onConnectionStateChange(STATE_DISCONNECTED)
    // 在新连接建立后误删 connectedDevices / deviceCallbacks
    if (mgr.isConnected(device.id)) {
      setNotificationLog(prev => [...prev, `[${nowTime()}] 设备有残留连接，先断开清理...`]);
      await mgr.disconnect(device.id);
      // 等待 native 的 onConnectionStateChange 回调完成清理
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const connectWithTimeout = (deviceId: string, timeoutMs = 15000) =>
      Promise.race([
        mgr.connect(deviceId, (_deviceId, _interrupted, _error) => {
          setConnectedDeviceId(null);
          connectedIdRef.current = null;
          setServices([]);
          setExpandedServices(new Set());
          setNotificationLog(prev => [...prev, `[${nowTime()}] 连接已断开${_interrupted ? '（异常断开）' : ''}`]);
          Alert.alert('连接已断开', _interrupted ? '设备异常断开' : '已断开连接');
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`连接超时 (${timeoutMs / 1000}s)`)), timeoutMs),
        ),
      ]);
    try {
      const connectedId = await connectWithTimeout(device.id);
      setConnectedDeviceId(connectedId);
      connectedIdRef.current = connectedId;
      const deviceLabel = device.name || device.id;
      Alert.alert('连接成功', `已连接 ${deviceLabel}`);
      // 先探索服务（确保 GATT 数据库就绪）
      await exploreServices(connectedId);
      // 协商 MTU：获取实际协商值，用于后续写入分包
      try {
        const negotiatedMtu = await (mgr.requestMTU(connectedId, 517) as unknown as Promise<number>);
        mtuRef.current = negotiatedMtu;
        setNotificationLog(prev => [...prev, `[${nowTime()}] MTU 协商完成: ${negotiatedMtu}`]);
      } catch {
        setNotificationLog(prev => [...prev, `[${nowTime()}] MTU 协商失败，使用默认值 23`]);
      }
      return `已连接 ${deviceLabel}`;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`连接失败: ${msg}`);
    }
  });

  const disconnectDevice = () => action.run(async () => {
    const mgr = manager.current;
    if (!mgr || !connectedDeviceId) throw new Error('未连接任何设备');
    // 先等待所有取消订阅完成（CCCD 写入 0x0000），再断开连接
    // 避免 GATT 操作队列卡住
    const unsubPromises = Array.from(subRefs.current.values()).map(s =>
      s.remove().catch(() => {}),
    );
    subRefs.current.clear();
    setSubscribedChars(new Set());
    await Promise.all(unsubPromises);
    await mgr.disconnect(connectedDeviceId);
    setConnectedDeviceId(null);
    connectedIdRef.current = null;
    setServices([]);
    setExpandedServices(new Set());
    return `已断开 ${connectedDeviceId}`;
  });

  // 探索服务和特征
  const exploreServices = async (deviceId: string) => {
    const mgr = manager.current;
    if (!mgr) return;
    return exploreAction.run(async () => {
      await mgr.discoverServices(deviceId);
      const serviceIds = await mgr.getServices(deviceId);
      const result: { id: string; chars: string[] }[] = [];
      for (const sid of serviceIds) {
        const charIds = mgr.getCharacteristics(deviceId, sid);
        result.push({ id: sid, chars: charIds });
      }
      setServices(result);
      // 默认折叠所有服务，点击展开
      return `发现 ${result.length} 个服务，共 ${result.reduce((sum, s) => sum + s.chars.length, 0)} 个特征`;
    });
  };

  // 读取特征值
  const readChar = (serviceId: string, charId: string) => readAction.run(async () => {
    const mgr = manager.current;
    if (!mgr || !connectedDeviceId) throw new Error('未连接');
    const data = await mgr.readCharacteristic(connectedDeviceId, serviceId, charId);
    const { hex, ascii } = formatByteData(data);
    const summary = `[${shortUUID(charId)}] HEX: ${hex} | ASCII: ${ascii}`;
    setCharResults(prev => ({ ...prev, [`${serviceId}:${charId}`]: summary }));
    return summary;
  });

  // 写入特征值（无响应模式按 MTU 分包，有响应模式由 Android 自动处理）
  const writeWithFragmentation = async (
    deviceId: string,
    serviceId: string,
    charId: string,
    data: number[],
    withResponse: boolean,
  ) => {
    const mgr = manager.current;
    if (!mgr) throw new Error('BLE 管理器未初始化');
    const maxPayload = mtuRef.current - 3;
    if (!withResponse && data.length > maxPayload) {
      setNotificationLog(prev => [...prev, `[${nowTime()}] ⚠️ 无响应写入 ${data.length} 字节，MTU 载荷 ${maxPayload}，超出部分由应用层协议处理`]);
    }
    // 直接发送，不分包（分包属于应用层协议职责）
    await mgr.writeCharacteristic(deviceId, serviceId, charId, data, withResponse);
  };

  const writeChar = (serviceId: string, charId: string) => writeAction.run(async () => {
    const mgr = manager.current;
    if (!mgr || !connectedDeviceId) throw new Error('未连接');
    const inputKey = `${serviceId}:${charId}`;
    const hexStr = writeHexInputs[inputKey] || '';
    const bytes = hexToBytes(hexStr);
    if (bytes.length === 0) throw new Error('请输入要写入的十六进制数据');
    await writeWithFragmentation(connectedDeviceId, serviceId, charId, bytes, writeWithResponse);
    const result = `已写入 ${bytes.length} 字节: ${bytesToHex(bytes)}`;
    setCharResults(prev => ({ ...prev, [inputKey]: result }));
    return result;
  });

  // 填充写入（用于测试 MTU）：将数据用 0xFF 填充到指定大小后发送
  const padWriteChar = (serviceId: string, charId: string) => {
    setPadInfo({ serviceId, charId });
    setPadTargetSize('');
  };

  const doPadWrite = async () => {
    if (!padInfo || !connectedDeviceId) return;
    const mgr = manager.current;
    if (!mgr) return;
    const key = `${padInfo.serviceId}:${padInfo.charId}`;
    const hexStr = writeHexInputs[key] || '';
    const bytes = hexToBytes(hexStr);
    if (bytes.length === 0) {
      Alert.alert('提示', '请先输入十六进制数据');
      return;
    }
    const targetSize = parseInt(padTargetSize, 10);
    if (isNaN(targetSize) || targetSize <= 0) {
      Alert.alert('提示', '请输入有效的目标字节数');
      return;
    }
    if (targetSize <= bytes.length) {
      Alert.alert('提示', `目标大小 (${targetSize}) 必须大于当前数据长度 (${bytes.length})`);
      return;
    }
    // 用 0xFF 填充到目标大小
    const padded = new Uint8Array(targetSize);
    padded.set(bytes);
    padded.fill(0xFF, bytes.length);
    await writeWithFragmentation(connectedDeviceId, padInfo.serviceId, padInfo.charId, Array.from(padded), writeWithResponse);
    const result = `已填充写入 ${targetSize} 字节 (原 ${bytes.length} + 填充 ${targetSize - bytes.length})`;
    setCharResults(prev => ({ ...prev, [key]: result }));
    setPadInfo(null);
    setPadTargetSize('');
  };

  // 订阅/取消订阅特征值通知
  const toggleSubscribe = async (serviceId: string, charId: string) => {
    const mgr = manager.current;
    if (!mgr || !connectedDeviceId) return;
    const key = `${serviceId}:${charId}`;
    if (subscribedChars.has(key)) {
      // 取消订阅：通过 sub.remove() 统一走 unsubcribe，避免重复调用
      try {
        const sub = subRefs.current.get(key);
        if (sub) {
          await sub.remove();
          subRefs.current.delete(key);
        }
        setSubscribedChars(prev => { const next = new Set(prev); next.delete(key); return next; });
        setNotificationLog(prev => [...prev, `[${nowTime()}] 取消订阅 ${shortUUID(charId)}`]);
      } catch (e) {
        Alert.alert('取消订阅失败', String(e));
      }
    } else {
      // 订阅 - 加超时防止 Promise 挂起
      setNotificationLog(prev => [...prev, `[${nowTime()}] 正在订阅 ${shortUUID(charId)}...`]);
      try {
        const sub = await Promise.race([
          mgr.subscribeToCharacteristic(connectedDeviceId, serviceId, charId, (_charId, data) => {
            const { hex, ascii } = formatByteData(data);
            const log = `[${nowTime()}] ${shortUUID(charId)} → HEX: ${hex} | ASCII: ${ascii}`;
            setNotificationLog(prev => [log, ...prev].slice(0, 100));
            setCharResults(prev => ({ ...prev, [`notify:${key}`]: log }));
          }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('订阅超时 (10s)')), 10000)
          ),
        ]);
        subRefs.current.set(key, sub);
        setSubscribedChars(prev => { const next = new Set(prev); next.add(key); return next; });
        setNotificationLog(prev => [...prev, `[${nowTime()}] 已订阅 ${shortUUID(charId)}`]);
      } catch (e) {
        Alert.alert('订阅失败', `特征 ${shortUUID(charId)} 可能不支持通知/指示\n${String(e)}`);
      }
    }
  };

  return (
    <>
      <Panel eyebrow="BLE 状态" title="蓝牙适配器">
        <DataRow
          label="状态"
          value={<Tag tone={isPoweredOn ? 'success' : 'danger'}>{bleState}</Tag>}
        />
        {connectedDeviceId && (
          <DataRow
            label="已连接"
            value={<Tag tone="success">设备 {connectedDeviceId.slice(0, 17)}…</Tag>}
          />
        )}
        {(isUnauthorized || isHarmony) && (
          <ActionRow>
            <ActionButton
              disabled={requestingPerm}
              label={requestingPerm ? '请求中...' : '检测/申请蓝牙权限'}
              onPress={() => void requestBlePermissions()}
            />
          </ActionRow>
        )}
        {isPoweredOff && (
          <ActionRow>
            <ActionButton
              label="打开蓝牙设置"
              onPress={() => void manager.current?.openSettings()}
              tone="secondary"
            />
          </ActionRow>
        )}
        <ActionRow>
          <ActionButton
            disabled={!isPoweredOn || scanning}
            label="扫描设备"
            onPress={() => void startScan()}
            testID="ble-start-scan"
          />
          <ActionButton
            disabled={!scanning}
            label="停止扫描"
            onPress={() => void stopScan()}
            testID="ble-stop-scan"
            tone="secondary"
          />
          {connectedDeviceId && (
            <ActionButton
              label="断开连接"
              onPress={() => void disconnectDevice()}
              tone="danger"
            />
          )}
        </ActionRow>
        {scanError ? <Note>扫描错误: {scanError}</Note> : null}
        <ActionRow>
          <ActionButton
            label={hasNameOnly ? '仅显示有名称的设备' : '显示所有设备'}
            onPress={() => setHasNameOnly(v => !v)}
            tone="secondary"
          />
        </ActionRow>
      </Panel>

      <Panel
        eyebrow="发现设备"
        title={`${(hasNameOnly ? devices.filter(d => d.name) : devices).length} / ${devices.length} 个设备`}
      >
        {devices.length === 0
          ? <Note>点击「扫描设备」开始搜索附近的 BLE 设备。需确保蓝牙已开启。</Note>
          : (hasNameOnly ? devices.filter(d => d.name) : devices).slice(0, 20).map(device => {
              const isThisConnected = device.id === connectedDeviceId;
              return (
                <View key={device.id} style={styles.bleDeviceRow}>
                  <View style={styles.bleDeviceInfo}>
                    <Text style={styles.bleDeviceName}>
                      {device.name || '未知设备'}
                      {isThisConnected ? ' 🛜 已连接' : ''}
                    </Text>
                    <Text style={styles.bleDeviceId}>{device.id}</Text>
                    <Text style={styles.bleDeviceMeta}>
                      RSSI: {device.rssi ?? 'N/A'} dBm
                      {device.serviceUUIDs ? ` · 服务: ${device.serviceUUIDs.length}` : ''}
                    </Text>
                  </View>
                  {isThisConnected ? (
                    <ActionButton
                      label="断开"
                      onPress={() => void disconnectDevice()}
                      tone="danger"
                    />
                  ) : (
                    <ActionButton
                      label="连接"
                      onPress={() => void connectToDevice(device)}
                      tone="secondary"
                    />
                  )}
                </View>
              );
            })}
      </Panel>

      {/* 已连接设备的服务和特征探索 */}
      {connectedDeviceId && services.length > 0 && (
        <Panel eyebrow="设备服务" title={`${services.length} 个服务`}>
          {services.map(svc => {
            const isExpanded = expandedServices.has(svc.id);
            const svcShort = shortUUID(svc.id);
            return (
              <View key={svc.id} style={{ marginBottom: 8 }}>
                <ActionButton
                  label={`${isExpanded ? '▼' : '▶'} ${svcShort} (${svc.chars.length} 个特征)`}
                  onPress={() => {
                    const next = new Set(expandedServices);
                    if (isExpanded) next.delete(svc.id); else next.add(svc.id);
                    setExpandedServices(next);
                  }}
                  tone="secondary"
                />
                {isExpanded && svc.chars.map(charId => {
                  const key = `${svc.id}:${charId}`;
                  const isSubscribed = subscribedChars.has(key);
                  const charShort = shortUUID(charId);
                  const result = charResults[key];
                  const notifyResult = charResults[`notify:${key}`];
                  const writeInput = writeHexInputs[key] ?? '';
                  return (
                    <View key={charId} style={{ paddingLeft: 12, paddingVertical: 6, borderLeftWidth: 1, borderLeftColor: palette.line, marginLeft: 4, marginTop: 4, gap: 4 }}>
                      <Text style={{ color: palette.text, fontSize: 12, fontFamily: 'monospace' }}>{charShort}</Text>
                      <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                        <ActionButton label="读取" onPress={() => void readChar(svc.id, charId)} tone="secondary" />
                        <ActionButton label="写入" onPress={() => void writeChar(svc.id, charId)} tone="secondary" />
                        <ActionButton label="填充写入" onPress={() => padWriteChar(svc.id, charId)} tone="secondary" />
                        <ActionButton label={isSubscribed ? '取消订阅' : '订阅'} onPress={() => void toggleSubscribe(svc.id, charId)} tone={isSubscribed ? 'danger' : 'primary'} />
                      </View>
                      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                        <TextInput
                          placeholder="十六进制，如 01 02 AB"
                          placeholderTextColor={palette.faint}
                          value={writeInput}
                          onChangeText={text => setWriteHexInputs(prev => ({ ...prev, [key]: text }))}
                          style={{ flex: 1, backgroundColor: palette.canvas, color: palette.text, fontFamily: 'monospace', fontSize: 11, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 }}
                        />
                        <ActionButton label={writeWithResponse ? '有响应' : '无响应'} onPress={() => setWriteWithResponse(v => !v)} tone="secondary" />
                      </View>
                      {result ? <Text style={{ color: palette.muted, fontFamily: 'monospace', fontSize: 10, lineHeight: 14 }}>{result}</Text> : null}
                      {notifyResult ? <Text style={{ color: palette.signal, fontFamily: 'monospace', fontSize: 10, lineHeight: 14 }}>{notifyResult}</Text> : null}
                    </View>
                  );
                })}
              </View>
            );
          })}
          <ActionRow>
            <ActionButton
              label="重新探索服务"
              onPress={() => connectedDeviceId && void exploreServices(connectedDeviceId)}
              tone="secondary"
            />
          </ActionRow>
        </Panel>
      )}

      {/* 通知日志 */}
      {notificationLog.length > 0 && (
        <Panel eyebrow="通知日志" title={`${notificationLog.length} 条`}>
          <View style={{ maxHeight: 200, overflow: 'hidden' }}>
            {notificationLog.slice(0, 20).map((log, i) => (
              <Text key={i} style={{ color: palette.muted, fontFamily: 'monospace', fontSize: 10, lineHeight: 14 }}>{log}</Text>
            ))}
          </View>
          <ActionRow>
            <ActionButton label="清空日志" onPress={() => setNotificationLog([])} tone="secondary" />
          </ActionRow>
        </Panel>
      )}

      {exploreAction.state.phase !== 'idle' && <ResultPanel state={exploreAction.state} />}
      {readAction.state.phase !== 'idle' && <ResultPanel state={readAction.state} />}
      {writeAction.state.phase !== 'idle' && <ResultPanel state={writeAction.state} />}
      <ResultPanel state={action.state} />

      {/* 填充写入弹窗（用于测试 MTU） */}
      <Modal visible={padInfo !== null} transparent animationType="fade" onRequestClose={() => setPadInfo(null)}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ backgroundColor: palette.surface, padding: 20, borderRadius: 8, minWidth: 260 }}>
            <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600', marginBottom: 8 }}>填充写入</Text>
            <Text style={{ color: palette.muted, fontSize: 12, marginBottom: 12 }}>
              目标字节数（当前数据尾部填充 0xFF 到该大小）
            </Text>
            <TextInput
              placeholder="如 512"
              placeholderTextColor={palette.faint}
              value={padTargetSize}
              onChangeText={setPadTargetSize}
              keyboardType="numeric"
              autoFocus
              style={{ backgroundColor: palette.canvas, color: palette.text, padding: 8, borderRadius: 4, marginBottom: 12, fontFamily: 'monospace', fontSize: 14 }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
              <ActionButton label="取消" onPress={() => { setPadInfo(null); setPadTargetSize(''); }} tone="secondary" />
              <ActionButton label="确认写入" onPress={() => void doPadWrite()} tone="primary" />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

export function ModuleDemo({ id }: { id: ModuleId }) {
  switch (id) {
    case 'asset': return <AssetDemo />;
    case 'constants': return <ConstantsDemo />;
    case 'file-system': return <FileSystemDemo />;
    case 'font': return <FontDemo />;
    case 'keep-awake': return <KeepAwakeDemo />;
    case 'fetch': return <FetchDemo />;
    case 'linking': return <LinkingDemo />;
    case 'application': return <ApplicationDemo />;
    case 'system-ui': return <SystemUIDemo />;
    case 'splash-screen': return <SplashScreenDemo />;
    case 'linear-gradient': return <LinearGradientDemo />;
    case 'navigation-bar': return <NavigationBarDemo />;
    case 'sharing': return <SharingDemo />;
    case 'ble': return <BleDemo />;
    case 'network': return <NetworkDemo />;
    case 'camera': return <CameraDemo />;
    case 'battery': return <BatteryDemo />;
    case 'background-fetch': return <BackgroundFetchDemo />;
    case 'background-task': return <BackgroundTaskDemo />;
    case 'haptics': return <HapticsDemo />;
    case 'app-metrics': return <AppMetricsDemo />;
    case 'audio': return <AudioDemo />;
    case 'expo-module-showcase': return <ExpoModulesDemo />;
  }

  return <AdditionalModuleDemo id={id} />;
}

const styles = StyleSheet.create({
  compactCode: { backgroundColor: palette.canvas, borderRadius: 4, color: palette.muted, fontFamily: 'monospace', fontSize: 10, lineHeight: 16, padding: 12 },
  fontSpecimen: { alignItems: 'center', flexDirection: 'row', gap: 14 },
  specimenCopy: { flex: 1, gap: 3 },
  specimenTitle: { color: palette.text, fontSize: 18, fontWeight: '700' },
  specimenCaption: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  dynamicSpecimen: { alignItems: 'center', backgroundColor: palette.canvas, borderColor: palette.line, borderRadius: 4, borderWidth: 1, gap: 8, minHeight: 118, justifyContent: 'center' },
  dynamicGlyph: { color: palette.cyan, fontSize: 44 },
  switchRow: { alignItems: 'center', flexDirection: 'row', gap: 16, justifyContent: 'space-between' },
  switchCopy: { flex: 1, gap: 4 },
  switchTitle: { color: palette.text, fontSize: 16, fontWeight: '700' },
  switchCaption: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  methodRow: { flexDirection: 'row', gap: 10 },
  gradientHero: { borderRadius: 18, gap: 10, minHeight: 210, overflow: 'hidden', padding: 22, justifyContent: 'flex-end' },
  gradientEyebrow: { color: '#111920', fontFamily: 'monospace', fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  gradientTitle: { color: '#111920', fontSize: 28, fontWeight: '800', letterSpacing: -0.8, lineHeight: 31, maxWidth: 280 },
  gradientCopy: { color: '#243039', fontSize: 12, fontWeight: '600', lineHeight: 18, maxWidth: 300 },
  gradientDirection: { alignItems: 'center', borderRadius: 12, height: 124, justifyContent: 'center', overflow: 'hidden' },
  gradientDirectionText: { color: '#111920', fontFamily: 'monospace', fontSize: 13, fontWeight: '800', letterSpacing: 2 },
  gradientHardStop: { borderBottomRightRadius: 24, borderTopLeftRadius: 24, height: 92, justifyContent: 'center', overflow: 'hidden', paddingHorizontal: 18 },
  gradientHardStopText: { color: palette.text, fontFamily: 'monospace', fontSize: 11, fontWeight: '800', letterSpacing: 1.4, textAlign: 'center' },
  gradientPartial: { borderRadius: 12, height: 88, justifyContent: 'center', overflow: 'hidden', paddingHorizontal: 18 },
  gradientDegenerate: { borderRadius: 12, height: 72, justifyContent: 'center', overflow: 'hidden', paddingHorizontal: 18 },
  gradientEdgeText: { color: '#111920', fontFamily: 'monospace', fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textAlign: 'center' },
  cameraFrame: { alignItems: 'center', backgroundColor: palette.canvas, borderColor: palette.lineStrong, borderRadius: 6, borderWidth: 1, height: 320, justifyContent: 'center', overflow: 'hidden' },
  cameraInactive: { color: palette.faint, fontFamily: 'monospace', fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  cameraPreview: { height: '100%', width: '100%' },
  bleDeviceRow: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: palette.line },
  bleDeviceInfo: { flex: 1, gap: 2 },
  bleDeviceName: { color: palette.text, fontSize: 14, fontWeight: '600' },
  bleDeviceId: { color: palette.faint, fontFamily: 'monospace', fontSize: 10 },
  bleDeviceMeta: { color: palette.muted, fontSize: 11, marginTop: 1 },
});

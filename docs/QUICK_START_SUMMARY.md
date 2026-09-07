# expo-harmony 快速开始总结

## 项目定位

将 Expo SDK 55 项目运行到 HarmonyOS 上，同时保持 iOS/Android 原有工作流不变。

## 核心思路

- **两套 RN 共存**：iOS/Android 用官方 React Native，HarmonyOS 用 RNOH（`@react-native-oh/react-native-harmony`）
- **Metro 按平台分流**：通过 `EXPO_METRO_TARGET=harmony` 环境变量，Harmony 打包时自动重定向 `react-native` → RNOH、`react` → `react-harmony`
- **Expo CNG 生成原生工程**：`expo-harmony prebuild` 一键生成 `harmony/` 目录（AppScope、Entry、Hvigor、CMake、RNOH 宿主代码）

## 前置条件

| 条件 | 说明 |
|------|------|
| Node.js | >= 20 |
| Expo SDK | 55（`expo@55.0.26`） |
| DevEco Studio | 含 HarmonyOS SDK、OHPM、Hvigor、HDC |
| 设备 | 真机或 DevEco Studio 模拟器 |

## 接入步骤

### 1. 安装依赖

```bash
npm install @expo-harmony/cli @expo-harmony/metro-config \
  @react-native-oh/react-native-harmony@0.84.1 \
  @react-native-oh/react-native-harmony-cli@0.84.1 \
  react-harmony@npm:react@19.2.3
```

每个要用到的 Expo 模块还需安装对应的 `@expo-harmony/expo-*` 包（如 `expo-constants` 配 `@expo-harmony/expo-constants`）。

### 2. 配置 app.json

三处修改：

1. `platforms` 加 `"harmony"`
2. `plugins` 注册 `@expo-harmony/prebuild-config`（放最后），其他 Harmony 插件排它前面
3. 加 `harmony` 配置块（`bundleName` 必填，可选 `permissions`、`targetApiVersion` 等）

### 3. 配置 metro.config.js

```js
const { withHarmonyConfig } = require('@expo-harmony/metro-config');
const isHarmony = process.env.EXPO_METRO_TARGET === 'harmony';
module.exports = withHarmonyConfig(config, {
  enabled: isHarmony,
  projectRoot,
  aliases: { react: 'react-harmony' },
});
```

### 4. 添加脚本

```json
{
  "scripts": {
    "start:harmony": "expo-harmony start",
    "run:harmony": "expo-harmony run",
    "prebuild:harmony": "expo-harmony prebuild",
    "check:harmony": "expo-harmony prebuild . --check",
    "doctor:harmony": "expo-harmony doctor"
  }
}
```

### 5. 生成并运行

```bash
npm run prebuild:harmony   # 生成 harmony/ 原生工程
npm run run:harmony        # 构建 HAP + 安装 + 启动
```

## 已移植的 Expo 模块（30+）

`expo-router`、`expo-camera`、`expo-asset`、`expo-font`、`expo-file-system`、`expo-constants`、`expo-device`、`expo-haptics`、`expo-linking`、`expo-crypto`、`expo-battery`、`expo-blur`、`expo-audio`、`expo-fetch` 等。

## 关键机制

| 机制 | 说明 |
|------|------|
| Metro 分流 | Harmony 打包时 `react-native` → RNOH，`react` → `react-harmony`，业务代码无需修改 |
| 平台判断 | `Platform.OS === 'harmony'`，支持 `.harmony.tsx` 平台后缀文件 |
| 第三方库 | 有 RNOH 适配的成对安装（官方包 + `@react-native-ohos/*`），纯 JS 库直接兼容 |
| 签名 | 通过环境变量 `EXPO_HARMONY_SIGNING_CONFIG_FILE` 注入，不进 git |
| 排错 | `npm run doctor:harmony` 一键检查环境和配置 |

## 开发工作流

### 日常开发循环

```
┌─────────────────────────────────────────────────────────┐
│  ① 修改业务代码（JS/TS）                                  │
│     app/ 目录下的页面、组件、逻辑                           │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  ② 选择性执行：                                          │
│                                                          │
│  ├─ 仅改 JS/TS：Metro 自动热更新（Hot Reload）            │
│  ├─ 改 app.json/插件：npm run prebuild:harmony           │
│  └─ 改原生模块/配置：npm run prebuild:harmony --clean    │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│  ③ 运行：npm run run:harmony                             │
│                                                          │
│  ├─ Debug 模式（默认）：自动起 Metro + 构建 HAP + 安装启动 │
│  │  Ctrl+C 退出，端口复用                                 │
│  └─ Release 模式：--variant release，不启动 Metro         │
└─────────────────────────────────────────────────────────┘
```

### 三端实际工作流

```
                            ┌──────────────────────┐
                            │    日常开发阶段         │
                            │  Android / iOS 为主    │
                            │  ─────────────────    │
                            │  • expo run:android   │
                            │  • expo run:ios       │
                            │  • expo start --web   │
                            │  • 无需安装 Harmony    │
                            │    工具链              │
                            └──────────┬───────────┘
                                       │
                          ┌────────────┴────────────┐
                          │                         │
                          ▼                         ▼
            ┌──────────────────────┐   ┌──────────────────────┐
            │   兼容性测试阶段        │   │    打包/发布阶段       │
            │   HarmonyOS 真机/模拟器 │   │    HarmonyOS 构建     │
            │   ─────────────────   │   │    ─────────────────  │
            │   • expo-harmony run  │   │    • expo-harmony run │
            │   • 验证鸿蒙原生功能     │   │      --variant release│
            │   • 确认 UI 适配        │   │    • 签名 + 生成 HAP  │
            └──────────────────────┘   └──────────────────────┘
```

**关键原则：HarmonyOS 工作流完全独立，互不干扰。**

| 阶段 | 主力平台 | 使用频率 | 工具链要求 |
|------|----------|----------|-----------|
| **日常开发** | Android / iOS | 高（每天） | 无需 Harmony 工具链 |
| **兼容性测试** | HarmonyOS | 中（迭代末期） | 需要 DevEco Studio + 模拟器/真机 |
| **打包发布** | HarmonyOS | 低（发版时） | 需要签名配置 |

#### 为什么这样设计

- `EXPO_METRO_TARGET` 不为 `harmony` 时，`withHarmonyConfig` 原样返回配置，不加载任何 RNOH 依赖
- `@react-native-oh/react-native-harmony` 等 Harmony 专属依赖可以放进 `optionalDependencies`，iOS/Android 同事 `npm install` 时自动跳过
- iOS/Android 开发者不需要装 DevEco Studio、OHPM、Hvigor、HDC 等任何鸿蒙工具链
- `harmony/` 目录是生成物，已加入 `.gitignore`，不影响其他平台

#### 多平台命令对照

| 平台 | 日常开发 | 构建/运行 |
|------|----------|-----------|
| **HarmonyOS** | `npm run start:harmony` | `npm run run:harmony` |
| **Android** | `npx expo start` | `npx expo run:android` |
| **iOS** | `npx expo start` | `npx expo run:ios` |
| **Web** | `npx expo start --web` | `npx expo start --web` |

### 开发阶段细分

#### 阶段一：环境诊断

```bash
npm run doctor:harmony
```

检查项：配置完整性、插件注册、Metro 配置、依赖版本、SDK/NDK、OHPM、Hvigor、HDC、签名。有 error 时以非零状态退出，按输出提示修复。

#### 阶段二：生成原生工程

```bash
# 首次生成
npm run prebuild:harmony

# 强制重新生成（删除 harmony/ 目录后重建）
npm run prebuild:harmony -- --clean

# CI 校验（工程与配置是否同步）
npm run check:harmony
```

生成产物：`harmony/` 目录（AppScope、entry 模块、Hvigor 配置、CMakeLists.txt、RNOH 宿主代码、各模块 HAR 引用）。

#### 阶段三：开发调试

**方式 A — 一键运行（推荐）**

```bash
npm run run:harmony
```

自动完成：环境诊断 → 构建 HAP → 安装到设备/模拟器 → 启动应用。Debug 模式自动起 Metro（`EXPO_METRO_TARGET=harmony`），支持热更新。

**方式 B — 分步运行**

```bash
# 终端 1：启动 Metro
npm run start:harmony -- --port 8081

# 终端 2：构建并运行（不启动 Metro）
npm run run:harmony -- --no-bundler --port 8081
```

适用场景：需要单独观察 Metro 日志，或复用已有 Metro 实例。

#### 阶段四：发布构建

```bash
# Release 构建（Hermes 字节码嵌入 HAP）
npm run run:harmony -- --variant release

# 或只构建 HAP 不部署
npx expo-harmony build --variant release
```

## 编写自定义原生插件

### 重要说明：三端 vs 纯鸿蒙

```
┌─────────────────────────────────────────────────────────────┐
│ 场景一：已有官方 Expo 模块（expo-camera 等），只缺鸿蒙端      │
│                                                              │
│ 你只需要写 HarmonyOS 端的 ArkTS 代码                          │
│ iOS 和 Android 已有官方实现，不需要动                         │
│ 例：@expo-harmony/expo-camera                                │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 场景二：全新的自定义模块，需要三端都支持                       │
│                                                              │
│ 你需要写：                                                    │
│   ├─ HarmonyOS：ArkTS（@expo-harmony/create-expo-module 生成）│
│   ├─ iOS：Swift/ObjC（官方 create-expo-module 生成）          │
│   └─ Android：Kotlin/Java（官方 create-expo-module 生成）     │
│                                                              │
│ 两个脚手架可以配合使用，各管各的平台                            │
└─────────────────────────────────────────────────────────────┘
```

### 场景一：为已有 Expo 模块补充鸿蒙端

这是最常见的情况。官方 Expo 模块（如 `expo-camera`、`expo-file-system`）已有 iOS 和 Android 实现，你只需要为 HarmonyOS 补上 ArkTS 原生代码，已有的 JS 调用方式不变。

```bash
# 为已有模块补充 Harmony 支持
npx @expo-harmony/create-expo-module --add --path ../expo-camera
```

### 场景二：创建全新的三端模块

如果你需要写一个全新的模块（三端都没有现成的），需要同时使用两个脚手架：

```bash
# 1. 用官方脚手架生成 iOS + Android 模板
npx create-expo-module my-module

# 2. 用 harmony 脚手架补充 HarmonyOS 端
npx @expo-harmony/create-expo-module --add --path ./my-module
```

两个脚手架生成的目录结构互补，互不冲突：

```
my-module/
  package.json                    # 包配置（两个脚手架共同修改）
  expo-module.config.json         # 模块配置（platforms 会包含 ios/android/harmony）
  src/
    index.ts                      # JS/TS facade（三端共用）
  ios/                            # 官方脚手架生成（Swift/ObjC）
    MyModule.swift
    MyModule.podspec
  android/                        # 官方脚手架生成（Kotlin/Java）
    src/main/java/.../MyModule.kt
    build.gradle
  harmony/                        # harmony 脚手架生成（ArkTS）
    library/
      Index.ets
      src/main/ets/MyModule.ets
```

### 场景三：仅用于鸿蒙项目的纯 HarmonyOS 模块

如果你的模块只在鸿蒙平台使用（例如调用特定的鸿蒙系统 API，不需要跨平台），可以只写 ArkTS：

```
需要写 HarmonyOS 原生功能
      │
      ▼
┌─────────────────────────────────────────────┐
│ 方式 A：使用已适配的 Expo 模块                  │
│ npm install expo-camera @expo-harmony/expo-camera│
│ + 注册 plugin → prebuild → run                │
└─────────────────┬───────────────────────────┘
                  │ 不满足需求
                  ▼
┌─────────────────────────────────────────────┐
│ 方式 B：创建应用内自定义模块（推荐）              │
│ npx @expo-harmony/create-expo-module         │
│   expo-sensor --local                        │
│ → 写 ArkTS 代码 → 注册 → prebuild → run      │
└─────────────────┬───────────────────────────┘
                  │ 需要复用/发布
                  ▼
┌─────────────────────────────────────────────┐
│ 方式 C：创建独立 npm 模块包                     │
│ npx @expo-harmony/create-expo-module         │
│   @acme/expo-sensor                          │
│ → 写 ArkTS 代码 → 发布 npm → 安装使用          │
└─────────────────────────────────────────────┘
```

### 生成模块脚手架

`@expo-harmony/create-expo-module` 提供三种模式：

```bash
# 1. 创建独立 npm 模块（可发布）
npx @expo-harmony/create-expo-module @acme/expo-sensor

# 2. 创建应用内模块（推荐，生成到 modules/ 目录）
npx @expo-harmony/create-expo-module expo-sensor --local

# 3. 为已有模块补充 Harmony 支持
npx @expo-harmony/create-expo-module --add --path ../expo-sensor
```

### 生成的模块结构

```
modules/expo-sensor/
  package.json                 # 包配置
  expo-module.config.json      # 模块配置（platforms, harmony.modules）
  src/
    index.ts                   # JS/TS facade（导出给业务代码使用）
  harmony/
    AppScope/app.json5         # 应用级配置
    build-profile.json5        # 顶层构建配置
    oh-package.json5           # 顶层 ohpm 配置
    hvigorfile.ts              # 顶层构建脚本
    library/
      Index.ets                # ArkTS 入口（导出模块类）
      oh-package.json5         # library 的 ohpm 配置（依赖 expo-modules-core）
      build-profile.json5      # library 构建配置
      hvigorfile.ts            # 构建脚本（harTasks）
      src/main/
        module.json5           # HAR 模块声明（type: "har"）
        ets/
          SensorModule.ets     # 模块实现文件（核心）
```

### 编写 ArkTS 原生模块

继承 `ExpoModule` 基类，实现 `definition()` 方法：

```typescript
// harmony/library/src/main/ets/SensorModule.ets
import {
  ExpoModule, ExpoModuleContext, ExpoModuleDefinition,
  ExpoModuleError, ExpoPermissionStatus,
} from '@expo-harmony/expo-modules-core';

export class SensorModule extends ExpoModule {
  constructor(context: ExpoModuleContext) {
    super(context);
  }

  definition(): ExpoModuleDefinition {
    return new ExpoModuleDefinition()
      .name('Sensor')                          // JS 侧通过此名称调用
      .constant('isSupported', true)           // 暴露常量
      .syncFunction('getDeviceOrientation',    // 同步函数
        (): string => {
          return 'portrait';
        }
      )
      .asyncFunction('startListening',         // 异步函数
        async (interval: number): Promise<void> => {
          // 调用 HarmonyOS API
        }
      )
      .events(['onSensorData'])                // 声明事件
      .onStartObserving((eventName: string): void => {
        // 开始监听事件（JS 侧调用 addListener 时触发）
      })
      .onStopObserving((eventName: string): void => {
        // 停止监听事件
      })
      .onDestroy((): void => {
        // 模块销毁时清理资源
      });
  }
}
```

### JS/TS 侧调用

```typescript
// src/index.ts
import { requireNativeModule } from 'expo-modules-core';

const Sensor = requireNativeModule('Sensor');

export function getDeviceOrientation(): string {
  return Sensor.getDeviceOrientation();
}

export async function startListening(interval: number): Promise<void> {
  return Sensor.startListening(interval);
}

export { Sensor };
```

### 配置自动链接

```json
// expo-module.config.json
{
  "platforms": ["harmony"],
  "harmony": {
    "modules": ["SensorModule"]
  }
}
```

`platforms` 加 `harmony`，`harmony.modules` 列出模块类名，prebuild 时会自动发现并链接。

### 完整开发流程

```bash
# 1. 创建模块脚手架
npx @expo-harmony/create-expo-module expo-sensor --local

# 2. 编写 ArkTS 原生代码（SensorModule.ets）

# 3. 编写 JS/TS facade（src/index.ts）

# 4. 在 app.json 中注册插件
#    "plugins": ["@expo-harmony/expo-sensor", ...]

# 5. 重新生成原生工程
npm run prebuild:harmony

# 6. 构建运行
npm run run:harmony
```

### ExpoModule 基类提供的完整能力

| 分类 | API | 说明 |
|------|-----|------|
| **常量** | `.constant(name, value)` | 暴露只读常量到 JS 侧 |
| **同步函数** | `.syncFunction(name, fn)` | 同步调用，直接返回值 |
| **异步函数** | `.asyncFunction(name, fn)` | 异步调用，返回 Promise |
| **属性** | `.property(name, getter)` | 可读属性 |
| **事件** | `.events(['event1', 'event2'])` | 声明模块可发出的事件 |
| **事件监听** | `.onStartObserving(fn)` / `.onStopObserving(fn)` | 事件订阅/取消回调 |
| **生命周期** | `.onCreate(fn)` / `.onDestroy(fn)` | 模块创建/销毁 |
| | `.onForeground(fn)` / `.onBackground(fn)` | 前后台切换 |
| | `.onContentAppeared(fn)` | 内容渲染完成 |
| | `.onJavaScriptBundleLoaded(fn)` | JS Bundle 加载完成 |
| | `.onPrepareForReload(fn)` | 热重载准备 |
| | `.onWindowStageSetup(fn)` / `.onWindowStageWillDestroy(fn)` | 窗口生命周期 |
| **Ability** | `.onNewWant(fn)` / `.onActivityResult(fn)` | Ability 事件 |
| **内存** | `.onMemoryLevel(fn)` | 内存压力回调 |
| **共享对象** | `.sharedObjectClass(Cls)` | 注册可共享对象类 |
| **原生 View** | `.view(Cls)` | 注册原生 UI 组件 |

### 调用 HarmonyOS 系统 API

在模块方法中可以直接调用 ArkTS 系统 API：

```typescript
// 使用 UIAbilityContext
const context = this.context.uiAbilityContext;

// 获取应用文件路径
const filesDir = context.filesDir;

// 请求权限
const status = await this.context.requestPermissions(['ohos.permission.CAMERA']);

// 启动其他 Ability
const result = await this.context.startAbilityForResult({
  bundleName: 'com.example.app',
  abilityName: 'EntryAbility',
});

// 发送事件到 JS 侧
this.sendEvent('onSensorData', { x: 1.0, y: 2.0, z: 3.0 });
```

### 使用已有适配的 Expo 模块（无需自己写原生代码）

```bash
# 1. 检查模块 Harmony 支持情况
npx expo-harmony modules list

# 2. 安装官方包 + Harmony 适配包（成对安装）
npm install expo-camera @expo-harmony/expo-camera

# 3. 在 app.json plugins 中注册适配包
#    "@expo-harmony/expo-camera" 排在官方包后面

# 4. 重新生成原生工程
npm run prebuild:harmony

# 5. 构建运行
npm run run:harmony
```

### 签名配置

Debug 构建无需签名即可运行。Release 发布需要：

```bash
# 1. 准备签名文件（证书、私钥库、profile）
# 2. 通过环境变量注入，避免进 git
EXPO_HARMONY_SIGNING_CONFIG_FILE=./signing/release.json npm run run:harmony -- --variant release
```

### 常见开发场景

| 场景 | 操作 |
|------|------|
| 修改 JS 代码 | 保存文件，Metro 自动热更新 |
| 使用已适配的 Expo 模块 | 装包 → 注册 plugin → `prebuild:harmony` → `run:harmony` |
| 编写自定义原生插件 | `create-expo-module` 脚手架 → 写 ArkTS → 注册 → prebuild → run |
| 为已有 npm 模块补充 Harmony 支持 | `create-expo-module --add` 追加 harmony/ 目录 |
| 修改 app.json 配置 | `prebuild:harmony` 重新生成原生工程 |
| 修改 `harmony/` 下原生代码 | 直接修改，`run:harmony` 重新构建 |
| 原生工程被污染想重置 | `prebuild:harmony --clean` 全量重建 |
| CI 检查配置一致性 | `check:harmony`（退出码 0 表示一致，2 表示有差异） |
| 端口冲突 | `--port 8082` 换端口 |
| 清理所有缓存 | 删 `harmony/` + `node_modules/.cache/` + `apps/*/.expo/`，重跑流程 |

## 命令速查

| 命令 | 作用 |
|------|------|
| `expo-harmony prebuild` | 生成/更新 `harmony/` 原生工程 |
| `expo-harmony prebuild --check` | 校验工程与配置是否同步 |
| `expo-harmony prebuild --clean` | 删除并重新生成 |
| `expo-harmony start` | 启动只服务 Harmony 的 Metro |
| `expo-harmony run` | 构建 HAP + 安装 + 启动 |
| `expo-harmony build` | 只构建 HAP |
| `expo-harmony export:embed` | 导出 Hermes 字节码 |
| `expo-harmony doctor` | 环境和配置诊断 |
| `expo-harmony modules list` | 列出模块及 Harmony 支持情况 |

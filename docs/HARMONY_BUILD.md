# HarmonyOS 开发指南

## 环境要求

| 条件 | 说明 |
|------|------|
| Node.js | >= 20 |
| DevEco Studio | 含 HarmonyOS SDK、OHPM、Hvigor、HDC |
| 设备 | 真机或 DevEco Studio 模拟器 |

## 环境变量

每次构建前需要设置以下环境变量指向 DevEco Studio 的工具链：

```bash
# OHPM 包管理器
export HARMONY_OHPM="/Applications/DevEco-Studio.app/Contents/tools/ohpm/bin/ohpm"

# Hvigor 构建工具
export HARMONY_HVIGORW="/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw"

# DevEco Studio 内置 Node.js
export HARMONY_NODE="/Applications/DevEco-Studio.app/Contents/tools/node/bin/node"

# Hvigor 用户缓存目录（可选，避免写入 ~/.hvigor/ 的权限问题）
export HVIGOR_USER_HOME="/tmp/hvigor_home"
```

可以将这些环境变量写入 `~/.zshrc` 或项目 `.env` 文件。

## 步骤

### 1. 环境诊断

```bash
cd apps/demo
export HARMONY_OHPM="..." HARMONY_HVIGORW="..." HARMONY_NODE="..."
yarn run doctor:harmony
```

检查项：配置完整性、插件注册、Metro 配置、SDK/NDK、OHPM、Hvigor、HDC。

### 2. 构建所有 Harmony 模块的 HAR 文件

每个 `@expo-harmony/expo-*` 包需要先构建 HAR（Harmony Archive）文件：

```bash
# 构建单个模块
cd packages/expo-constants
yarn run harmony:build

# 或批量构建所有模块
cd /Volumes/512ssd/_Study/expo-harmony
node ./packages/expo-module-scripts/bin/expo-harmony-module.js build-workspace --root .
```

### 3. 生成 HarmonyOS 原生工程

```bash
cd apps/demo
export HARMONY_OHPM="..." HARMONY_HVIGORW="..." HARMONY_NODE="..." HVIGOR_USER_HOME="..."
yarn run prebuild:harmony
```

生成 `harmony/` 目录，包含 AppScope、entry 模块、Hvigor 配置、OHPM 依赖等。

常用选项：
- `--clean`：删除并重新生成 `harmony/` 目录
- `--check`：校验工程与配置是否同步（CI 用）

### 4. 构建 HAP

```bash
cd apps/demo
export HARMONY_OHPM="..." HARMONY_HVIGORW="..." HARMONY_NODE="..." HVIGOR_USER_HOME="..."
yarn expo-harmony build
```

产出：`harmony/entry/build/default/outputs/default/entry-default-unsigned.hap`

### 5. 运行到设备

#### 方式 A：一键运行（推荐）

```bash
cd apps/demo
export HARMONY_OHPM="..." HARMONY_HVIGORW="..." HARMONY_NODE="..." HVIGOR_USER_HOME="..."
yarn run run:harmony
```

自动完成：环境诊断 → 构建 HAP → 安装到设备 → 启动应用。Debug 模式自动起 Metro，支持热更新。

#### 方式 B：指定设备

```bash
# 查看已连接的设备
hdc list targets

# 指定设备 ID
yarn expo-harmony run --device <设备ID>
```

#### 方式 C：分步运行

```bash
# 终端 1：启动 Metro（必须设置 EXPO_METRO_TARGET=harmony）
EXPO_METRO_TARGET=harmony npx expo start --dev-client --port 8081

# 终端 2：构建并运行（不启动 Metro）
yarn expo-harmony run --device <设备ID> --no-bundler --port 8081
```

> **注意**：Metro 启动时必须设置 `EXPO_METRO_TARGET=harmony` 环境变量，否则 Metro 会按 iOS/Android 模式解析模块，导致 HarmonyOS 的模块路径找不到。`yarn run start:harmony` 命令会自动设置此变量，但如果遇到超时，可以直接用 `EXPO_METRO_TARGET=harmony npx expo start --dev-client --port 8081` 替代。

## 签名配置

### Debug 构建

默认生成的 HAP 是未签名的（`unsigned.hap`）。在以下场景下可以直接运行：

- **模拟器**：无需签名即可安装运行
- **真机**：需要配置签名或开启开发者模式

### Release 构建

正式发布需要签名。准备签名文件（证书、私钥库、profile）后，通过 `app.config.js` 注入：

```bash
# 通过环境变量指定签名配置
EXPO_HARMONY_SIGNING_CONFIG_FILE=./signing/release.json yarn run run:harmony -- --variant release
```

签名配置 JSON 示例：
```json
{
  "certpath": "./signing/release.cer",
  "storeFile": "./signing/release.p12",
  "profile": "./signing/release.profile",
  "storePassword": "***",
  "keyAlias": "key",
  "keyPassword": "***",
  "signAlg": "SHA256withECDSA"
}
```

## 常用命令

| 命令 | 作用 |
|------|------|
| `yarn run doctor:harmony` | 环境诊断 |
| `yarn run prebuild:harmony` | 生成原生工程 |
| `yarn run prebuild:harmony --clean` | 重新生成原生工程 |
| `yarn expo-harmony build` | 构建 HAP |
| `yarn run run:harmony` | 构建并运行 |
| `yarn run start:harmony` | 启动 Metro |
| `yarn expo-harmony modules list` | 列出模块支持情况 |

## 常见问题

### Hvigor 缓存权限问题

错误：`EPERM: operation not permitted, mkdir '/Users/lxf/.hvigor/...'`

解决：设置 `HVIGOR_USER_HOME` 环境变量到可写目录：
```bash
export HVIGOR_USER_HOME="/tmp/hvigor_home"
```

### HAP 安装失败 - 无签名

错误：`error: no signature file`

解决：
- 使用模拟器运行（无需签名）
- 或配置 Debug 签名证书
- 或在 DevEco Studio 中首次运行以自动生成调试证书

### Metro 启动超时

错误：`[ERR_HARMONY_METRO_TIMEOUT] Expo Metro did not become ready on port 8081 within 60000ms`

解决：
- 先检查端口是否被占用：`lsof -ti:8081 | xargs kill -9`
- 直接使用 `EXPO_METRO_TARGET=harmony npx expo start --dev-client --port 8081` 启动，避免 `yarn run start:harmony` 的超时问题
- 使用 `--port` 指定其他端口

### OHPM 网络问题

错误：`FetchPackageInfo failed`

解决：确保已在 DevEco Studio 中完成首次登录和协议确认，或配置代理。

## 开发工作流

```
日常开发（JS/TS） → 保存文件，Metro 自动热更新
修改 app.json/插件 → prebuild:harmony → run:harmony
修改原生模块/配置 → prebuild:harmony --clean → run:harmony
```

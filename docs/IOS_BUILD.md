# iOS 开发指南

## 环境准备

### 前置依赖

- macOS（必需）
- Xcode（>= 16.x）
- CocoaPods（已安装，版本 1.17.0）

```bash
# 检查 Xcode
xcode-select -p

# 检查 CocoaPods
pod --version
```

---

## 首次构建（预生成 iOS 工程）

```bash
cd apps/demo
npm run prebuild:ios
```

此命令会生成 `ios/` 目录并自动执行 `pod install`。

如果 `pod install` 失败，可手动重试：

```bash
cd apps/demo/ios
pod install --no-repo-update
```

---

## 开发调试

### 1. 启动 Metro 开发服务器

```bash
cd apps/demo
npx expo start --dev-client
```

### 2. 运行 App

#### 方式一：模拟器（推荐）

```bash
cd apps/demo
npx expo run:ios
```

自动打开 iOS 模拟器并安装 app。

#### 方式二：真机（Xcode 安装）

由于 `@expo/cli` 的真机安装存在 bug，推荐使用 Xcode 安装：

```bash
cd apps/demo/ios
open ExpoHarmony.xcworkspace
```

Xcode 中：
- 顶部工具栏选择真机设备
- 按 `Cmd + R` 构建并安装

#### 方式三：真机（命令行，如果可用）

```bash
cd apps/demo
npx expo run:ios --device
```

### 3. 真机签名配置

在 Xcode 中打开项目后：
- 选择 `ExpoHarmony` target
- 进入 `Signing & Capabilities`
- `Team` 选择你的 Apple ID
- Xcode 会自动生成 Provisioning Profile

> 免费 Apple ID 限制：
> - 最多注册 3 台真机
> - 证书 7 天有效期，需重新签名
> - 长期使用需 99$/年的 Apple Developer 账号

### 4. 热更新

首次通过 Xcode 安装后，日常开发只需：

```bash
cd apps/demo
npx expo start --dev-client
```

真机上打开 app，修改代码保存后自动热更新（Fast Refresh）。

---

## 项目结构

```
apps/demo/ios/
├── ExpoHarmony.xcworkspace   # Xcode 工作区（入口）
├── ExpoHarmony.xcodeproj     # Xcode 项目
├── Podfile                   # CocoaPods 配置
├── Podfile.properties.json   # Pod 属性配置
└── Pods/                     # CocoaPods 依赖
```

---

## 常见问题

### pod install 失败

**网络问题导致 GitHub 仓库下载失败：**

```bash
# 设置 git 代理（如果有）
git config --global http.proxy http://127.0.0.1:3067
git config --global https.proxy http://127.0.0.1:3067

# 或使用环境变量代理
export https_proxy=http://127.0.0.1:3067
export http_proxy=http://127.0.0.1:3067

# 重试
pod install --no-repo-update
```

**podspec 缺少字段：**

检查 `package.json` 是否包含 `description` 字段。

### 构建失败

```bash
# 清理 DerivedData
rm -rf ~/Library/Developer/Xcode/DerivedData

# 清理 Pods 缓存
cd apps/demo/ios
pod deintegrate
pod install --no-repo-update
```

### 真机安装报错

`TypeError: Cannot convert object to primitive value` — 使用 Xcode 直接安装（`Cmd + R`）即可绕过此问题。

---

## 打包发布

### Archive 导出

1. Xcode 中选 `Any iOS Device` 或真机
2. 菜单栏 `Product` → `Archive`
3. 导出为 `Development` 或 `Distribution` 包

### 更新版本号

在 `apps/demo/android/app/build.gradle` 中修改 `versionCode` 和 `versionName`。

iOS 版本号在 Xcode 项目设置中修改（`TARGETS` → `General` → `Identity`）。
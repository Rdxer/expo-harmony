# Android 打包指南

## 开发调试

### 1. 启动 Metro 开发服务器

```bash
cd apps/demo
npx expo start --dev-client
```

### 2. 构建并运行（Debug 模式）

```bash
cd apps/demo
npm run run:android
```

### 3. 连接真机

USB 连接手机后，需要设置端口转发：

```bash
adb reverse tcp:8081 tcp:8081
```

然后手机打开 app 即可连接 Metro 开发服务器，修改代码后自动热更新。

---

## 正式打包（Release）

### 1. 前置条件

生成 keystore 签名文件（如已有可跳过）：

```bash
cd apps/demo/android/app
keytool -genkeypair -v -storetype PKCS12 -keystore my-release-key.keystore \
  -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
```

### 2. 配置签名

在 `apps/demo/android/app/build.gradle` 的 `signingConfigs` 中添加 release 配置。

推荐通过环境变量读取签名信息，避免密码泄露：

```gradle
signingConfigs {
    release {
        storeFile file(System.getenv("ANDROID_RELEASE_STORE_FILE"))
        storePassword System.getenv("ANDROID_RELEASE_STORE_PASSWORD")
        keyAlias System.getenv("ANDROID_RELEASE_KEY_ALIAS")
        keyPassword System.getenv("ANDROID_RELEASE_KEY_PASSWORD")
    }
}
```

### 3. 打包 Release APK

```bash
cd apps/demo/android

# 设置签名环境变量（根据实际信息替换）
export ANDROID_RELEASE_STORE_FILE="/path/to/your/release-key.keystore"
export ANDROID_RELEASE_STORE_PASSWORD="your_store_password"
export ANDROID_RELEASE_KEY_ALIAS="your_key_alias"
export ANDROID_RELEASE_KEY_PASSWORD="your_key_password"

# 打包 Release APK
./gradlew assembleRelease
```

### 4. 打包 Release AAB（Google Play 上传用）

```bash
cd apps/demo/android
./gradlew bundleRelease
```

### 5. 输出位置

| 类型 | 路径 |
|------|------|
| Debug APK | `apps/demo/android/app/build/outputs/apk/debug/app-debug.apk` |
| Release APK | `apps/demo/android/app/build/outputs/apk/release/app-release.apk` |
| Release AAB | `apps/demo/android/app/build/outputs/bundle/release/app-release.aab` |

---

## 常用 Gradle 命令

| 命令 | 说明 |
|------|------|
| `./gradlew assembleDebug` | 构建 Debug APK |
| `./gradlew assembleRelease` | 构建 Release APK |
| `./gradlew bundleRelease` | 构建 Release AAB |
| `./gradlew clean` | 清理构建缓存 |
| `./gradlew --stop` | 停止 Gradle 守护进程 |

---

## 常见问题

### 打包失败 - 密钥库别名

查询 keystore 中的别名：

```bash
keytool -list -keystore your-keystore-file.keystore -storetype PKCS12
```

### 真机连接不上 Metro

```bash
# 检查设备是否连接
adb devices

# 设置端口转发
adb reverse tcp:8081 tcp:8081

# 查看设备日志
adb logcat -s ReactNative *:E
```
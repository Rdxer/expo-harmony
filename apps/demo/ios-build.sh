#!/bin/bash
# iOS 构建脚本：构建 .app → 安装到真机 → 启动 → 显示日志
# 用法: ./ios-build.sh [--variant debug|release] [--skip-build] [--no-install] [--no-log]
set -euo pipefail

DEMO_DIR="$(cd "$(dirname "$0")" && pwd)"
IOS_DIR="$DEMO_DIR/ios"

# ---------- 环境变量（可用环境变量覆盖） ----------
# 自动签名使用的 Team ID（Apple Development 证书所属）
TEAM_ID="${TEAM_ID:-AL9Z3SJAK8}"
# 目标真机 device id；留空则取 devicectl 里第一台状态为 available 的 iPhone（跳过 iPad）
DEVICE_ID="${DEVICE_ID:-$(xcrun devicectl list devices 2>/dev/null | awk '/iPhone/{for(i=1;i<=NF;i++) if ($i=="available") {for(j=1;j<i;j++) if ($j ~ /^[0-9A-F]{8}-/) {print $j; exit}}}')}"
VARIANT="${VARIANT:-release}"
BUNDLE_ID="${BUNDLE_ID:-cn.baoshuo.expoharmonydemo}"
# 日志过滤正则（配合 --pid 使用）
LOG_REGEX="${LOG_REGEX:-ble|nitro|BLE|ReactNativeJS|Expo|RedBox}"
# 构建产物目录（默认放外置盘，避免系统盘耗尽）
DERIVED_DATA_PATH="${DERIVED_DATA_PATH:-/Volumes/512ssd/_Study/ios-derived-data/demo}"

# ---------- 参数解析 ----------
SKIP_BUILD=0; NO_INSTALL=0; NO_LOG=0
while [ $# -gt 0 ]; do
  case "$1" in
    --variant) VARIANT="${2:-release}"; shift ;;
    --skip-build) SKIP_BUILD=1 ;;
    --no-install) NO_INSTALL=1 ;;
    --no-log) NO_LOG=1 ;;
    *) echo "❌ 未知参数: $1（支持 --variant <debug|release> / --skip-build / --no-install / --no-log）"; exit 1 ;;
  esac
  shift
done

VARIANT_LOWER="$(echo "$VARIANT" | tr '[:upper:]' '[:lower:]')"
[ "$VARIANT_LOWER" = "debug" ] || [ "$VARIANT_LOWER" = "release" ] || { echo "❌ --variant 只支持 debug|release"; exit 1; }

command -v xcodebuild >/dev/null || { echo "❌ 未找到 xcodebuild（需安装 Xcode）"; exit 1; }
command -v xcrun >/dev/null || { echo "❌ 未找到 xcrun"; exit 1; }

if [ "$VARIANT_LOWER" = "debug" ]; then CONFIG="Debug"; else CONFIG="Release"; fi
SCHEME="ExpoHarmony"

# ---------- 1. 编译 ----------
if [ "$SKIP_BUILD" -eq 0 ]; then
  echo "🔨 编译 iOS [$CONFIG] ..."
  cd "$IOS_DIR"
  # 指定具体真机时用 device 目标；未指定则用 generic/platform 目标（不依赖设备在线，方便先出包）
  if [ -n "$DEVICE_ID" ]; then
    DEST="platform=iOS,id=$DEVICE_ID"
  else
    DEST="generic/platform=iOS"
  fi
  xcodebuild -workspace ExpoHarmony.xcworkspace \
    -scheme "$SCHEME" \
    -configuration "$CONFIG" \
    -destination "$DEST" \
    -derivedDataPath "$DERIVED_DATA_PATH" \
    -allowProvisioningUpdates \
    DEVELOPMENT_TEAM="$TEAM_ID" \
    CODE_SIGN_STYLE=Automatic \
    build
else
  echo "⏭️  跳过编译"
fi

APP_DIR="$DERIVED_DATA_PATH/Build/Products/${CONFIG}-iphoneos/ExpoHarmony.app"
APP="$(ls -d $APP_DIR 2>/dev/null | head -1)"
[ -n "$APP" ] && [ -d "$APP" ] || { echo "❌ 未找到 .app 产物：$APP_DIR"; exit 1; }
echo "📦 产物：$APP"

# ---------- 2. 安装 ----------
if [ "$NO_INSTALL" -eq 1 ]; then
  echo "✅ 构建完成（--no-install 不安装）"
  exit 0
fi

if [ -z "$DEVICE_ID" ]; then
  echo "❌ 未找到可用的 iPhone 真机（devicectl list devices 检查）"
  exit 1
fi
echo "📲 安装到设备 $DEVICE_ID ..."
xcrun devicectl device install app --device "$DEVICE_ID" "$APP"

# ---------- 3. 启动 ----------
echo "🚀 启动应用 $BUNDLE_ID ..."
xcrun devicectl device process launch --device "$DEVICE_ID" "$BUNDLE_ID"

# ---------- 4. 日志 ----------
if [ "$NO_LOG" -eq 1 ] || [ "$VARIANT_LOWER" = "release" ]; then
  echo "✅ 完成（Release 无 JS 日志/已 --no-log）"
  exit 0
fi

echo "✅ 已启动，尝试实时日志（Ctrl+C 退出，应用继续运行）："
sleep 2
exec xcrun devicectl device process launch --device "$DEVICE_ID" --console "$BUNDLE_ID" 2>&1 | grep --line-buffered -iE "$LOG_REGEX"
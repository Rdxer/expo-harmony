#!/bin/bash
# Android 全流程脚本：编译 APK → 安装 → 启动 → 显示 logcat 日志
# 用法: ./android-build.sh [--skip-build] [--no-log] [--variant release]
set -euo pipefail

DEMO_DIR="$(cd "$(dirname "$0")" && pwd)"
ANDROID_DIR="$DEMO_DIR/android"

# ---------- 环境变量（可用环境变量覆盖） ----------
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export JAVA_HOME="${JAVA_HOME:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
PACKAGE_NAME="${PACKAGE_NAME:-cn.baoshuo.expoharmonydemo}"
ACTIVITY_NAME="${ACTIVITY_NAME:-.MainActivity}"
VARIANT="${VARIANT:-debug}"
# logcat 过滤正则（配合 --pid 使用）
LOG_REGEX="${LOG_REGEX:-ble|nitro|BLE|ReactNativeJS|AndroidRuntime}"

export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools:$ANDROID_HOME/tools/bin:$PATH"

# ---------- 环境检查 ----------
[ -d "$ANDROID_HOME" ] || { echo "❌ 未找到 ANDROID_HOME: $ANDROID_HOME"; exit 1; }
[ -x "$JAVA_HOME/bin/java" ] || { echo "❌ 未找到 JDK: $JAVA_HOME（可通过 JAVA_HOME 环境变量指定）"; exit 1; }
command -v adb >/dev/null || { echo "❌ adb 不在 PATH 中"; exit 1; }
adb get-state >/dev/null 2>&1 || { echo "❌ 无已连接的 Android 设备（adb devices 查看）"; exit 1; }

SKIP_BUILD=0; NO_LOG=0
while [ $# -gt 0 ]; do
  case "$1" in
    --skip-build) SKIP_BUILD=1 ;;
    --no-log) NO_LOG=1 ;;
    --variant) VARIANT="${2:-debug}"; shift ;;
    *) echo "❌ 未知参数: $1（支持 --skip-build / --no-log / --variant <debug|release>）"; exit 1 ;;
  esac
  shift
done

# ---------- 1. 编译 ----------
if [ "$SKIP_BUILD" -eq 0 ]; then
  echo "🔨 编译 APK（${VARIANT}）..."
  # bash 3.2 不支持 ${VARIANT^} 首字母大写，用 case 映射 gradle task
  case "$VARIANT" in
    debug) GRADLE_TASK="assembleDebug" ;;
    release) GRADLE_TASK="assembleRelease" ;;
    *) echo "❌ 未知 variant: $VARIANT（支持 debug / release）"; exit 1 ;;
  esac
  (cd "$ANDROID_DIR" && ./gradlew "$GRADLE_TASK")
else
  echo "⏭️  跳过编译"
fi

APK="$ANDROID_DIR/app/build/outputs/apk/$VARIANT/app-$VARIANT.apk"
[ -f "$APK" ] || { echo "❌ 未找到 APK: $APK"; exit 1; }

# ---------- 2. 安装 ----------
echo "📲 安装 APK ..."
adb install -r "$APK"

# ---------- 3. 启动 ----------
echo "🚀 启动应用 $PACKAGE_NAME ..."
adb reverse tcp:8081 tcp:8081       # 真机需反向转发才能访问电脑上的 Metro
adb logcat -c                      # 清空旧日志
adb shell am start -n "$PACKAGE_NAME/$ACTIVITY_NAME"

# ---------- 4. 日志 ----------
if [ "$NO_LOG" -eq 1 ]; then
  echo "✅ 完成（--no-log 不显示日志）"
  exit 0
fi

PID="$(adb shell pidof -s "$PACKAGE_NAME" | tr -d '[:space:]')"
if [ -z "$PID" ]; then
  echo "⚠️  未获取到进程 PID，显示全部日志"
  exec adb logcat
fi

echo "✅ 已启动（pid=$PID），实时日志如下（Ctrl+C 退出，应用继续运行）："
sleep 2
# shellcheck disable=SC2086
exec adb logcat --pid="$PID" -v brief | grep --line-buffered -iE "$LOG_REGEX"

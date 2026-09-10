#!/bin/bash
# HarmonyOS 全流程脚本：编译 HAP → 安装 → 启动 → 显示设备日志
# 用法: ./harmony-build.sh [--skip-build] [--no-log]
set -euo pipefail

DEMO_DIR="$(cd "$(dirname "$0")" && pwd)"
HARMONY_DIR="$DEMO_DIR/harmony"

# ---------- 环境变量（可用环境变量覆盖） ----------
DEVECO_HOME="${DEVECO_HOME:-/Applications/DevEco-Studio.app/Contents}"
HVIGORW="$DEVECO_HOME/tools/hvigor/bin/hvigorw"
OHPM="$DEVECO_HOME/tools/ohpm/bin/ohpm"
BUNDLE_NAME="${BUNDLE_NAME:-cn.baoshuo.expoharmonydemo}"
ABILITY_NAME="${ABILITY_NAME:-EntryAbility}"
# hilog 过滤（grep 选项与正则）
LOG_OPTS="${LOG_OPTS:--iE}"
LOG_REGEX="${LOG_REGEX:-ble|napi|expo|react|jsapp}"

export PATH="$DEVECO_HOME/tools/hvigor/bin:$DEVECO_HOME/tools/ohpm/bin:$DEVECO_HOME/sdk/default/openharmony/toolchains:$PATH"
export DEVECO_SDK_HOME="$DEVECO_HOME/sdk"

# ---------- 环境检查 ----------
for f in "$HVIGORW" "$OHPM"; do
  [ -x "$f" ] || { echo "❌ 未找到工具: $f（可通过 DEVECO_HOME 环境变量指定 DevEco 目录）"; exit 1; }
done
command -v hdc >/dev/null || { echo "❌ hdc 不在 PATH 中"; exit 1; }

SKIP_BUILD=0; NO_LOG=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    --no-log) NO_LOG=1 ;;
  esac
done

# ---------- 1. 编译 ----------
if [ "$SKIP_BUILD" -eq 0 ]; then
  # harmony 工程根缺 oh_modules 时先装依赖（ble_nitro 已由 autolinking
  # 通过 node_modules 里的预编译 HAR 引入，无需单独处理）
  if [ ! -d "$HARMONY_DIR/oh_modules" ]; then
    echo "📦 harmony 缺少 oh_modules，执行 ohpm install ..."
    (cd "$HARMONY_DIR" && "$OHPM" install)
  fi
  echo "🔨 编译 HAP ..."
  (cd "$HARMONY_DIR" && "$HVIGORW" assembleHap --mode module -p module=entry@default -p product=default --no-daemon)
else
  echo "⏭️  跳过编译"
fi

HAP="$HARMONY_DIR/entry/build/default/outputs/default/entry-default-signed.hap"
[ -f "$HAP" ] || { echo "❌ 未找到 HAP: $HAP"; exit 1; }

# ---------- 2. 安装 ----------
echo "📲 安装 HAP ..."
hdc install -r "$HAP"

# ---------- 3. 启动 ----------
echo "🚀 启动应用 $BUNDLE_NAME ..."
hdc rport tcp:8081 tcp:8081   # 真机需反向转发才能访问电脑上的 Metro
hdc shell hilog -r            # 清空旧日志，避免混入历史输出
hdc shell aa start -a "$ABILITY_NAME" -b "$BUNDLE_NAME"

# ---------- 4. 日志 ----------
if [ "$NO_LOG" -eq 1 ]; then
  echo "✅ 完成（--no-log 不显示日志）"
  exit 0
fi

echo "✅ 已启动，实时日志如下（Ctrl+C 退出，应用继续运行）："
sleep 3
# shellcheck disable=SC2086
exec hdc shell hilog | grep --line-buffered $LOG_OPTS "$LOG_REGEX"

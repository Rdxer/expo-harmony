#!/bin/bash
# 启动 Metro（HarmonyOS 专用，EXPO_METRO_TARGET=harmony 由 expo-harmony CLI 自动设置）
# 用法: ./harmony-metro.sh [透传给 expo start 的参数，例如 --no-dev --minify]
set -euo pipefail

DEMO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DEMO_DIR"

# 兜底：正常情况下 expo-harmony CLI 内部已设置，显式声明以防直接调用 expo
export EXPO_METRO_TARGET=harmony

echo "🌐 启动 Metro（target=harmony）..."
exec yarn start:harmony "$@"

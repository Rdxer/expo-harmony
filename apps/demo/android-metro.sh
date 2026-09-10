#!/bin/bash
# 启动 Metro（Android/iOS 用，标准 RN，不带 harmony target）
# 用法: ./android-metro.sh [透传给 expo start 的参数，例如 --no-dev --minify]
set -euo pipefail

DEMO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DEMO_DIR"

# 确保不继承 harmony target（避免 shell 环境里残留）
unset EXPO_METRO_TARGET

echo "🌐 启动 Metro（target=android/ios）..."
exec yarn start "$@"

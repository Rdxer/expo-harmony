#!/bin/bash

# 设置环境变量
export HARMONY_OHPM="/Applications/DevEco-Studio.app/Contents/tools/ohpm/bin/ohpm"
export HARMONY_HVIGORW="/Applications/DevEco-Studio.app/Contents/tools/hvigor/bin/hvigorw"
export HARMONY_NODE="/Applications/DevEco-Studio.app/Contents/tools/node/bin/node"

# 要构建的模块列表（按依赖顺序排列）
MODULES=(
  "expo-application"
  "expo-app-metrics"
  "expo-asset"
  "expo-audio"
  "expo-background-fetch"
  "expo-background-task"
  "expo-battery"
  "expo-blur"
  "expo-camera"
  "expo-constants"
  "expo-crypto"
  "expo-fetch"
  "expo-file-system"
  "expo-font"
  "expo-haptics"
  "expo-keep-awake"
  "expo-linear-gradient"
  "expo-linking"
  "expo-navigation-bar"
  "expo-network"
  "expo-sharing"
  "expo-splash-screen"
  "expo-system-ui"
  "expo-task-manager"
)

BASE_DIR="/Volumes/512ssd/_Study/expo-harmony/packages"

SUCCESS=()
FAILED=()

for MODULE in "${MODULES[@]}"; do
  echo ""
  echo "========================================"
  echo "🔨 正在构建: $MODULE"
  echo "========================================"
  
  cd "$BASE_DIR/$MODULE"
  
  # 执行构建
  OUTPUT=$(yarn run harmony:build 2>&1)
  EXIT_CODE=$?
  
  if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ 构建成功: $MODULE"
    SUCCESS+=("$MODULE")
  else
    echo "❌ 构建失败: $MODULE"
    echo "错误信息:"
    echo "$OUTPUT" | tail -50
    FAILED+=("$MODULE")
  fi
done

echo ""
echo "========================================"
echo "📊 构建结果汇总"
echo "========================================"
echo ""
echo "✅ 成功 (${#SUCCESS[@]}):"
for MODULE in "${SUCCESS[@]}"; do
  echo "  - $MODULE"
done
echo ""
if [ ${#FAILED[@]} -gt 0 ]; then
  echo "❌ 失败 (${#FAILED[@]}):"
  for MODULE in "${FAILED[@]}"; do
    echo "  - $MODULE"
  done
else
  echo "🎉 所有模块构建成功！"
fi
# react-native-ble-nitro 迁移到 B 方式（autolinking 自动链接）Spec

## Why
当前 demo 通过 A 方式手动 vendored 集成 react-native-ble-nitro 鸿蒙原生实现：每次 `prebuild:harmony` 会覆盖 `harmony/` 目录，需要重新打补丁（autolinking.cmake、RNOHPackagesFactory.h/.ets、oh-package.json5、build-profile.json5 等），维护成本高且易漏。迁移到 B 方式后，模块仓库自带 `harmony.autolinking` 元数据 + 预编译 HAR，autolinking 全自动识别链接，prebuild 后零手工补丁。

## 现状调研结论（已验证）
- `react-native-ble-nitro/package.json` 的 `harmony.autolinking` 元数据**已完整**：`ohPackageName: @react-native-ohos/react-native-ble-nitro`、`etsPackageClassName: BleNitroPackage`、`cppPackageClassName: BleNitroPackage`、`cmakeLibraryTargetName: rnoh__ble_nitro`
- `harmony/ble_nitro/index.ets` 按 default 导出约定（`export { BleNitroPackage as default }`），与 RNOH CLI 模板生成的 default import 兼容，无需 `etsPackageImport: "named"`
- **唯一硬伤**：`harmony/` 下没有任何 `.har` 文件。expo 侧 `descriptor.ts:214-219`（INVALID_METADATA）与 RNOH CLI `Autolinking.ts:210-212` 两层都会跳过它
- `file:` npm 依赖必须走预编译 HAR 模式；仅 `nativeModulesDir`（默认 `./modules`）下的本地模块允许源码构建 HAR
- **关键技术风险**：`ble_nitro/src/main/cpp/CMakeLists.txt` 通过 walk-up 定位 package root（要求同时存在 `harmony/ble_nitro` + `nitrogen/generated`）。B 模式下 C++ 源码来自 HAR 解包后的 `oh_modules` 目录，HAR 根 = `harmony/ble_nitro`，**包根的 `nitrogen/generated` 不会自动进 HAR**，walk-up 会 FATAL_ERROR。必须解决绑定代码可达性
- `expo.autolinking.harmony.exclude` 生效于 `search.ts:218`，删除后包才会进入搜索结果

## What Changes
- **repo（/Volumes/512ssd/_Study/react-native-ble-nitro）**
  - 调整 C++ 构建布局，使 `nitrogen/generated` 绑定代码在 HAR 解包后可达（推荐：构建 HAR 前将 `nitrogen/generated` 复制进 `harmony/ble_nitro/src/main/cpp/` 旁（如 `harmony/ble_nitro/nitrogen/`），并修改 CMakeLists.txt 的 package-root 定位逻辑同时兼容「包根布局」（vendored/源码开发）与「HAR 解包布局」）
  - 在 `harmony/ble_nitro` 执行 hvigorw assembleHar 生成 `harmony/ble_nitro.har`，产物放入 `harmony/` 根目录
  - 确认 `package.json#files` 包含生成的 `.har` 与所需目录，保证 npm/file: 安装后完整
  - 提供可重复的 HAR 构建脚本（避免手工步骤散失）
- **demo（apps/demo）**
  - 删除 `package.json` 中 `expo.autolinking.harmony.exclude` 的 `react-native-ble-nitro` 条目（exclude 块为空后整块移除）
  - `prebuild:harmony --clean` 重新生成 harmony 工程，验证 autolinking 产物自动包含 ble_nitro（autolinking.cmake、RNOHPackagesFactory.h/.ets、oh-package.json5）
  - 重新应用 prebuild 后必须恢复的手动配置（与 A/B 无关的既有事项）：BLE 权限（ACCESS_BLUETOOTH + APPROXIMATELY_LOCATION）、EntryAbility 的 globalThis 权限注册（ArkTS 严格模式写法）、build-profile.json5 的 `useNormalizedOHMUrl: true`、bundleName 保持 `cn.baoshuo.expoharmonydemo`
  - 清理 A 方式 vendored 残留（`harmony/ble_nitro/`、`harmony/ble_nitro_local/`、`entry/src/main/ets/ble_nitro/`，若 prebuild --clean 未删除则手动清理）
  - 更新 HARMONY_BUILD.md：新增 B 方式章节，A 方式标注为历史方案

## Impact
- Affected specs: 无（首个 spec）
- Affected code:
  - `/Volumes/512ssd/_Study/react-native-ble-nitro`：`harmony/ble_nitro/src/main/cpp/CMakeLists.txt`、`package.json#files`、新增 HAR 构建脚本
  - `/Volumes/512ssd/_Study/expo-harmony/apps/demo`：`package.json`（exclude）、`harmony/`（重新 prebuild）、`src/modules.tsx` 不受影响
  - 文档：`/Volumes/512ssd/_Study/expoHmDemo1/HARMONY_BUILD.md`

## ADDED Requirements

### Requirement: HAR 产物构建
模块仓库 SHALL 能通过一条可重复的命令在 `harmony/ble_nitro` 构建出 `harmony/ble_nitro.har`，且 HAR 解包后包含 `oh-package.json5`、`index.ets`、`src/main/cpp/`（含 CMakeLists.txt 与全部 C++ 源码）以及 CMake 所需的 `nitrogen/generated` 绑定代码。

#### Scenario: HAR 解包后 CMake 可定位全部依赖
- **WHEN** HAR 被 ohpm 解包到 `oh_modules` 并由 RNOH CLI 生成的 `add_subdirectory` 引用
- **THEN** CMake 配置阶段能找到 package root / nitrogen 绑定 / RNOH 与 nitro-modules 依赖，不出现 `could not locate package root` FATAL_ERROR

#### Scenario: 构建脚本可重复执行
- **WHEN** nitrogen 代码重新生成后再次运行 HAR 构建脚本
- **THEN** HAR 内容同步更新（包含最新 generated 绑定）

### Requirement: autolinking 自动识别
demo 在移除 exclude 后执行 prebuild，autolinking SHALL 自动把 react-native-ble-nitro 纳入链接产物：`autolinking.cmake` 含 `rnoh__ble_nitro` target 与 `add_subdirectory` 守卫，`RNOHPackagesFactory.h` include 并注册 `BleNitroPackage`，`RNOHPackagesFactory.ets` default import 并注册，`harmony/oh-package.json5` dependencies 含 `@react-native-ohos/react-native-ble-nitro` 指向 HAR。

#### Scenario: prebuild 产物无需手工补丁
- **WHEN** `prebuild:harmony --clean` 完成后检查四个产物文件
- **THEN** ble_nitro 的注册代码全部存在，无需任何手工编辑

### Requirement: 功能等价
迁移后应用 BLE 功能 SHALL 与 A 方式完全等价：扫描、连接、服务发现、MTU 协商（显示有效荷载 497）、订阅通知、写入。

#### Scenario: 设备冒烟测试
- **WHEN** 在真机上扫描并连接 LEDPLUS-41-X4SML
- **THEN** 特征列表完整、MTU 显示 497、订阅与大数据写入正常

### Requirement: 手动配置恢复
prebuild 后 SHALL 恢复既有的手动配置：BLE 权限声明、EntryAbility globalThis 权限注册、`useNormalizedOHMUrl: true`、默认 bundleName。

#### Scenario: 权限与签名配置完整
- **WHEN** 检查重新生成的 module.json5 / EntryAbility.ets / build-profile.json5 / app.json5
- **THEN** ACCESS_BLUETOOTH、APPROXIMATELY_LOCATION、globalThis 权限注册、useNormalizedOHMUrl、cn.baoshuo.expoharmonydemo 均在位

## REMOVED Requirements

### Requirement: A 方式 vendored 集成
**Reason**: 被 autolinking 自动链接取代，消除每次 prebuild 的手工补丁负担
**Migration**: 删除 demo 中 vendored 副本（harmony/ble_nitro、ble_nitro_local、entry/src/main/ets/ble_nitro）与 package.json exclude；`harmony-build.sh` 中 ble_nitro oh_modules 特判保留（无害）或按实际情况调整

## 风险与回退
- 若 HAR 模式下 CMake 无法稳定定位 nitrogen 绑定（风险最高项），回退方案：继续使用 A 方式（vendored 副本保留在 git，可随时恢复）
- expo patch 逻辑（RNPackage 类型改写、worklets 前移、RN 0.84 兼容）由 expo-harmony 自动应用于全部 add_subdirectory 条目，ble_nitro 预期兼容，需构建验证

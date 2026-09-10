# Tasks

- [x] Task 1: repo 侧 HAR 构建能力（B 方案前置条件，最高风险项，先行验证）
  - [x] 1.1 确认 npm 包 `files` 字段与 `nitrogen/generated` 完整性（file: 安装到 node_modules 后可构建 HAR 所需的一切都在）
  - [x] 1.2 修改 `harmony/ble_nitro/src/main/cpp/CMakeLists.txt`：package-root 定位逻辑同时兼容「包根布局」（现 vendored/源码开发）与「HAR 解包布局」（HAR 根内可找到 src/main/cpp 与 nitrogen 绑定）
  - [x] 1.3 编写 HAR 构建脚本（构建前把最新 `nitrogen/generated` 同步进 `harmony/ble_nitro` 内的约定位置，再执行 hvigorw assembleHar 产出 `harmony/ble_nitro.har`）
  - [x] 1.4 执行脚本生成 HAR，并本地解包验证内容完整（oh-package.json5 / index.ets / src/main/cpp / nitrogen 绑定）
- [x] Task 2: demo 移除 exclude
  - [x] 2.1 从 `apps/demo/package.json` 删除 `expo.autolinking.harmony.exclude` 中的 `react-native-ble-nitro`（块为空则整块删除）
- [x] Task 3: 重新 prebuild 并验证 autolinking 产物
  - [x] 3.1 `yarn run prebuild:harmony --clean` 重新生成 harmony 工程
  - [x] 3.2 检查四个产物：autolinking.cmake（rnoh__ble_nitro target + add_subdirectory 守卫）、RNOHPackagesFactory.h、RNOHPackagesFactory.ets（default import）、oh-package.json5（@react-native-ohos/react-native-ble-nitro 指向 HAR）
- [x] Task 4: 恢复既有手动配置（prebuild 覆盖项，与 A/B 迁移无关但必须）
  - [x] 4.1 module.json5：BLE 权限（ACCESS_BLUETOOTH + APPROXIMATELY_LOCATION）+ ACCELEROMETER
  - [x] 4.2 EntryAbility.ets：globalThis 权限注册（ArkTS 严格模式双重断言写法）
  - [x] 4.3 build-profile.json5：`useNormalizedOHMUrl: true`；确认默认 bundleName `cn.baoshuo.expoharmonydemo` 与 default 签名
- [x] Task 5: 清理 A 方式 vendored 残留
  - [x] 5.1 确认 prebuild --clean 后 `harmony/ble_nitro/`、`entry/src/main/ets/ble_nitro/` 状态，手动删除未被清理的残留（含 `ble_nitro_local/`）
- [x] Task 6: 构建与安装验证
  - [x] 6.1 ohpm install + hvigorw assembleHap 全量构建通过（重点观察 CMake 配置阶段无 `could not locate package root`）
  - [x] 6.2 harmony-build.sh 安装启动，JS bundle 加载正常
- [x] Task 7: 设备冒烟测试（需用户配合真机操作）
  - [x] 7.1 扫描并连接 LEDPLUS-41-X4SML，特征列表完整
  - [x] 7.2 MTU 显示 497（有效荷载）
  - [x] 7.3 订阅通知、大数据写入正常
  - [x] 7.4 特征读取返回真实数据（迁移过程中发现并修复 readCharacteristic 两处鸿蒙 Bug：C++ 回调丢弃 result、读路径 UUID 未大写归一化）
- [x] Task 8: 文档更新
  - [x] 8.1 HARMONY_BUILD.md 新增 B 方式章节（HAR 构建 + autolinking 自动链接流程），A 方式标注为历史方案

# Task Dependencies
- Task 1 → Task 3（HAR 是 autolinking 识别的硬前提）
- Task 2 独立，可先行
- Task 3 → Task 4 → Task 5 → Task 6 → Task 7
- Task 8 依赖 Task 1-7 走通后的实际流程
- 回退预案：Task 1 若受阻，git 恢复 vendored 副本即回到 A 方式，Task 2-8 中止

# Checklist

## repo HAR 构建能力
- [ ] `harmony/ble_nitro.har` 存在且由脚本可重复构建
- [ ] HAR 解包后包含 oh-package.json5、index.ets、src/main/cpp（CMakeLists.txt + 全部 C++ 源码）、nitrogen 绑定代码
- [ ] CMakeLists.txt 兼容包根布局与 HAR 解包布局，vendored 方式（demo 旧副本）仍可构建
- [ ] package.json#files 保证 npm/file: 安装后 HAR 与所需文件完整

## autolinking 自动识别
- [ ] apps/demo/package.json 不再排除 react-native-ble-nitro
- [ ] prebuild --clean 后 autolinking.cmake 含 rnoh__ble_nitro target 与 if(NOT TARGET) 守卫
- [ ] RNOHPackagesFactory.h include BleNitroPackage.h 并 make_shared 注册
- [ ] RNOHPackagesFactory.ets default import BleNitroPackage 并 new 注册
- [ ] harmony/oh-package.json5 dependencies 含 @react-native-ohos/react-native-ble-nitro（指向 HAR）
- [ ] 产物中无任何需要手工编辑的 ble_nitro 相关缺口

## 手动配置恢复
- [ ] module.json5 含 ACCESS_BLUETOOTH、APPROXIMATELY_LOCATION、ACCELEROMETER
- [ ] EntryAbility.ets 含 globalThis 权限注册（严格模式写法）
- [ ] build-profile.json5 含 useNormalizedOHMUrl: true
- [ ] app.json5 bundleName 为 cn.baoshuo.expoharmonydemo，default 签名

## 清理与构建
- [ ] vendored 残留（harmony/ble_nitro、ble_nitro_local、entry/src/main/ets/ble_nitro）已清理
- [ ] ohpm install + hvigorw assembleHap 构建成功，CMake 无 package root FATAL_ERROR
- [ ] HAP 安装启动，JS bundle 加载成功

## 功能等价（真机冒烟）
- [ ] 扫描并连接 LEDPLUS-41-X4SML 成功，特征列表完整
- [ ] MTU 显示 497（有效荷载）
- [ ] 订阅通知与大数据写入正常

## 文档
- [ ] HARMONY_BUILD.md 含 B 方式章节，A 方式标注为历史方案

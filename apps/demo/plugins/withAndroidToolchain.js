'use strict';

const {
  createRunOncePlugin,
  withAppBuildGradle,
  withProjectBuildGradle,
  withGradleProperties,
} = require('@expo/config-plugins');

const PLUGIN_NAME = 'expo-harmony-demo-android-toolchain';

// minSdk 24：worklets / nitro-modules / screens 的预编译库要求（否则 prefab 报 CXX1214）。
// ndkVersion 固定 27.0.12077973：本机 27.1.12297006 安装损坏（缺 platforms/build/meta 目录），
// 会让 CMake 拿不到有效 platform 并回退到默认 minSdk 22，进而触发同一 CXX1214 报错。
const MIN_SDK = 24;
const NDK_VERSION = '27.0.12077973';
const EXT_SNIPPET = [
  'ext {',
  `  // withAndroidToolchain：minSdk 需 24（worklets/nitro/screens 预编译库要求）`,
  `  minSdkVersion = ${MIN_SDK}`,
  `  // withAndroidToolchain：本机 NDK ${NDK_VERSION} 完整，27.1.12297006 安装损坏（缺 platforms）`,
  `  ndkVersion = "${NDK_VERSION}"`,
  '}',
].join('\n');

function withRootProjectGradle(config) {
  return withProjectBuildGradle(config, (mod) => {
    let contents = mod.modResults.contents;

    // 幂等：已包含两个关键值则跳过
    if (contents.includes(`minSdkVersion = ${MIN_SDK}`) && contents.includes(NDK_VERSION)) {
      return mod;
    }

    if (/ext\s*\{/.test(contents)) {
      // 已有 ext 块：在块内注入两个属性（先抹掉旧值再补，保持合法 Groovy）
      contents = contents.replace(
        /ext\s*\{[\s\S]*?\}/,
        EXT_SNIPPET
      );
    } else {
      contents = contents.replace(
        /buildscript\s*\{/,
        `${EXT_SNIPPET}\n\nbuildscript {`
      );
    }

    mod.modResults.contents = contents;
    return mod;
  });
}

function withAppMinSdk(config) {
  return withAppBuildGradle(config, (mod) => {
    mod.modResults.contents = mod.modResults.contents.replace(
      /minSdkVersion\s+rootProject\.ext\.minSdkVersion/,
      `minSdkVersion ${MIN_SDK} // withAndroidToolchain`
    );
    return mod;
  });
}

function withPropertiesMinSdk(config) {
  return withGradleProperties(config, (mod) => {
    mod.modResults = mod.modResults.filter((item) => item.key !== 'android.minSdkVersion');
    mod.modResults.push({ type: 'property', key: 'android.minSdkVersion', value: String(MIN_SDK) });
    return mod;
  });
}

function withAndroidToolchain(config) {
  config = withRootProjectGradle(config);
  config = withAppMinSdk(config);
  config = withPropertiesMinSdk(config);
  return config;
}

module.exports = createRunOncePlugin(withAndroidToolchain, PLUGIN_NAME);
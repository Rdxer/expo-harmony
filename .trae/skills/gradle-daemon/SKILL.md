---
name: "gradle-daemon"
description: "解释 Gradle Daemon（Java 进程）的内存占用问题，并提供管理方法。当用户看到 Java 进程占用大量内存（如 2GB+）并询问原因时调用。"
---

# Gradle Daemon 内存占用说明

## 这是什么

Gradle Daemon 是 Android 构建系统（Gradle）的后台守护进程。当你执行 `./gradlew assembleRelease`、`npm run run:android` 等构建命令时，Gradle 会自动启动一个常驻的 JVM 进程来加速后续构建，避免每次重新加载 JVM 的开销。

## 为什么内存占用高

- Android 构建本身很重，需要加载 AGP（Android Gradle Plugin）、Kotlin 编译器、各种依赖库等
- 2-4GB 的占用对于 Gradle Daemon 是正常范围，大型项目可能达到 4-6GB
- 它会在后台保持运行，以便下次构建时复用

## 如何关闭

如果不需要它继续运行，可以通过以下命令停止：

```bash
./gradlew --stop
```

这会杀掉 Gradle Daemon 进程，释放内存。下次构建时会自动重新启动。

## 建议

- **开发过程中**：建议保留 Daemon，可以加速反复构建
- **开发结束**：运行 `./gradlew --stop` 释放内存
- **不会影响任何文件**：杀掉 Daemon 不会丢失任何数据或损坏项目
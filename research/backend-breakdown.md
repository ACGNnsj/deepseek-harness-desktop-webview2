# 后端耗时分解(#15)

结论：主导项是 `main::service::workflow::install` 下载+校验+解压，单轮约25s，超过 `context_ready` 6.5-10s。插件 ENOTDIR 是独立噪音、非阻塞。Rust 1162 全过证明慢在 IO而非逻辑。

## 分段(新轮 21dc87c1 `.temp/ci-21dc87c1-job-x64.log`)
- Rust 服务启动：`STARTUP_BOOT logger_ready` 67-273ms可忽略；`context_ready` 6592/6617/10382ms，即后端启动主体。发射点 `apps/desktop/src-tauri/src/lib.rs:47,61`，模块列表 `apps/desktop/src-tauri/src/service/mod.rs:1-14`(download/plugin/workflow)。
- 下载缓存：`workflow::install Starting` 14:25:06.248 → `download::core Download completed 124791386 bytes` 14:25:07.786(约1.5s) → `integrity verified` 14:25:16.532(约8.7s) → `Extraction completed` 14:25:30.867(约14.3s) → `All installation tasks completed` 14:25:31.417。合计约25.2s，其中解压+校验占23s为主导子项。
- 插件 install/preinstall：`ERROR main::service::plugin::install` + `WARN frontend [Harness] internal plugin install failed; continuing startup`(14:25:33.083 及 14:26:39/14:29:03 各轮重试)，原因 `ENOTDIR: realpath ...deepseek-harness-pkg-<plat>.asar/node_modules/.../bin.js` 把 .asar 当目录。fail-fast，后端错、前端继续，不计入启动主路径耗时。
- 窗口能力与 IPC 就绪：后端日志无独立计时；`tests/e2e/setup/shell.ts:130 waitForShellTarget` CDP 超时属壳层门槛，不归后端。
- 健康度：`test result: ok. 1162 passed; 0 failed; 1 ignored; finished in 24.45s`，后端逻辑无故障。

## 与 #17 时间线对齐
- #17 分界：`STARTUP_BOOT`=后端计时，`ENOTDIR`=后端 `plugin::install`，`CDP 超时`=壳层，`boot()` WARN=前端观测点。本票延用该分界。
- #17 老轮 context_ready 5.5-9s，新轮 6.5-10.4s，量级一致；新轮补齐了 workflow 下载链的精确分段。

## 主导项排序
`workflow::install` 约25s > `context_ready` 6.5-10s > `logger_ready` <0.3s > `plugin ENOTDIR`(fail-fast 噪音)。优化顺序先看下载校验+解压(缓存/增量/后台预装)，再看 context 初始化。

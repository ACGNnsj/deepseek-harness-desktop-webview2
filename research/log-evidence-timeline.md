# 日志证据与时间线清单（#17）

原料：CI run 151050a8 Rust tests & Desktop CDP E2E 五平台 job 日志（.temp/ci-151050a8-job-*.log），watch 档 ci-151050a8-44907431325-watch.log。本地复跑：.temp/browser-test.log 无 STARTUP_BOOT/CDP/ENOTDIR 命中（4KB 旧探针），视为无本地复跑证据。

## 平台↔job
- ubuntu-22.04-arm→136855985429｜ubuntu-22.04→136855985456｜macos-26→136855985459｜macos-26-intel→136855985468｜windows-latest→136855985477
- 每份 job 各含 15 处 STARTUP_BOOT（同 job 内多轮 E2E 复跑重复，非 15 个阶段）。

## STARTUP_BOOT（抽查）
- 429 arm：logger_ready 65-209ms；context_ready 5530-6128ms
- 456 x64：logger_ready 87-217ms；context_ready 6711-9002ms
- 477 win：logger_ready 112-164ms；context_ready 7634ms 附近
- 459 mac：logger_ready 3-4ms；context_ready 5679ms 附近
- 结论：logger_ready 均<250ms（mac 上仅个位数ms）；context_ready 5.5-9s，为启动耗时主体（→#15）。

## 标准单轮时间线（429，UTC 2026-11-21）
1. 13:15:51 logger_ready（209ms）→13:15:57 context_ready（6128ms）→dbind/AT-SPI 警告（无害）
2. 13:16:22 profile manifest+scheduler→13:16:24 [Harness] boot()x2（href tauri://localhost，WebView 侧 JS 启动）
3. 13:16:24 pnpm/CLI shims→NEEDS_REINSTALLx8→reinstall→13:16:57 ENOTDIR（见下）
4. shell.ts:130 waitForShellTarget→“等待 Electron CDP 就绪超时：fetch failed”→boot/profile-window/theme 三用例同错（429 行4710-4714；456 同模式）

## CDP 超时点
- tests/e2e/setup/shell.ts:130 waitForShellTarget，被 boot.e2e.ts:130/profile-window.e2e/theme.e2e:76 引用。
- 429 行4710/4712/4714 三处 ::error；456 同错。属“壳已起、CDP 未就绪/不可连”，卡在 Electron 层暴露调试端口之前。

## ENOTDIR 警告
- Error: ENOTDIR: not a directory, realpath '…/.cache/dsh-e2e/<plat>/dependencies/dsh/deepseek-harness-pkg-<plat>.asar/node_modules/@deepseek-ai/dsh/lib/bin.js'
- 429（13:18:25）/456（13:17:42）行内：dsh plugin install exit 1→ERROR main::service::plugin::install→WARN frontend [Harness] internal plugin install failed; continuing startup。
- 定性：把 .asar 文件当目录 realpath；插件预装失败但前端继续启动——非 CDP 超时直接原因，独立后端噪音（→#15）。

## 前后端分界（以后票共用）
- 后端 Rust：main / main::service::* / main::bridge::* / main::config::*。
- 前端（含 Harness，WebView/壳层 JS）：WARN frontend: [Harness] boot()/internal plugin install failed; continuing startup。
- 壳层 Electron：dbind/AT-SPI、CDP 就绪/窗口生命周期（shell.ts waitForShellTarget）。
- 落位：STARTUP_BOOT=后端计时；ENOTDIR=后端 plugin::install；CDP 超时=壳层门槛；boot() WARN=前端观测点。

## 给 #15/#16 的交接
- #15：context_ready 5.5-9s 主体 + workflow::install 下载解压（127MB asar，约90s 含校验）+ ENOTDIR 根因。
- #16：boot() 双调用、INSTALL_FAILED 后前端继续、CDP 前窗口是否 paint。

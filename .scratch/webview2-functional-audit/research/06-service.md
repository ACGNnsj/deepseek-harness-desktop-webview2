# Issue 6 · WebView2 0.32.0 服务层功能调查

基线 `8967e57548e69599529b4eaf10ad4a6a47a9c429`，仓库 `ACGNnsj/deepseek-harness-desktop-webview2`。协调者确认现场桌面进程为 0.31.22、安装核心为 0.2.2-rc.5，两项都属于现场环境记录。本报告检视 0.32.0 源码。按本轮授权检查 WebView2，未采用面向旧 Electron 的运行测试流程。

## 1. Major · 桌面更新共用上游仓库地址（静态证实）

**触发和结果**：从设置检查更新或进入自动更新检查，且构建允许正式版更新。桌面 store 通过 `check_desktop_update` 和 `download_desktop_update` 进入 Rust，检查与下载都进入 `fetch_latest_release`。它把 `REPO_URL` 固定为 `https://github.com/hairyf/deepseek-harness-desktop`，同一参数构造 Atom、兜底 tag、expanded assets 和下载 URL。预期从本产品的 fork 渠道查找较新的兼容安装包。现状会漏掉仅在 fork 公开的升级。如果上游存在更高正式版且资产匹配 Windows 安装包选择规则，旧 app 还可能显示上游安装包，其实际安装效果未验证。当前上游 URL 可能重定向，目的仓库的最终 owner 未实测。README 下载链接属于另一个入口，修改它不会改变这个 Rust 常量。

**责任与源码**：桌面 Rust 更新服务持有仓库地址。调用链见 [apps/desktop/src/store/modules/desktop-updater/store.ts:57–97](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src/store/modules/desktop-updater/store.ts#L57-L97)、[apps/desktop/src-tauri/src/bridge/updater.rs:9–23](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/bridge/updater.rs#L9-L23)、[apps/desktop/src-tauri/src/service/update/install.rs:185–194](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/service/update/install.rs#L185-L194)、[apps/desktop/src-tauri/src/service/update/install.rs:417–425](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/service/update/install.rs#L417-L425)、[apps/desktop/src-tauri/src/service/update/mod.rs:61–62](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/service/update/mod.rs#L61-L62)、[apps/desktop/src-tauri/src/service/update/meta.rs:380–424](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/service/update/meta.rs#L380-L424)、[apps/desktop/src-tauri/src/service/update/meta.rs:435–464](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/service/update/meta.rs#L435-L464)。

**验证与限制**：`git grep -n REPO_URL -- apps/desktop/src-tauri/src/service/update` 返回 `mod.rs:62` 上游常量及 `meta.rs:384` 入口。`gh api repos/ACGNnsj/deepseek-harness-desktop-webview2/releases/latest` 和 `gh api repos/ACGNnsj/deepseek-harness-desktop-webview2/releases/tags/v0.32.0` 均返回 `gh: Not Found (HTTP 404)`。纠正：协调者核验并提供正确发布标签后，本研究者复查 `gh api repos/ACGNnsj/deepseek-harness-desktop-webview2/releases/tags/webview2-v0.32.0` 返回 `prerelease: true`，NSIS `Deepseek.Harness.Desktop_0.32.0_x64-setup.exe` 11729746 字节，SHA-256 `6dc45eb848d6d8deeffd2ba8ff9f457ee50f4aeea6cf89054243bf4527abec40`；MSI `Deepseek.Harness.Desktop_0.32.0_x64_en-US.msi` 18182498 字节，SHA-256 `416bbb0a7865e36bc7d3faa234f1d24485a58e3837e9f36fe16f23c68ba7d99d`。先前 v0.32.0 查询使用了错误标签，latest 404 与当前发布为 prerelease 相符，不能据此推断无发布。版本解析还存在渠道接线缺口：`version.rs:30–31` 仅去 v 前缀，`meta.rs:156–181` 因此会跳过 `webview2-v0.32.0`；更高同前缀版本同样会跳过。仅改 owner 不能修好更新，需同时定义此渠道的标签解析和 prerelease 策略。未运行检查、下载或安装。

**最小建议**：从 WebView2 发布配置注入仓库身份，并用 fork 的真实 tag 及资产名制作离线夹具，覆盖检查和下载都只返回 WebView2 对应资产。

## 2. Major · 远端活跃核心的坏元数据隐藏健康副本（隔离源码探针复现）

**触发和结果**：远端依赖目录同时有 `dsh` 与健康的 `dsh-*` 版本副本。若 `dsh` 可见入口仍在、相应 `package.json` 缺失或无法解析，探针会输出记录，解析器打上 `unreadable`。服务随后在映射任一副本前提前返回 `availability: 'unreadable', slots: []`，远端目标 API 就没有任何可展示的健康副本。预期保留活跃槽错误并同时列出其余副本。若活跃目录连入口都缺，另一个分支会直接跳过该目录，返回结果也没有这个坏槽的诊断。跳过特定临时名是显式设计。

**责任与源码**：远端插件宿主探针判断目录能否入表，远端 core 服务组装目标响应。入口及相关分支见 [packages/builtin-plugin-remote/src/host/server/routes/core.current.get.ts:6–10](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/packages/builtin-plugin-remote/src/host/server/routes/core.current.get.ts#L6-L10)、[packages/builtin-plugin-remote/src/host/service/core.ts:66–106](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/packages/builtin-plugin-remote/src/host/service/core.ts#L66-L106)、[packages/builtin-plugin-remote/src/host/service/core.ts:126–159](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/packages/builtin-plugin-remote/src/host/service/core.ts#L126-L159)、[packages/builtin-plugin-remote/src/host/service/core.utils.ts:26–50](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/packages/builtin-plugin-remote/src/host/service/core.utils.ts#L26-L50)、[packages/builtin-plugin-remote/src/host/service/core.utils.ts:93–111](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/packages/builtin-plugin-remote/src/host/service/core.utils.ts#L93-L111)。

**验证与限制**：基线 Node v26.13.0 隔离 VM 直接执行经 Node `stripTypeScriptTypes` 处理的源码，stub SSH 响应含 `dsh` 无效 JSON `{` 和 `dsh-0.2.3` 有效 JSON：`remote broken active: unreadable 0 healthy only: present 1`（断言通过），复现实际服务提前返回健康副本清单为空；纯健康副本控制样例返回 1 个 slot。未验证实际 SSH、最终界面和恢复或激活操作。

**最小建议**：复用 `slotOf` 返回每个副本的状态，同时保留活跃槽错误。为目录无入口单独输出可诊断的坏槽，继续过滤约定的临时目录。最小回归夹具包含坏活跃槽和一个有效版本槽。

## 3. Minor · 完成的远端安装任务长期留在进程内（隔离源码探针复现）

**触发和结果**：持续运行的宿主多次完成或失败远端核心安装。`tasks.create` 为每个任务写入模块级 `Map`，每条记录的事件有环形上限。成功与失败写入终态，`finally` 清理的是另一份在途去重索引。受查生产代码找不到 `tasks.forget` 的调用。预期在满足重连补拉和终态展示的时间窗口后回收记录。当前能明确的是记录保留，未测量常驻内存影响。

**责任与源码**：远端任务事件服务负责历史记录生命周期。见 [packages/builtin-plugin-remote/src/host/service/tasks.ts:14–20](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/packages/builtin-plugin-remote/src/host/service/tasks.ts#L14-L20)、[packages/builtin-plugin-remote/src/host/service/tasks.ts:40–61](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/packages/builtin-plugin-remote/src/host/service/tasks.ts#L40-L61)、[packages/builtin-plugin-remote/src/host/service/core.ts:221–234](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/packages/builtin-plugin-remote/src/host/service/core.ts#L221-L234)、[packages/builtin-plugin-remote/src/host/server/routes/core.tasks.events.get.ts:6–13](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/packages/builtin-plugin-remote/src/host/server/routes/core.tasks.events.get.ts#L6-L13)。

**验证与限制**：Node v26.13.0 隔离 VM 直接执行源码，模拟建立并完成 200 个任务（每个追加 10 条事件）：`completed retained: 200 events per task: 5`，assert 通过。证明环形事件上限不回收任务主记录；这不是实际生命周期压力或堆内存测量。生产搜索未找到 `tasks.forget` 调用。

**最小建议**：在事件服务给已终结记录加有界保留策略，保留在途任务。用固定时钟测试终态在保留期内仍可补拉且期满可回收。

## 可复制验证命令

本工作树未提交的独立探针位于 `.temp/06-service-probe.cjs`，运行 `node .temp/06-service-probe.cjs`。它读取本工作树三个源文件，在 VM 中执行并 stub 远端会话与宏；没有网络、真实 SSH 或用户档案访问。Node 内置 TypeScript strip 需 Node 22.13+。单任务事件上限人为设为 5，以验证环形裁剪不影响主 Map 生命周期，未声称真实配置就是 5。

## 覆盖与雾区

- 已覆盖桌面更新仓库选择、稳定 tag 与资产构建入口、远端副本枚举和状态投影、任务记录和在途去重释放。
- 已按正确标签复核 fork 线上两个 Windows 资产名、字节数与发布摘要，未下载文件核对摘要。未检查上游最终重定向、桌面本地核心选择和安装进度、真正的取消行为、readonly profile 从桥接到 UI 的完整可见行为、插件同步出错和回滚边界。没有命中或没有进入探针的路径维持未知。没有读取真实档案或操作现场应用。

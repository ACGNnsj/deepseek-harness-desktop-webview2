# Issue5：侧栏状态与提示来源边界首轮报告

- 基线：WebView2 0.32.0，`8967e57548e69599529b4eaf10ad4a6a47a9c429`。研究分支 `audit-state`。
- 调查时间：2026-11-20。独立工作树，只新增本报告；探针保留于本工作树 `.temp/state-probe.cjs`，不提交。
- 结论：本轮未确认本仓 0.32.0 的侧栏丢配置或 provider 左上提示无关闭按钮回归；确认安装插件代码在两个隔离前提下存在持久化风险。不得把条件复现直接升级为现场根因。
- 现场版本：协调者只读确认运行桌面为 0.31.22（PID19324），本研究未独立复验进程。允许读取的核心清单 `C:/Users/ASUS/AppData/Roaming/dsh-tauri/dependencies/dsh/node_modules/@deepseek-ai/dsh/package.json:4` 确认为 `0.2.2-rc.5`。这些不是 0.32.0 运行复测。
- 规范：已读取根 AGENTS 与 devlopment/testing、desktop.baisc/ui/test、plugin.baisc/client/host/host.service/test。用户明确要求 WebView2，优先于旧 Electron 限制。未读 archive、凭据、用户日志或真实配置；未改产品/已装插件，未 build、重启、升级、创建 PR 或修改 Issue。

## 1. 已确认的来源边界

1. 本仓设置菜单链：`packages/builtin-plugin-ui/src/client/register/sections.ts:6-16` 初始化并订阅槽位/语言变化 → `client/service/sections.ts:7-11,21-44` 投影已注册设置项 → `client/store/modules/sections.ts:7-20` 保存内存列表 → `client/ui/settings-sidebar.tsx:52,116-124,198-201` 搜索及选择。该入口管理设置页项目，不负责第三方侧栏隐藏记录；不能把其内存列表刷新等同于隐藏偏好丢失。
   基线永久链接：[槽位订阅](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/packages/builtin-plugin-ui/src/client/register/sections.ts#L6-L16)、[设置投影](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/packages/builtin-plugin-ui/src/client/service/sections.ts#L7-L44)。
2. 第三方隐藏状态由安装插件 `C:/Users/ASUS/.dsh/profiles/desktop/node_modules/dsh-sidebar-manager/lib/client.js` 持有；包清单 `C:/Users/ASUS/.dsh/profiles/desktop/node_modules/dsh-sidebar-manager/package.json:2-3,7-10` 声明 `dsh-sidebar-manager@0.12.1`，上游为 `zuojinxin/dsh-sidebar-manager`，不是本仓代码。用户已说明它带本地 guard 补丁，因此声明版本不等于官方 0.12.1 原始内容。本轮不推断补丁差异或完整修复状态。
3. 安装脚本 `client.js:13-18,967-994,1066-1081` 以 `dsh-sidebar-nav-collapse:state` 浏览器 localStorage 记录隐藏、折叠、排序等字段；此读取范围没有 profile 后端持久化调用。未验证来源端口变化、WebView2 数据目录或 profile 切换是否改变该存储命名空间。

## 2. 条件性问题 A：来源未就绪时，hidden 清理会把未知当作已卸载

- 严重度：P2 / Major（条件成立会持久化删除用户隐藏选择）；证据等级：真实函数隔离 VM 复现；现场触发未验证。责任来源：第三方安装插件，不能列作已证实的本仓 0.32.0 回归。
- 精确源码：上述安装 `lib/client.js:794-810` 的 `panelIdsByLabel` 在注册表缺失、返回类型不符或异常时返回空 Map；`1907-1978` 的 `pruneRecords`；关键删除点 `1947-1957`，写回 `1976`。
- 触发：已有 `hidden=['plugin-x']`，清理执行时 registry、已渲染侧栏及更多菜单均为空。`1935` 对 pins 有 `registryKnows || pinsMenuSeen` 前置保护，hidden 分支没有同等来源可用性保护。
- 实际：hidden 被删除并调用一次 writeSet；若 registry 含该 ID，同一 hidden 保留且不写。预期：在没有证明来源已完成注册前，保留未知记录；只有权威完整快照确认卸载后才删除。
- 调用链：`2813-2821` 的 bootPrune 先尝试标签转 ID，再调用清理；启动等待只有两跳 Promise 微任务。`2822-2825` 页面回到 visible 也清理；`2002` 进入编辑模式清理。两跳微任务不是异步插件注册完成信号。此处为可触发窗口推理，未测真实加载时序。
- 最小建议：先区分“来源未就绪/不可读”与“已完成的空快照”，未就绪不做破坏性清理；用注册完成信号重试，勿把固定延时当完成依据。对非空但不完整的注册表也应保守。
- 限局：VM 把 DOM/registry 边界替换为集合，执行的删除函数逐行来自安装脚本，不模拟 React/WebView2。用户历史“重启或装插件刷新后丢配置”和曾观察到空 hidden 均不能证明此次清理真的命中。尚未核对本地 guard 补丁差异；本轮复现仅代表当前读取片段在给定输入下的行为。
- 永久链接边界：该文件不属于本仓 8967e575，无合法的本仓 GitHub 基线链接；不伪造链接。下面记录原始函数摘录、绝对路径和可重跑探针，供协调者抽查；如需追责发布插件，下一轮应取得确切上游 commit/包内容对照。

```js
for (const key of [...hidden]) {
  if (present.has(key)) continue;
  if (registryKnows) {
    if (registeredIds.has(key)) continue;
  } else if (menu.has(key)) {
    continue;
  }
  hidden.delete(key);
  changed = true;
}
if (changed) writeSet();
```

## 3. 条件性问题 B：持久化写失败被吞，当前显示与下次加载不一致

- 严重度：P2 / Major（存储失败条件下偏好无法保存且无失败反馈）；证据等级：真实 loadState/saveState 隔离 VM 复现。责任来源：同一第三方安装插件。
- 精确源码：上述 `client.js:967-989` loadState、`991-994` saveState、`1066-1075` commit。`saveState` 把 setItem 异常全部吞掉且不返回失败；commit 已先改内存。
- 触发：localStorage.setItem 抛错（探针明确注入 `QuotaExceededError fixture`，不是对现场配额的观察）。
- 实际：内存 hidden 变为 `new-choice`，saveState 无异常返回；再次 loadState 仍得到旧值 `previous`。预期：写失败有可观测结果，调用方保留未保存状态或回滚并告知用户。
- 最小建议：saveState 返回明确成功/失败，错误交由现有提示机制只报告一次；不能声称用户操作已经持久化。
- 限局：本轮未读取真实 localStorage、配额或写入错误，不能声称这是历史问题的原因。与 A 同属安装插件，不能用本仓 GitHub 基线链接替代外部事实。

## 4. 实际运行的验证与复跑方法

探针绝对路径：
`D:/webstorm/deepseek-harness-desktop/.agents/worktrees/upgrade-webview2-0320/.agents/worktrees/wayfinder-webview2-0320/.agents/worktrees/audit-state/.temp/state-probe.cjs`。

探针在生成时通过只读工具提取安装 `client.js:1907-1978` 原函数、`948-994` 的状态读写函数，保存于自身脚本的短行字符串数组，用 `node:vm` 执行；注册表、DOM集合、localStorage 为隔离夹具。未调用完整插件、未访问真实存储或档案。脚本仅在本工作树 `.temp`，报告是唯一提交文件。

```sh
node .temp/state-probe.cjs
```

实际最终输出（Node v26.13.0，退出码 0，4 个断言、3 个场景）：

```text
{"case":"empty","hidden":[],"writes":1}
{"case":"registered","hidden":["plugin-x"],"writes":0}
{"case":"write-denied","current":["new-choice"],"nextLoad":["previous"],"errorSurfaced":false}
PASS 4 assertions in 3 isolated cases; no real storage read or write
```

验证局限：最初生成脚本存在换行转义错误；一次修正时又发现读取工具对超长单行截断，已完全从原安装源范围重新生成短行版本，上述最终运行才有效。未把失败的前两次当通过。未运行 build、Rust 测试、浏览器端到端或真实重启。

## 5. Toast 排除项与未确认项

- 本仓 `apps/desktop/src/components/toast-provider.tsx:39-68` 主分支向 HeroUI 默认气泡传 undefined；`43` 还明确让 toast-close 可交互/可见。`apps/desktop/src/shell.tsx:62-68`、`main.tsx:30-37` 调用均无 custom。因此当前源码不支持“壳层自定义分支去掉主窗口关闭按钮”这一归因；这只是静态排除，未验证运行渲染。
  [Toast 基线](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src/components/toast-provider.tsx#L39-L68)、[壳层挂载](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src/shell.tsx#L62-L68)。
- `apps/desktop/src/utils/toast.ts:115-128` 未指定 timeout 时沿用库默认超时，`136-143` 非 sticky 条目超过 3 条淘汰最旧。该规则只能解释壳层 toast 的可能消失来源，未定位用户所指 provider 提示的真实消费者，不当作根因。
  [超时与队列基线](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src/utils/toast.ts#L113-L143)。
- 对允许范围内的核心 `C:/Users/ASUS/AppData/Roaming/dsh-tauri/dependencies/dsh/node_modules/@deepseek-ai/dsh-client-ui-renderer/src` 只窄搜 `toast|Toast`，未命中；没有命中不等于不存在。provider 左上提示究竟来自哪个核心包、是否有关闭操作和实际超时仍未知。
- `apps/desktop/src-tauri/src/desktop/plugin_boot.js.inc:61-82` 是启动失败卡片观察/上报链，不是普通 provider toast 或侧栏隐藏写回链。其三次重试与 stop 不宜混为提示自动消失。
  [启动检测基线](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/desktop/plugin_boot.js.inc#L42-L82)。

## 6. 覆盖与下一轮雾区

已追链检查：设置页注册 → 列表投影 → store → UI；第三方隐藏偏好读/写 → boot/visible/edit 清理；壳层 ToastProvider 与主调用者；启动失败检测。

仅静态读到原生桥入口：

- `apps/desktop/src-tauri/src/bridge/profile.rs:36-57` 区分 main 持久化 set_active 与其他窗口 select，并序列化 core transition；`62-106` 有删除/重置使用中保护；`114-127` clone 委托服务复制，`145-159` 迁移委托 apply。服务内部与文件级持久化未完成调查。
  [Profile 桥基线](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/bridge/profile.rs#L36-L159)。
- `apps/desktop/src-tauri/src/bridge/data_dir.rs:101-144` migrate/rollback 入口都先取 mutation、require_exclusive_profile、读 Harness 标记、拒绝不可读、停服务、确认标记进程已退出，再委托服务。未执行迁移/回滚，不能宣称复制原子性和恢复可靠性已验证。
  [数据目录桥基线](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/bridge/data_dir.rs#L101-L144)。

未覆盖：README 公开承诺的档案备份/克隆端到端、数据目录迁移/回滚服务深层、插件安装升级卸载与刷新完整事务、WebView2 localStorage 实际持久化目录/来源端口/profile 隔离、provider 提示核心实现和真实视觉验证。未发现明确不支持条目；未检查不代表支持或无缺陷。

建议下一轮只补两项证据：在隔离宿主测注册表尚空/非空但不完整/最终完成三阶段与 hidden 保留；定位 provider 提示所属核心包后，对其关闭可达性与超时做隔离浏览器验证。历史现象根因保持未定。

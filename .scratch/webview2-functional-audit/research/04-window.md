# Issue 4：窗口、浏览器及外链首轮研究

- 基线：WebView2 0.32.0，8967e57548e69599529b4eaf10ad4a6a47a9c429。
- 分支：audit-window-04；报告生成：2026-11-20。
- 范围：窗口构建、主文档承载、浏览器桥、popup、打开方式、通知与缩放入口。仅写本报告与本工作树 .temp 探针，没有修改产品、配置、插件或子仓指针，没有 build、启动/重启应用、发版、PR 或 Issue 写入。
- 规范：已读根 AGENTS、devlopment、testing、desktop.baisc、desktop.test；涉及插件取证时叠加 plugin.baisc、plugin.client。用户明确授权 WebView2 审计优先于 AGENTS 中旧 Electron 限制；用户明确只提交报告优先于旧子仓联动提交要求。
- 运行版本限制：协调者告知现场 PID19324 为 0.31.22、核心为 0.2.2-rc.5；本报告未将该现场当作 0.32.0 复测，也未对它执行操作。

## 首轮结论

确认 1 项源码迁移缺口；另外 2 个脚本边界由隔离 VM 复现，但该脚本未接入当前 release 主链，因此不冒充 0.32.0 可见故障。浏览器创建/session 隔离与普通外链导航只列待验证风险。没有端到端 WebView2 复现，也没有凭空补足问题数量。

## W04-01：打开方式成功后的桌面前台交接桥未迁入主文档路径

**等级：Major 候选；证据等级：静态证实（桥接不可达），非真实 UI 复现。**

触发：0.32.0 release 本地窗口承载 DSH 文档后，核心的“打开方式”接口成功。预期按已有桥约定交给目标程序并让出桌面前台；实际当前构建链未注入该桥，且直接调用命令也会拒绝 main/window-*。核心本身仍可能成功启动程序；不能据此声称“打开方式完全不能打开”或“必然被遮挡”。

真实调用链：

1. [shell.tsx:78-110](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src/layout/shell.tsx#L78-L110) 在 hosted 模式调用 host_harness_document。
2. [window.rs:514-558](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/desktop/window.rs#L514-L558) 将同一个 webview 导航到本地 DSH；label 不改为 harness-N。
3. [builder.rs:862-909](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/desktop/builder.rs#L862-L909) 主窗口注入 browser.js.inc、locale、ShellInjection；[builder.rs:945-986](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/desktop/builder.rs#L945-L986) 额外窗口同样没有 open_in_app 注入。
4. 唯一 open_in_app.js.inc 注入点仍在 [window.rs:666-758](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/desktop/window.rs#L666-L758) 的 prepare_harness_webview 旧子视图路径；构造 label 为 harness-N。
5. [open_in_app.js.inc:5-23](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/desktop/open_in_app.js.inc#L5-L23) 原行为是接口 POST 成功后 invoke open_in_app；[system_os.rs:96-120](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/bridge/system_os.rs#L96-L120) 只放行 harness-*，随后调用 opener 并 minimize。
6. 定向检索 packages/builtin-plugin-tauri/src/client 的 open-in-app/open_in_app 未命中；这只证明检查范围内没有第二桥，不能证明外部核心没有自己的行为。

责任来源：git blame 显示原注入与 harness label 守卫来自 ce613366，include_str 改名来自 8d8b734d；WebView2 opener 改动来自 d765456a。主窗口 browser 注入行为来自 d8c6b498。归因是桌面承载架构迁移接线缺口，不把旧实现作者视为个人责任，不断言精确首次坏提交。

验证：回读上述完整函数和调用者，确认 release ShellInjection 设置 __DSH_HOSTED__（[shell.rs:81-101](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/desktop/shell.rs#L81-L101)）；未执行 native opener/minimize。下述 VM 验证脚本本身可工作，但不证明它在主路径已注入。

最小建议：在受信任本地 hosted 文档路径接入同一成功交接桥，并让 open_in_app 使用已有来源校验认定已认证 hosted 窗口；不要简单删除 harness label 校验后让任意远端调用。验收时用隔离 home 的 0.32.0 release 确认 main 与 window-* 的成功/失败交接各一次，失败必须保留窗口。此轮不改产品。

## 已复现的脚本边界（潜在风险，未计入现行主路径故障）

**共同来源：** [open_in_app.js.inc:7-21](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/desktop/open_in_app.js.inc#L7-L21)，git blame ce613366。

- **Request 对象 POST 漏识别（Minor 候选）**：fetch(new Request(url, {method:'POST', body})) 不传第二参数时，代码只看 init.method，按 GET 放行，不发送成功交接。预期与字符串 URL + init 的相同 POST 一致。VM 实际 requestPost=0，而 stringPost=1。未找到核心真实调用形态，故保留风险；接线修复时应依据 input Request 解析有效 method/body，避免消费原请求 body。
- **路由只用 includes 导致误匹配（Minor 候选）**：对 https://example.invalid/a?next=/open-in-app/open 的成功 POST 也发交接，实际 unrelatedRoute=1，预期 0。VM 没有联网。当前脚本未注入 release 主路径，因此不宣称存在可见误最小化或可利用攻击；接线修复时用可信 origin + 精确 pathname。

### 隔离探针、输出与重跑

运行环境：Node v26.13.0。探针位于当前独立工作树 .temp/window-probe.cjs，只读取基线脚本，在 VM 内以假的 fetch 响应和记录用 IPC 执行原脚本；没有网络请求或系统程序启动。没有把源码字符串存在性当业务单元测试。

已执行命令：

~~~sh
node .temp/window-probe.cjs
~~~

退出码 0，stdout：

~~~json
{"stringPost":1,"requestPost":0,"unrelatedRoute":1,"scope":"VM executing exact injection; no native calls or network"}
~~~

可独立重建的探针（只保存报告，因此临时文件不随提交发布）：

~~~js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync('apps/desktop/src-tauri/src/desktop/open_in_app.js.inc','utf8');
async function probe(input, init) {
  const calls=[];
  const window={fetch:async()=>({ok:true}),__TAURI_INTERNALS__:{invoke:async(...args)=>{calls.push(args)}}};
  vm.runInNewContext(code,{window,URL});
  await window.fetch(input,init);
  return calls;
}
(async()=>{
  const a=await probe('http://localhost:3080/api/open-in-app/open',{method:'POST',body:JSON.stringify({path:'C:/isolated'})});
  const b=await probe(new Request('http://localhost:3080/api/open-in-app/open',{method:'POST',body:JSON.stringify({path:'C:/isolated'})}));
  const c=await probe('https://example.invalid/a?next=/open-in-app/open',{method:'POST',body:JSON.stringify({path:'C:/isolated'})});
  assert.equal(a.length,1); assert.equal(b.length,0); assert.equal(c.length,1);
  console.log(JSON.stringify({stringPost:a.length,requestPost:b.length,unrelatedRoute:c.length}));
})().catch(e=>{console.error(e);process.exitCode=1});
~~~

这是行为观察断言，不是修复后的绿色回归测试；最小修复验收应把后两项期望分别改为 1、0。未修改源码做变异验证；未执行完整 Vitest/Rust 测试，避免 build/安装副作用和误报全套通过。

## 浏览器与外链：核查结果和雾区

- **popup 路径静态明确**：[window.rs:13-20](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/desktop/window.rs#L13-L20) 对 http(s) 调系统 opener，其他 scheme 拒绝；主窗口/额外窗口的 on_new_window 均返回 Deny（builder.rs:900-903、976-980）。所以不是“弹窗一律失效”；设计是外部浏览器接管。不将非 http(s) popup 拒绝自动报 bug。
- **浏览器/session 隔离待验证**：[window.rs:783-832](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/desktop/window.rs#L783-L832) acquire 仅返回 lease 和 persist:dsh-browser-* 字符串，connect_browser_events 是空实现；[browser.js.inc:9-56](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/desktop/browser.js.inc#L9-L56) 暴露 Electron 风格 browser.acquire/release/onOpenRequested。未找到本仓实际浏览器业务消费者，发布核心不在此独立工作树中，不能凭空 stub 推断用户可见故障，更不能声称真实 Cookie/session 已隔离。下一轮需拿 0.32.0 对应核心的浏览器能力协商与 UI fallback 源码，先确认是否明确不支持，再决定是否做隔离双 workspace Cookie 探针。
- **普通同窗外链待验证**：主窗口 on_navigation 在 [builder.rs:890-899](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/desktop/builder.rs#L890-L899) 总是 true；额外窗口未注册该拦截。已确认 popup 会外开，但核心是否给所有普通 anchor/location 导航设防未检查，不能称应用必然被外链替换。额外窗口 loopback 授权并非遗漏：[hosted-shell.json:7-10,57-61](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/capabilities/hosted-shell.json#L7-L61) 已覆盖 localhost/127.0.0.1 各端口及 window-*，免误报。

## 其他覆盖与未检查清单

已追查（不等于平台运行验收）：

- 窗口创建及主文档承载链，popup 和 http(s) 外链 opener 白名单。
- 缩放：[zoom.rs:5-17](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/desktop/zoom.rs#L5-L17) 用原生 set_zoom；构建调用 apply_zoom_on_load。已定位 update_app_config 的实时应用入口 bridge/config.rs:132-134，未穷尽导航后缩放保持行为。
- 快捷键：[shell.tsx:69-75](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src/layout/shell.tsx#L69-L75) 接收缩放事件；[shortcuts.ts:30-63,90-130](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/packages/builtin-plugin-tauri/src/client/register/shortcuts.ts#L30-L130) 根据核心目录派生菜单快捷键，不将没有绑定的项误判为故障。
- 系统通知：[builder.rs:1751-1772](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/desktop/builder.rs#L1751-L1772) 注册 notification/notifications；macOS 非 .app 情况明确跳过通知并置可用性 false，此项为明确限制，不是 Windows 回归。已读通知插件 native.ts:109-134 和壳 use-native-notifications.ts 握手入口，未实测系统投递/点击/操作。

未覆盖：真实 WebView2 浏览器创建、Cookie/缓存/登录隔离、OAuth popup 完整回跳、下载对话框、证书/代理错误；F5/Ctrl+R 与输入焦点组合、刷新期间运行任务保护、导航后缩放与 DPI；置顶可见按钮到原生状态（仅确认能力权限存在）、系统通知权限/点击路由、桌宠通知、CLI shim/终端模式、主题透明度及磨砂效果。没有读 archive、真实用户目录或已装插件；没有安装依赖或初始化子仓。

## 协调者最小复核命令

~~~sh
git show 8967e575:apps/desktop/src-tauri/src/desktop/builder.rs
git show 8967e575:apps/desktop/src-tauri/src/desktop/window.rs
git show 8967e575:apps/desktop/src-tauri/src/bridge/system_os.rs
node .temp/window-probe.cjs
~~~

前三条供定位引用回读，不是自动测试；最后一条需先按上文探针建立临时文件。交付前仅核查报告 diff、单文件暂存、提交文件集合和远端分支 SHA；推送结果由最终回执记录，报告本身不预先宣称已推送。

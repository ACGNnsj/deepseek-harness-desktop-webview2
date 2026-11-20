# Issue 3：输入桥首轮调查（0.32.0）

基线：8967e57548e69599529b4eaf10ad4a6a47a9c429。研究分支：audit-input-0320。日期：2026-11-20。仅研究，不改产品、配置、插件、子仓指针，不 build、不启动或重启应用、不改 Issue。

## 范围与证据边界

用户明确调查 WebView2，优先于根 AGENTS 的旧 Electron 限制；已读根 AGENTS、devlopment、desktop.baisc、testing、desktop.test 规范。文档的 Electron 专用真实产物测试不作为这次 VM 源码探针已验收的依据。

协调者提供的现场事实：运行进程 ProductVersion=0.31.22、核心 @deepseek-ai/dsh=0.2.2-rc.5；不是本次 0.32.0 复测。本报告未接触真实剪贴板、档案、运行进程。以下“探针复现”指 Node VM 执行完整基线 browser.js.inc、用最小 DOM/IPC 边界替身驱动事件，不代表真实 WebView2/Windows 系统集成已复现。

输入链：[apps/desktop/src-tauri/src/desktop/builder.rs:1697](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/desktop/builder.rs#L1697) 读取 Tauri Drop paths（含 isDir），1725 eval 调用 __dshShellDropAnnounce → [apps/desktop/src-tauri/src/desktop/browser.js.inc:101](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/desktop/browser.js.inc#L101) 建 DataTransfer → document drop；图片通过 read_dropped_file_bytes；普通文件/目录通过 WeakMap 绑定 pathFor。粘贴：[apps/desktop/src-tauri/src/desktop/browser.js.inc:232](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/desktop/browser.js.inc#L232) 捕获 paste → [apps/desktop/src-tauri/src/bridge/clipboard.rs:25](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/bridge/clipboard.rs#L25) spawn_blocking → [apps/desktop/src-tauri/src/bridge/clipboard.rs:65](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/bridge/clipboard.rs#L65) CF_HDROP → 按 basename/kind 回配 File → 合成 paste → [apps/desktop/src-tauri/src/desktop/browser.js.inc:142](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/desktop/browser.js.inc#L142) __DSH_HOST_PATHS__.pathFor。

核心消费者已由协调者提供的既有工作区只读核验：其 source/deepseek-harness HEAD 为 b830ec950faba0a46dda564be3e2d854afed94f1，与基线 gitlink 一致；未在本 worktree 初始化子仓或改指针。

核心契约：[source/deepseek-harness/packages/client/ui-conversation/src/client/apply.ts:105](https://github.com/ACGNnsj/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/client/ui-conversation/src/client/apply.ts#L105)-112 读取全局 HostPathBridge；[apply.ts:493](https://github.com/ACGNnsj/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/client/ui-conversation/src/client/apply.ts#L493)-521 对每个文件调用 pathFor：目录路径生成目录引用，非图片文件路径生成文件引用；无路径或有路径图片仍放入上传队列。然后 [apply.ts:523](https://github.com/ACGNnsj/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/client/ui-conversation/src/client/apply.ts#L523)-529 创建附件草稿并添加引用。核心既有测试 [apply-inject.client.spec.tsx:407](https://github.com/ACGNnsj/deepseek-harness/blob/b830ec950faba0a46dda564be3e2d854afed94f1/packages/client/ui-conversation/tests/apply-inject.client.spec.tsx#L407)-438 覆盖路径文件/目录引用及无路径目录拒绝；440-474 验证一次 paste 批次内选中文本和文件顺序、目录引用恢复；未覆盖桌面壳多次独立异步 paste 顺序、路径同名错配、图片 drop IPC 失败回退。

## 1. P2/Major：连续文件粘贴可按 IPC 完成顺序逆序恢复

证据等级：隔离探针复现 + 静态证实；实际编辑器业务影响待集成复测。

触发：连续两次带 Files 的文件/截图 paste，第一笔 read_clipboard_file_paths 比第二笔晚完成。

实际：事件在 await 前均已被阻止，但互相不排队；探针先完成第二笔再第一笔，接收端收到 second.png、first.png。预期：保留用户输入先后顺序。更深一层风险：宿主调用 [apps/desktop/src-tauri/src/bridge/clipboard.rs:61](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/bridge/clipboard.rs#L61) 在 spawn_blocking 执行时才读取全局剪贴板，未与最初 DOM snapshot 绑定，因此在剪贴板变化/同名文件时可能配错路径；本轮没有真实 OS 复现该配错。

根因与责任：桌面壳输入桥 [apps/desktop/src-tauri/src/desktop/browser.js.inc:262](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/desktop/browser.js.inc#L262) 先阻止原事件，[apps/desktop/src-tauri/src/desktop/browser.js.inc:274](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/desktop/browser.js.inc#L274) 每次独立 await；[apps/desktop/src-tauri/src/desktop/browser.js.inc:321](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/desktop/browser.js.inc#L321) 每笔各自 resume。firingSyntheticPaste（232、259-260）只阻止合成事件同步递归，不是排队/互斥锁。

验证：node .temp/input-probe.cjs；输出 PASS concurrent paste: observed order second.png,first.png，exit 0。局限：人为控制 IPC resolve 次序，未测 Windows 实际延迟分布、编辑器去重和附件排列。

最小建议：仅将异步文件 paste 按到达顺序串行恢复；若要可信路径绑定，单纯给 Promise 排队不足以绑定 OS 剪贴板时刻，应校验剪贴板序列号/无歧义来源，无法确认时保留原 File 而不写错误 host path。

## 2. P2/Major：图片 drop 读取失败时整项消失，无用户可见回退

证据等级：隔离探针复现 + 原生错误边界静态证实。

触发：拖入图片后 read_dropped_file_bytes 拒绝；具体可由图片大于 32 MiB、读取权限/文件消失等触发。

实际：[apps/desktop/src-tauri/src/desktop/browser.js.inc:126](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/desktop/browser.js.inc#L126) 仅 console.warn，随后 continue；若只有该图片，135 行 transfer.files.length===0，整个 drop 不再派发。预期：明确显示失败，或者按宿主路径降级到文件引用，避免拖入动作无响应。图片读取限制本身是明确限制，不将“32 MiB 上限”单独判为 bug，问题是失败后的静默丢项。

根因与责任：桌面壳 [apps/desktop/src-tauri/src/desktop/browser.js.inc:116](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/desktop/browser.js.inc#L116) 对 image MIME 必走读字节分支，失败不走131-133普通文件路径分支。[apps/desktop/src-tauri/src/bridge/drop.rs:4](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/bridge/drop.rs#L4) LIMIT=32*1024*1024；10-11 返回 DROP_BYTES_TOO_LARGE，7-8 返回 DROP_BYTES_NOT_FILE，14 返回 DROP_BYTES_READ。

验证：同一 VM 探针将 native invoke 拒绝为 DROP_BYTES_TOO_LARGE，输出 PASS failed image drop: emitted drops=0, no fallback，exit 0。局限：未实际读大文件/触发 Rust 命令，未确认核心存在可展示路径引用的交互；只能给出宿主事件层丢项结论。

最小建议：失败时告知用户具体原因；若核心允许路径附件，复用普通文件 vessel+pathFor 作为回退。不要盲目扩大 32 MiB 上限。

## 3. P3/Minor（确定行为，性能影响待测）：截图带 Files 仍被拦截且等待宿主 IPC

证据等级：隔离模型复现 + 静态证实；不等价于截图工具真实快路实测。

触发：DOM paste 含 image/png file item，types 包含 Files（如常见截图 payload）。

实际：[apps/desktop/src-tauri/src/desktop/browser.js.inc:237](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/desktop/browser.js.inc#L237) 只要有 file 就继续；262-263先阻止原事件，270 的 Files 保护只决定是否调用 native 路径接口，274 await 后才恢复图片。截图无 CF_HDROP 时 [apps/desktop/src-tauri/src/bridge/clipboard.rs:66](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/bridge/clipboard.rs#L66) 返回空数组，图片仍在合成 paste 中保留。预期：如果产品要求截图快路，应避免无路径截图被宿主路径查询延迟；当前不能认定截图丢失或贴图损坏。

责任：桌面壳文件 paste 统一接管逻辑。不能把已有 types.includes('Files') 当作已实现/已验证“截图绕过”。

验证输出：PASS screenshot+Files: prevented=true, IPC=read_clipboard_file_paths, resumed after IPC；exit 0。局限：fixture 显式构造 Files，未验证任意截图工具的真实 MIME/types、原生 clipboard locks、可信事件默认插入。

最小建议：先在隔离 0.32.0 WebView2 实例测真实 screenshot payload/延迟，再决定是否有足够可靠的截图识别快路；不要仅按“所有image file都是截图”绕过，以免破坏 Explorer 图片路径。

## 4. P2 候选风险：同名但类型不符仍回配，可能把文件改成目录

证据等级：分支在隔离探针复现；正常系统可达性待验证，不提升为已确认用户缺陷。

触发：DOM snap 名 same、isDir=false；宿主同名结果仅一个 is_dir=true（例如 DOM 未暴露目录 entry，或异步期间剪贴板变更）。

实际：[apps/desktop/src-tauri/src/desktop/browser.js.inc:293](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/desktop/browser.js.inc#L293) 查找同类型失败后294行 at=0，300行取错类型，301-305 把原文件变成目录 vessel，绑定 C:/dir/same。预期：类型不符不能强配，保留原 File/明确未解析；对于多个同名同类型不同目录文件，也仅依赖 basename/返回顺序，不能保证身份。

责任：桌面壳 basename+kind 回配。探针输出 PASS same-name kind mismatch: file converted to directory C:/dir/same；exit 0。局限：并不声称正常 Explorer clipboard 必然类型不符；nativeEntry/getAsFile 在真实 WebView2 的身份稳定性尚未测。目录 entry 桥有自检（77-98）但失败仅警告；未证明真实浏览器失败。

最小建议：删除类型不符时强取首项；相同名字且无法可靠关联时宁可不写 host path。同步回归应包含 file/dir同名、同类型同名的独立路径以及目录 entry 缺失场景。

## 附件种类与失败覆盖

mimeOf 仅显式识别 png/jpg/jpeg/gif/webp/svg/bmp/ico/avif（[apps/desktop/src-tauri/src/desktop/browser.js.inc:64](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/blob/8967e57548e69599529b4eaf10ad4a6a47a9c429/apps/desktop/src-tauri/src/desktop/browser.js.inc#L64)）。这些按图片字节投递；目录是空 File+directory桥+host path；其他扩展名（含 PDF、视频、音频和 txt）是空 File、type=''、附 host path（131-133）。核心已证实 PDF/视频/音频等非图片文件只以 @path 引用，并非上传型媒体附件；图片即使有宿主路径仍上传文件内容（apply.ts:509-515）。image成功分支125行未写 host path，因此上传图片不需要路径桥。

原生图片读字节失败没有回退；paste native查询失败会 resume(source)（276-279），保留数据但不再给 path；无 Files 的 file paste 仍同步接管/重发，只是不查 native；无 file item 的文本 paste 在238行退出。非Windows read_clipboard_file_paths 明确返回空数组（clipboard.rs:31-35），本轮只调查 Windows WebView2，不能推广跨平台路径支持。

已有 tests/e2e/desktop/boot.e2e.ts:115-132 只检查 facade存在、未知File的pathFor返回空串，不能证明截图、同名路径、目录或drop附件工作；未运行该 E2E，因为现场是旧版本且禁止 build/重启。

## 验证记录与可复跑探针

命令：node .temp/input-probe.cjs（Node 标准库，不安装依赖，不启动应用）。最终 exitCode=0、stderr为空：

```text
PASS screenshot+Files: prevented=true, IPC=read_clipboard_file_paths, resumed after IPC
PASS concurrent paste: observed order second.png,first.png
PASS failed image drop: emitted drops=0, no fallback
PASS same-name kind mismatch: file converted to directory C:/dir/same
```

首次探针 fixture 未设置 window.DataTransferItem 导致目录entry桥未启用，前三项通过、第四项 TypeError: Cannot read properties of null (reading 'isDirectory')；补齐浏览器 global 后全部通过。该失败是探针搭建问题，不计产品缺陷。

探针已随协调报告保存为 `.scratch/webview2-functional-audit/probes/03-input.cjs`。从研究分支根目录执行 `node .scratch/webview2-functional-audit/probes/03-input.cjs`；原作者临时探针与此版本内容一致。

## 未检查清单

- 本独立研究树未初始化核心；消费链由协调者在同一 gitlink 的原工作树补证。核心运行时附件顺序、去重、上传结果仍未集成验证。
- 未真实运行0.32.0窗口、截图工具、Explorer文件/目录、多种附件投递、失败提示和远程Harness页面。
- 未执行Rust/OpenClipboard/CF_HDROP/32MiB真实边界；原生错误结论来自明确源码分支。
- 未检查原生drop target坐标、跨窗口、不同缩放、路径编码、UNC、symlink、trusted事件默认动作、剪贴板锁竞争、合成事件payload寿命。
- 未检查archive、真实档案/插件/配置；未build、发版、创建PR/合并/更新Issue。

首轮建议优先核验第1、2项；第3仅证实没有截图快路，第4保留待验证风险，避免把模型可触达当成系统已复现。

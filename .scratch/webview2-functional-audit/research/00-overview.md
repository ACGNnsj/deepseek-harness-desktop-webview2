# WebView2 0.32.0 功能缺陷探索：协调证据

日期：2026-11-20。首轮四域研究及协调者抽查已完成；本文件不是全功能通过声明。

## 目的与边界

用户确认覆盖所有实际使用问题，区分壳、核心和插件。只做调查及优先级建议，不改产品，不写真实档案、不重启应用、不构建、不发版。地图是唯一任务索引：[探索地图](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/issues/2)。

## 已核实基线

- 发布标签 webview2-v0.32.0 指向 commit 8967e57548e69599529b4eaf10ad4a6a47a9c429，GitHub API git/ref/tags/webview2-v0.32.0 返回 type=commit。
- 本地发布程序 ProductVersion / FileVersion 均为 0.32.0；只读 VersionInfo，未启动它。
- NSIS 安装包 SHA-256：6dc45eb848d6d8deeffd2ba8ff9f457ee50f4aeea6cf89054243bf4527abec40，本地 Get-FileHash 与 GitHub Release asset.digest 一致；体积 11729746 字节。
- MSI 公开 asset.digest 为 416bbb0a7865e36bc7d3faa234f1d24485a58e3837e9f36fe16f23c68ba7d99d，体积 18182498 字节；本轮未重新计算本地 MSI 哈希。
- 当前运行的 deepseek-harness-desktop 进程 ProductVersion=0.31.22。这是旧版本现场，不得把其行为报告成 0.32.0 复现。
- 安装的真实核心包 @deepseek-ai/dsh=0.2.2-rc.5，由其 node_modules 内 package.json 读取，未采用外层包装版本。

## 证据口径

可运行探针复现：执行了隔离探针并获得实际输出，仍要标明模拟边界。静态证实：已追通入口到实现、可确定具体分支结果，未等同真实 WebView2 现场复现。用户历史报告：仅在先前现场观察，当前版本未重验。待验证风险：尚缺调用链或实测，不记作已确认缺陷。明确不支持：有产品契约说明，单独列示，不能自动计为 bug。

## 分域入口

- [输入、拖放和路径研究](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/issues/3)。
- [窗口、浏览器与系统入口研究](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/issues/4)。
- [配置持久化与插件界面研究](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/issues/5)。
- [核心、更新与远端研究](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/issues/6)。
- [首批范围与验收决策](https://github.com/ACGNnsj/deepseek-harness-desktop-webview2/issues/7)，研究结论入图并关闭研究票后解除原生阻塞，仍待用户选定修复批次。

## 覆盖限制

本轮以发布源码及隔离探针为主；尚未安装运行 0.32.0，未执行真实 WebView2 全功能回归。档案备份恢复、数据目录迁移、CLI 集成、桌宠、手机扫码/公网隧道和真实 SSH 如未被分域报告明确验证，继续留在地图雾区，不表示通过。

## 核验结论与建议顺序

1. 先修更新渠道：源码仍固定其他仓库，且版本解析只去 v 前缀，不能识别 fork 的 webview2-v 标签。需要一起定义 prerelease 策略；只改 owner 不足。未实际检查、下载或安装上游包。
2. 输入桥优先处理两项：异步文件粘贴按 IPC 完成顺序恢复，隔离探针可观察 second.png 先于 first.png；图片读取失败仅警告并丢项。协调者重跑四场景均通过，未操作真实剪贴板。
3. 远端坏活跃槽提前返回 slots=[]，隐藏健康副本；协调者真实源码 VM 复跑得到坏活跃槽 0 个、仅健康副本 1 个。
4. hosted 主文档没有挂上旧 open-in-app 前台交接脚本，旧原生命令还只接受 harness-* 标签；这是静态接线缺口，不等于外部程序打不开或必然被遮挡。旧脚本的 Request/路径匹配探针只描述旧入口边界。
5. 远端终态任务 Map 未见生产回收调用，200 个完成任务仍保留；每任务事件上限有效。Minor，未做真实堆内存测量。

截图带 Files 仍等待 IPC 已由模型证实，但真实截图工具延迟及历史慢贴根因未验证。同名异类型强配路径的正常系统可达性未验证。第三方 sidebar-manager 的空来源清 hidden 与写存储失败不提示属于条件风险；不认定为本仓回归或历史配置丢失实锤。本轮没有证实新的本仓状态持久化回归。

## 可复跑材料

四个探针已随研究分支保存，使用 Node 标准库，不安装依赖、不访问真实剪贴板或 SSH。服务探针需 Node 22.13+，本轮使用 26.13.0。请在基线或研究分支根目录分别运行：

```sh
node .scratch/webview2-functional-audit/probes/03-input.cjs
node .scratch/webview2-functional-audit/probes/04-window.cjs
node .scratch/webview2-functional-audit/probes/05-state.cjs
node .scratch/webview2-functional-audit/probes/06-service.cjs
```

输入、窗口、服务探针直接读取基线源码并替换系统边界；状态探针保存的是调查时从已装第三方脚本抽取的函数文本，不会重新读取安装文件，不能证明未来插件版本仍有相同行为。上述断言通过表示复现所描述机制，不表示产品功能通过。

## 下一步验收建议

首批建议更新渠道、图片拖入失败提示、文件粘贴顺序；远端槽位展示和前台交接列第二批，终态任务回收低优先。首批需离线真实 tag/资产夹具、两笔反序 IPC 仍保输入顺序、图片读取失败明确可见反馈；随后在用户允许的隔离 0.32.0 实例做真实 WebView2 复验。未据此开始修代码或要求重启当前应用。

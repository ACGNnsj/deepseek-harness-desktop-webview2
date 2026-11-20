# 首批修复交付记录

范围：地图 #2 的实施 #8、#9、#10；未构建产品、未发版、未重启应用或修改真实档案。

## 结果

- 更新检查与下载绑定 ACGNnsj/deepseek-harness-desktop-webview2，仅接受 webview2-v 加正式 semver；支持 GitHub prerelease 标记的本渠道版本、latest 404 或旧渠道时的回退；保留 NSIS 优先、MSI 回退及摘要校验。
- 图片读取失败调用原生错误框，包含文件名并归属调用窗口；错误反馈失败不丢弃同批成功项。命令注册、权限及 harness 子 Webview 守卫均已补齐。
- 粘贴先同步保存 File、目录与文本，再立即查询路径；按到达顺序派发，IPC 反序或拒绝不破坏顺序及后续恢复。

## 验证

- 输入 VM 与既有更新 UI：3 文件、17 测试通过，最终作业 bash-1c377b3c26914027 exit 0。
- 引用真实 about.rs、meta.rs、version.rs 的离线 Rust harness：28 通过、1 个原有联网诊断 ignored，最终作业 bash-0eeb6e19525246ae exit 0。
- 提取真实 guest_command_allowed 及正式守卫测试，rustc --test：先红后绿，最终 1 通过。
- TypeScript 无产物类型检查通过，bash-26600ca227914e3d exit 0；git diff --check 通过。
- 两份独立审阅及修正后复审通过；输入命令白名单、原生窗口归属、重复注入断言与更新联网诊断意见均已收口。
- 全 unit：110 文件，107 通过、3 失败；1039 测试中 1028 通过、6 失败、5 跳过。失败位于未改动的远端 instance、plugins-sync、bootstrap.utils 的 POSIX 进程/锁场景。输出汇总后作业仍持有子进程，已终止清理，非正常成功退出；未证明这些失败在基线也存在。

## 验证限制

完整桌面 Rust 测试受既有子仓 patch 阻断：patch location crates/tauri-plugin-notifications does not contain packages matching tauri-plugin-notifications。离线 harness 不编译原生 bridge/builder；真实 WebView2、原生错误框前台可见性、安装更新未实机验证。

审阅曾误触 pnpm 安装生命周期，已停止并恢复本工作树的子仓入口和 skills-lock.json；用户主工作树原有改动未动。新增离线测试 target 与日志由局部 .gitignore 排除。

## 初始化独立任务

根工作区已写 GitHub tracker、triage、single-context domain 三份文档及 AGENTS Agent skills 指针；fork 十个 canonical 标签逐项核验，默认 wontfix 保留。实际 tracker:initialized 文件谓词通过。Deck 仍从 origin 解析只读上游，并受内部 gh 预检超时影响，不能宣称整个面板全绿；未改 origin、未安装技能、未提前创建术语档。

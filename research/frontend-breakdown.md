# Frontend breakdown (#16)

Evidence: branch research/log-evidence-timeline timeline doc; shell.ts; harness store.ts; desktop e2e specs; .temp/browser-test.log (4.2KB, no hits).

## Segments

### A shell gate: CDP waitForShellTarget (dominant visible blocker in E2E)
- shell.ts polls 127.0.0.1 json/list for page target, 120s deadline, throws at :130.
- CI: boot/profile-window/theme same CDP timeout error; shell up but CDP not ready.
- This is an Electron-harness gate wait, not WebView JS slowness.

### B Harness boot() (light, not dominant)
- store.ts boot(): warn with href, double call at tauri://localhost; then get_runtime_info, setting.refresh, runtime_ready/install_dependencies (skipped if installed), plugin-install phase.
- INSTALL_FAILED is non-fatal; frontend continues. No long-cost evidence in this segment.
- Startup bulk is backend context_ready 5.5-9s (see #15).

### C theme/profile windows (no standalone cost evidence)
- theme.e2e asserts hydration correctness, not timing. profile-window 34s on same machine, within 120s budget.

## Dominant items
- Startup: backend context_ready dominates; frontend injection is light.
- Window interaction/E2E: visible blocker is the shell CDP gate (shell.ts:130).
- Environment note: this branch is Wry/WebView2 while cases use Electron CDP (expected unreachable) -- divergence, not a frontend regression. Real WebView2 first-frame timing left to #13 local rerun.

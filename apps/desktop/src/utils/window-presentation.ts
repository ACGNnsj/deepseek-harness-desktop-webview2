/** 壳层建窗时注入的全局名（与 `src-tauri/src/desktop/window.rs` 逐字一致）。 */
const NAVIGATION_GLOBAL = '__DSH_NAVIGATION__'

/** 主窗口把 DSH 作为自身文档时注入的全局标记。 */
const HOSTED_GLOBAL = '__DSH_HOSTED__'

/** 全屏右栏窗口的载荷标记（与插件 `sidebar-fullwindow.ts` 逐字一致）。 */
const PRESENTATION_FULL_SIDEBAR = 'full-sidebar'

export function isHostedDocument(): boolean {
  return (globalThis as Record<string, unknown>)[HOSTED_GLOBAL] === true
}

/**
 * 文档是否由 dsh 服务自身提供（http://127.0.0.1:<port>）。
 *
 * 壳层页永远是 tauri.localhost（打包资源），所以回环 IPv4/IPv6 主机名足以区分。
 */
function isHarnessOriginDocument(): boolean {
  if (typeof location === 'undefined' || (location.protocol !== 'http:' && location.protocol !== 'https:'))
    return false
  return location.hostname === '127.0.0.1' || location.hostname === '[::1]'
}

export function isHostedServiceDocument(): boolean {
  if (!isHostedDocument())
    return false
  const boot = (globalThis as { __DSH_BOOT__?: { entries?: unknown } }).__DSH_BOOT__
  if (Array.isArray(boot?.entries))
    return true
  // 服务启动页（端口已就绪、真页面尚未接管）同样没有 __DSH_BOOT__，但它的文档由
  // dsh 服务提供。若按壳层文档处理，注入进该页的启动链会再 boot() 一次，把窗口重新
  // 导航回启动页 —— 表现为启动后每约 6 秒重载一轮的「崩溃」风暴。
  return isHarnessOriginDocument()
}

/**
 * 本窗口是否由「在新窗口全屏打开」建出。
 *
 * 注入脚本对全部 frame 生效：壳层与内嵌 dsh 各读自己 realm 的同一份载荷，
 * 所以这里读壳层全局，不需要插件经 webview 转发。
 */
export function isFullSidebarWindow(): boolean {
  const payload = (globalThis as Record<string, unknown>)[NAVIGATION_GLOBAL]
  if (typeof payload !== 'object' || payload === null)
    return false
  return (payload as { presentation?: unknown }).presentation === PRESENTATION_FULL_SIDEBAR
}

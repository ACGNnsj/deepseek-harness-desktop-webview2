use crate::{AppHandle, WebviewWindow};
use tauri::Runtime;


pub fn apply_native_zoom<R: Runtime>(
    window: &WebviewWindow<R>,
    zoom_factor: f64,
) -> Result<(), String> {
    window
        .set_zoom(zoom_factor)
        .map_err(|error| format!("ZOOM_APPLY_FAILED: {error}"))
}

/// WebView2 下创建窗口时直接写回缩放（Electron 的加载完成钩子在此无等价物）。
pub fn apply_zoom_on_load(app: &AppHandle, window: &WebviewWindow) -> Result<(), String> {
    apply_native_zoom(window, crate::config::get_store_dat_setting(app).zoom_factor)
}

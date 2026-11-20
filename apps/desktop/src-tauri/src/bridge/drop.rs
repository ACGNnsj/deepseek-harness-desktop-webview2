#[tauri::command]
pub async fn show_drop_error(window: crate::Window, message: String) -> Result<(), String> {
    if message.is_empty() || message.len() > 4096 {
        return Err("DROP_ERROR_INVALID_MESSAGE".to_string());
    }
    rfd::AsyncMessageDialog::new()
        .set_parent(&window)
        .set_title("图片读取失败 / Image read failed")
        .set_description(&message)
        .set_level(rfd::MessageLevel::Error)
        .show()
        .await;
    Ok(())
}

#[tauri::command]
pub async fn read_dropped_file_bytes(path: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        const LIMIT: u64 = 32 * 1024 * 1024;
        let metadata =
            std::fs::metadata(&path).map_err(|error| format!("DROP_BYTES_STAT: {error}"))?;
        if !metadata.is_file() {
            return Err("DROP_BYTES_NOT_FILE".to_string());
        }
        if metadata.len() > LIMIT {
            return Err("DROP_BYTES_TOO_LARGE".to_string());
        }
        let bytes =
            std::fs::read(&path).map_err(|error| format!("DROP_BYTES_READ: {error}"))?;
        use base64::Engine as _;
        Ok(base64::prelude::BASE64_STANDARD.encode(bytes))
    })
    .await
    .map_err(|error| format!("DROP_BYTES_TASK: {error}"))?
}

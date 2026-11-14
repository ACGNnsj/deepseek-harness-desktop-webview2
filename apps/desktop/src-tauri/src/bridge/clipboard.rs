#[tauri::command]
pub async fn read_clipboard_text() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(|| {
        let mut clipboard =
            arboard::Clipboard::new().map_err(|error| format!("CLIPBOARD_TEXT_ACCESS: {error}"))?;
        match clipboard.get_text() {
            Ok(text) => Ok(Some(text)),
            Err(arboard::Error::ContentNotAvailable) => Ok(None),
            Err(error) => Err(format!("CLIPBOARD_TEXT_READ: {error}")),
        }
    })
    .await
    .map_err(|error| format!("CLIPBOARD_TEXT_TASK: {error}"))?
}

#[derive(serde::Serialize)]
pub struct ClipboardFilePath {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
}

#[cfg(windows)]
#[tauri::command]
pub async fn read_clipboard_file_paths() -> Result<Vec<ClipboardFilePath>, String> {
    tokio::task::spawn_blocking(read_clipboard_file_paths_blocking)
        .await
        .map_err(|error| format!("CLIPBOARD_PATHS_TASK: {error}"))?
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn read_clipboard_file_paths() -> Result<Vec<ClipboardFilePath>, String> {
    Ok(Vec::new())
}

#[cfg(windows)]
fn wide_null(text: &str) -> Vec<u16> {
    text.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
fn file_name_of(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(path)
        .to_string()
}

#[cfg(windows)]
fn read_clipboard_file_paths_blocking() -> Result<Vec<ClipboardFilePath>, String> {
    use windows_sys::Win32::Foundation::GetLastError;
    use windows_sys::Win32::Storage::FileSystem::{
        GetFileAttributesW, FILE_ATTRIBUTE_DIRECTORY, INVALID_FILE_ATTRIBUTES,
    };
    use windows_sys::Win32::System::DataExchange::{CloseClipboard, GetClipboardData, OpenClipboard};
    const CF_HDROP: u32 = 15;
    use windows_sys::Win32::UI::Shell::DragQueryFileW;
    unsafe {
        if OpenClipboard(std::ptr::null_mut()) == 0 {
            return Err(format!("CLIPBOARD_PATHS_OPEN: {}", GetLastError()));
        }
        let result = (|| {
            let handle = GetClipboardData(CF_HDROP);
            if handle.is_null() {
                return Ok(Vec::new());
            }
            let count = DragQueryFileW(handle as _, 0xFFFFFFFF, std::ptr::null_mut(), 0);
            let mut out = Vec::with_capacity(count as usize);
            for index in 0..count {
                let length = DragQueryFileW(handle as _, index, std::ptr::null_mut(), 0);
                let mut buffer = vec![0u16; (length + 1) as usize];
                DragQueryFileW(handle as _, index, buffer.as_mut_ptr(), buffer.len() as u32);
                let path = String::from_utf16(&buffer[..length as usize])
                    .map_err(|error| format!("CLIPBOARD_PATHS_DECODE: {error}"))?;
                let attributes = GetFileAttributesW(wide_null(&path).as_ptr());
                out.push(ClipboardFilePath {
                    name: file_name_of(&path),
                    path,
                    is_dir: attributes != INVALID_FILE_ATTRIBUTES
                        && attributes & FILE_ATTRIBUTE_DIRECTORY != 0,
                });
            }
            Ok(out)
        })();
        CloseClipboard();
        result
    }
}

#[tauri::command]
pub async fn write_clipboard_text(text: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let mut clipboard =
            arboard::Clipboard::new().map_err(|error| format!("CLIPBOARD_TEXT_ACCESS: {error}"))?;
        clipboard
            .set_text(text)
            .map_err(|error| format!("CLIPBOARD_TEXT_WRITE: {error}"))
    })
    .await
    .map_err(|error| format!("CLIPBOARD_TEXT_TASK: {error}"))?
}

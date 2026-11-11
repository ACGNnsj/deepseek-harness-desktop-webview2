use crate::AppHandle;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use tauri::Manager;

#[cfg(windows)]
const NODE_BIN_NAME: &str = "node.exe";
#[cfg(not(windows))]
const NODE_BIN_NAME: &str = "node";

fn candidate_in_dir(dir: &Path) -> Option<PathBuf> {
    let direct = dir.join(NODE_BIN_NAME);
    if direct.is_file() {
        return Some(direct);
    }
    let bin = dir.join("bin").join(NODE_BIN_NAME);
    if bin.is_file() {
        return Some(bin);
    }
    None
}

fn find_system_node() -> Option<PathBuf> {
    if let Some(env_node) = std::env::var_os("DSH_NODE") {
        let path = PathBuf::from(env_node);
        if path.is_file() {
            return Some(path);
        }
    }
    if let Some(path_var) = std::env::var_os("PATH") {
        for dir in std::env::split_paths(&path_var) {
            if let Some(found) = candidate_in_dir(&dir) {
                return Some(found);
            }
        }
    }
    #[cfg(windows)]
    {
        for var in ["ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"] {
            if let Some(base) = std::env::var_os(var).map(PathBuf::from) {
                for sub in ["nodejs", "Programs\nodejs"] {
                    if let Some(found) = candidate_in_dir(&base.join(sub)) {
                        return Some(found);
                    }
                }
            }
        }
    }
    #[cfg(not(windows))]
    {
        for dir in ["/usr/local/bin", "/opt/homebrew/bin", "/usr/bin"] {
            if let Some(found) = candidate_in_dir(Path::new(dir)) {
                return Some(found);
            }
        }
    }
    None
}

pub(crate) fn node_executable<R: tauri::Runtime>(
    app_handle: &AppHandle<R>,
) -> Result<PathBuf, String> {
    let base_dir = crate::config::get_base_dir(app_handle);
    if let Some(found) = candidate_in_dir(&base_dir.join("node")) {
        return Ok(found);
    }
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        for sub in ["runtime", "node"] {
            if let Some(found) = candidate_in_dir(&resource_dir.join(sub)) {
                return Ok(found);
            }
        }
    }
    find_system_node().ok_or_else(|| "NODE_EXECUTABLE_MISSING: node runtime was not found".to_string())
}


#[allow(dead_code)]
pub(crate) fn node_command<R: tauri::Runtime>(
    app_handle: &AppHandle<R>,
) -> Result<std::process::Command, String> {
    let node = node_executable(app_handle)?;
    let mut cmd = std::process::Command::new(node);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    Ok(cmd)
}

#[cfg(test)]
pub(crate) fn test_runtime_executable() -> Option<PathBuf> {
    find_system_node()
}

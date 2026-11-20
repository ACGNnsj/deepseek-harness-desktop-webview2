#![allow(dead_code)]

pub struct AppHandle;
pub struct Config {
    pub identifier: String,
}
impl AppHandle {
    pub fn config(&self) -> Config {
        Config {
            identifier: "dsh-tauri".into(),
        }
    }
}
mod config {
    pub mod proxy {
        pub fn http_client_builder(_: &crate::AppHandle) -> Result<reqwest::ClientBuilder, String> {
            Err("offline harness must not access app proxy settings".into())
        }
    }
}
#[path = "../about.rs"]
mod about;
#[path = "../meta.rs"]
mod meta;
#[path = "../version.rs"]
mod version;
const COPYRIGHT: &str = "";
const POWERED_BY: &str = "";
const REPO_URL: &str = "https://github.com/ACGNnsj/deepseek-harness-desktop-webview2";

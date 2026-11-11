#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AuthenticatedWebHost {
    launch_url: String,
    cookie_header: String,
}

impl AuthenticatedWebHost {
    pub fn launch_url(&self) -> &str {
        &self.launch_url
    }

    pub fn cookie_header(&self) -> &str {
        &self.cookie_header
    }
}

pub(super) fn launch_url_in(text: &str, port: u16) -> Option<String> {
    text.lines()
        .filter_map(|line| line.trim().strip_prefix("dsh web: "))
        .filter_map(|value| tauri::Url::parse(value.trim()).ok())
        .find(|url| {
            url.scheme() == "http"
                && url.host_str() == Some("127.0.0.1")
                && url.port() == Some(port)
                && url.path() == "/"
                && url.username().is_empty()
                && url.password().is_none()
                && url.fragment().is_none()
                && {
                    let mut tokens = url.query_pairs().filter(|(key, _)| key == "token");
                    matches!(tokens.next(), Some((_, value)) if !value.is_empty())
                        && tokens.next().is_none()
                }
        })
        .map(Into::into)
}

pub fn launch_url(port: u16) -> Result<String, String> {
    let instance = super::instances::instance();
    let process = instance
        .process
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    if process.is_none() {
        return Err("HARNESS_NOT_OWNED: no Harness process is owned by this app".into());
    }
    let generation = instance
        .launch_url
        .lock()
        .unwrap_or_else(|error| error.into_inner());
    let output = generation.lock().unwrap_or_else(|error| error.into_inner());
    output
        .as_ref()
        .filter(|(owned_port, _)| *owned_port == port)
        .map(|(_, url)| url.clone())
        .ok_or_else(|| "HARNESS_NOT_READY: waiting for this Harness process launch URL".into())
}

async fn exchange_launch_url(launch: &str) -> Result<AuthenticatedWebHost, String> {
    let url = tauri::Url::parse(launch).map_err(|error| error.to_string())?;
    if !matches!(url.scheme(), "http" | "https")
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("invalid Host launch URL".into());
    }
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .no_proxy()
        .build()
        .map_err(|error| error.to_string())?;
    let response = client
        .get(url.clone())
        .send()
        .await
        .map_err(|error| error.to_string())?;
    if response.status() != reqwest::StatusCode::SEE_OTHER {
        return Err(format!("unexpected status {}", response.status()));
    }
    let cookie = response
        .headers()
        .get_all(reqwest::header::SET_COOKIE)
        .iter()
        .filter_map(|val| val.to_str().ok())
        .filter_map(|raw| raw.split(';').next())
        .map(str::trim)
        .find(|part| !part.is_empty())
        .ok_or("Host authentication missing Set-Cookie")?
        .to_string();
    let location = response
        .headers()
        .get(reqwest::header::LOCATION)
        .and_then(|val| val.to_str().ok())
        .unwrap_or("/");
    let document = url.join(location).map_err(|error| error.to_string())?;
    if document.origin() != url.origin()
        || !document.username().is_empty()
        || document.password().is_some()
    {
        return Err("Host authentication redirected outside its origin".into());
    }
    Ok(AuthenticatedWebHost {
        launch_url: launch.to_string(),
        cookie_header: cookie,
    })
}

pub(crate) async fn authenticated_host(
    _app: &crate::AppHandle,
    port: u16,
) -> Result<AuthenticatedWebHost, String> {
    let instance = super::instances::instance();
    let launch = launch_url(port)?;
    let mut cached = instance.authenticated_host.lock().await;
    if let Some((generation, host)) = cached.as_ref()
        && generation == &launch
    {
        return Ok(host.clone());
    }
    let host = exchange_launch_url(&launch)
        .await
        .map_err(|error| format!("HARNESS_AUTH_FAILED: {error}"))?;
    if launch_url(port)? != launch {
        return Err("HARNESS_AUTH_STALE: launch URL changed during authentication".into());
    }
    *cached = Some((launch, host.clone()));
    Ok(host)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launch_url_rejects_non_loopback_or_tokenless_output() {
        for line in [
            "dsh web: http://127.0.0.1:3080/",
            "dsh web: http://127.0.0.1:3080/?token=",
            "dsh web: https://127.0.0.1:3080/?token=secret",
            "dsh web: http://example.test:3080/?token=secret",
            "dsh web: http://127.0.0.1:3080/api/?token=secret",
        ] {
            assert_eq!(launch_url_in(line, 3080), None, "{line}");
        }
    }

    #[test]
    fn launch_url_rejects_ambiguous_token_parameters() {
        for query in ["token=first&token=second", "token=&token=valid", "token=valid&token="] {
            let line = format!("dsh web: http://127.0.0.1:3080/?{query}");
            assert_eq!(launch_url_in(&line, 3080), None);
        }
    }

    #[test]
    fn launch_url_accepts_only_the_official_ready_line_for_the_owned_port() {
        let output = "Starting plugins...\ndsh web: http://127.0.0.1:3081/?token=other-port\ndsh web: http://127.0.0.1:3080/?token=fresh\n";
        assert_eq!(
            launch_url_in(output, 3080).as_deref(),
            Some("http://127.0.0.1:3080/?token=fresh")
        );
        assert_eq!(launch_url_in(output, 3082), None);
        assert_eq!(
            launch_url_in("[info] dsh web: http://127.0.0.1:3080/?token=old", 3080),
            None
        );
    }
}

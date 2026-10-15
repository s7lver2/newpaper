//! Descarga del artículo por el cliente de contenidos (respeta Tor y el kill switch).
use thiserror::Error;

pub const MAX_BYTES: usize = 5 * 1024 * 1024;

#[derive(Debug, Error, PartialEq, Eq, serde::Serialize)]
#[serde(tag = "kind", content = "detail", rename_all = "camelCase")]
pub enum FetchError {
    #[error("network")]
    Network,
    #[error("status {0}")]
    Status(u16),
    #[error("too large")]
    TooLarge,
    #[error("not html")]
    NotHtml,
    #[error("blocked by kill switch")]
    Blocked,
}

pub async fn fetch_page(client: &reqwest::Client, url: &str) -> Result<String, FetchError> {
    let r = client.get(url).send().await.map_err(|e| if e.is_connect() { FetchError::Blocked } else { FetchError::Network })?;
    if !r.status().is_success() {
        return Err(FetchError::Status(r.status().as_u16()));
    }
    let html = r
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map_or(true, |ct| ct.contains("html"));
    if !html {
        return Err(FetchError::NotHtml);
    }
    if r.content_length().is_some_and(|n| n as usize > MAX_BYTES) {
        return Err(FetchError::TooLarge);
    }
    let bytes = r.bytes().await.map_err(|_| FetchError::Network)?;
    if bytes.len() > MAX_BYTES {
        return Err(FetchError::TooLarge);
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

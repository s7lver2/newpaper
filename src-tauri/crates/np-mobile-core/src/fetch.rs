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
    #[error("not a public http(s) address")]
    NotPublic,
}

/// Una URL compartida por otra app no es de fiar: solo http(s) y nunca hacia la red local o el propio teléfono.
pub fn check_public(raw: &str) -> Result<(), FetchError> {
    use std::net::IpAddr;
    let url = url::Url::parse(raw).map_err(|_| FetchError::NotPublic)?;
    if !matches!(url.scheme(), "http" | "https") || !url.username().is_empty() || url.password().is_some() {
        return Err(FetchError::NotPublic);
    }
    let host = url.host_str().ok_or(FetchError::NotPublic)?.trim_matches(['[', ']']).to_ascii_lowercase();
    let local_name = host == "localhost" || host.ends_with(".localhost") || host.ends_with(".local") || host.ends_with(".internal") || !host.contains('.') && host.parse::<IpAddr>().is_err();
    let private_ip = match host.parse::<IpAddr>() {
        Ok(IpAddr::V4(v4)) => {
            let o = v4.octets();
            v4.is_loopback() || v4.is_private() || v4.is_link_local() || v4.is_unspecified() || v4.is_broadcast() || (o[0] == 100 && (o[1] & 0xC0) == 64) || o[0] == 0
        }
        Ok(IpAddr::V6(v6)) => v6.is_loopback() || v6.is_unspecified() || (v6.segments()[0] & 0xfe00) == 0xfc00 || (v6.segments()[0] & 0xffc0) == 0xfe80 || v6.to_ipv4_mapped().is_some(),
        Err(_) => false,
    };
    if local_name || private_ip {
        Err(FetchError::NotPublic)
    } else {
        Ok(())
    }
}

pub async fn fetch_page(client: &reqwest::Client, url: &str) -> Result<String, FetchError> {
    check_public(url)?;
    let mut r = client.get(url).send().await.map_err(|e| if e.is_connect() { FetchError::Blocked } else { FetchError::Network })?;
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
    // Sin `Content-Length` fiable el cuerpo se corta al pasar el límite, no después de descargarlo entero.
    let mut bytes: Vec<u8> = Vec::new();
    while let Some(chunk) = r.chunk().await.map_err(|_| FetchError::Network)? {
        if bytes.len() + chunk.len() > MAX_BYTES {
            return Err(FetchError::TooLarge);
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_public_http_urls_are_fetched() {
        for ok in ["https://www.elpais.com/a?x=1", "http://93.184.216.34/a"] {
            assert_eq!(check_public(ok), Ok(()), "{ok}");
        }
        for bad in ["http://127.0.0.1:11434/", "http://localhost/a", "http://192.168.1.1/", "http://10.0.0.2/", "http://169.254.169.254/", "http://[::1]/", "http://[fd00::1]/", "http://printer.local/", "http://intranet/", "https://u:p@example.org/", "file:///etc/passwd", "ftp://example.org/"] {
            assert_eq!(check_public(bad), Err(FetchError::NotPublic), "{bad}");
        }
    }
}

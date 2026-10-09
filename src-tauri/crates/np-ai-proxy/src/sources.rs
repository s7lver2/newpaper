//! Descarga de fuentes para la verificación: solo lista blanca de fuentes primarias o URLs explícitas.
//! Nunca elude muros de pago: una sola petición GET anónima, sin cookies ni credenciales.
use std::time::Duration;

use futures::StreamExt;

use crate::{guard::is_private_host, ProxyError};

pub const MAX_SOURCE_BYTES: usize = 4 * 1024 * 1024;
const MAX_REDIRECTS: usize = 5;
const FETCH_DEADLINE: Duration = Duration::from_secs(30);

pub fn is_allowed(url: &str, whitelist: &[String], extra: &[String]) -> bool {
    let Ok(u) = url::Url::parse(url) else { return false };
    if !matches!(u.scheme(), "http" | "https") || !u.username().is_empty() || u.password().is_some() || is_private_host(&u) {
        return false;
    }
    if extra.iter().any(|e| e == url) {
        return true;
    }
    let host = u.host_str().unwrap_or("").to_ascii_lowercase();
    whitelist.iter().any(|d| host == *d || host.ends_with(&format!(".{d}")))
}

fn textual(content_type: Option<&str>) -> bool {
    let Some(ct) = content_type else { return true };
    let ct = ct.to_ascii_lowercase();
    ct.starts_with("text/") || ct.contains("xml") || ct.contains("json")
}

/// `allowed` se evalúa sobre la URL inicial y sobre cada redirección (máx. 5): el cliente debe venir sin seguirlas.
pub async fn fetch_source(client: &reqwest::Client, url: &str, allowed: impl Fn(&str) -> bool) -> Result<String, ProxyError> {
    tokio::time::timeout(FETCH_DEADLINE, fetch_inner(client, url, allowed)).await.map_err(|_| ProxyError::Network("source fetch timed out".into()))?
}

async fn fetch_inner(client: &reqwest::Client, url: &str, allowed: impl Fn(&str) -> bool) -> Result<String, ProxyError> {
    let mut current = url::Url::parse(url).map_err(|_| ProxyError::SourceNotAllowed(url.to_string()))?;
    for _ in 0..=MAX_REDIRECTS {
        if !allowed(current.as_str()) {
            return Err(ProxyError::SourceNotAllowed(current.to_string()));
        }
        let resp = client.get(current.clone()).send().await.map_err(|e| ProxyError::Network(e.to_string()))?;
        if resp.status().is_redirection() {
            let loc = resp.headers().get(reqwest::header::LOCATION).and_then(|v| v.to_str().ok()).ok_or_else(|| ProxyError::Network("redirect without location".into()))?;
            current = current.join(loc).map_err(|_| ProxyError::Network("bad redirect".into()))?;
            continue;
        }
        if !resp.status().is_success() {
            return Err(ProxyError::Network(format!("HTTP {}", resp.status())));
        }
        let ct = resp.headers().get(reqwest::header::CONTENT_TYPE).and_then(|v| v.to_str().ok()).map(str::to_string);
        if !textual(ct.as_deref()) {
            return Err(ProxyError::UnsupportedContent(ct.unwrap_or_default()));
        }
        if resp.content_length().is_some_and(|l| l as usize > MAX_SOURCE_BYTES) {
            return Err(ProxyError::BodyTooLarge(resp.content_length().unwrap_or(0) as usize));
        }
        let mut buf: Vec<u8> = Vec::new();
        let mut stream = resp.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let bytes = chunk.map_err(|e| ProxyError::Network(e.to_string()))?;
            if buf.len() + bytes.len() > MAX_SOURCE_BYTES {
                return Err(ProxyError::BodyTooLarge(buf.len() + bytes.len()));
            }
            buf.extend_from_slice(&bytes);
        }
        return Ok(String::from_utf8_lossy(&buf).into_owned());
    }
    Err(ProxyError::Network("too many redirects".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_whitelisted_domains_their_subdomains_and_explicit_urls() {
        let wl = vec!["ine.es".to_string(), "boe.es".to_string()];
        assert!(is_allowed("https://www.ine.es/jaxiT3/Tabla.htm?t=4247", &wl, &[]));
        assert!(is_allowed("https://boe.es/x", &wl, &[]));
        assert!(!is_allowed("https://notine.es/x", &wl, &[]));
        assert!(!is_allowed("file:///c:/x", &wl, &[]));
        assert!(is_allowed("https://elpais.com/a", &wl, &["https://elpais.com/a".to_string()]));
        assert!(!is_allowed("https://elpais.com/b", &wl, &["https://elpais.com/a".to_string()]));
    }

    #[test]
    fn explicit_urls_cannot_target_private_hosts_or_carry_userinfo() {
        for u in ["http://127.0.0.1:8080/x", "http://169.254.169.254/latest/meta-data/", "http://localhost/x", "https://user:pw@elpais.com/a", "http://192.168.0.1/"] {
            assert!(!is_allowed(u, &[], &[u.to_string()]), "{u}");
        }
    }

    #[tokio::test]
    async fn redirects_are_revalidated_and_never_reach_private_hosts() {
        use wiremock::{matchers::path, Mock, MockServer, ResponseTemplate};
        let s = MockServer::start().await;
        Mock::given(path("/a")).respond_with(ResponseTemplate::new(302).insert_header("location", "http://169.254.169.254/latest/meta-data/")).mount(&s).await;
        Mock::given(path("/b")).respond_with(ResponseTemplate::new(200).set_body_raw("x", "application/octet-stream")).mount(&s).await;
        Mock::given(path("/c")).respond_with(ResponseTemplate::new(200).set_body_raw("<p>ok</p>", "text/html")).mount(&s).await;
        let c = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).build().unwrap();
        // El servidor de pruebas vive en 127.0.0.1: la prueba lo admite y deja el resto de reglas intactas.
        let base = s.uri();
        let allow = |u: &str| u.starts_with(&base) || is_allowed(u, &[], &[u.to_string()]);
        let err = fetch_source(&c, &format!("{}/a", base), allow).await.unwrap_err();
        assert_eq!(err.code(), "source_not_allowed");
        assert_eq!(fetch_source(&c, &format!("{}/b", base), allow).await.unwrap_err().code(), "unsupported_content");
        assert_eq!(fetch_source(&c, &format!("{}/c", base), allow).await.unwrap(), "<p>ok</p>");
    }
}

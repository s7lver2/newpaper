//! Descarga de fuentes para la verificación: solo lista blanca de fuentes primarias o URLs explícitas.
use crate::ProxyError;

const MAX_SOURCE_BYTES: usize = 4 * 1024 * 1024;

pub fn is_allowed(url: &str, whitelist: &[String], extra: &[String]) -> bool {
    let Ok(u) = url::Url::parse(url) else { return false };
    if !matches!(u.scheme(), "http" | "https") {
        return false;
    }
    if extra.iter().any(|e| e == url) {
        return true;
    }
    let host = u.host_str().unwrap_or("").to_ascii_lowercase();
    whitelist.iter().any(|d| host == *d || host.ends_with(&format!(".{d}")))
}

pub async fn fetch_source(client: &reqwest::Client, url: &str) -> Result<String, ProxyError> {
    let resp = client.get(url).send().await.map_err(|e| ProxyError::Network(e.to_string()))?;
    if !resp.status().is_success() {
        return Err(ProxyError::Network(format!("HTTP {}", resp.status())));
    }
    if resp.content_length().is_some_and(|l| l as usize > MAX_SOURCE_BYTES) {
        return Err(ProxyError::BodyTooLarge(resp.content_length().unwrap_or(0) as usize));
    }
    let text = resp.text().await.map_err(|e| ProxyError::Network(e.to_string()))?;
    if text.len() > MAX_SOURCE_BYTES {
        return Err(ProxyError::BodyTooLarge(text.len()));
    }
    Ok(text)
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
}

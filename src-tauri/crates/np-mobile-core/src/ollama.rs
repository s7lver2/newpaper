//! Direcciones aceptables para el Ollama del PC: nunca una IP pública en claro.
use std::net::{IpAddr, Ipv4Addr};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Endpoint {
    pub base: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OllamaRejection {
    NotHttp,
    PublicAddress,
    Unparseable,
}

fn private_v4(ip: Ipv4Addr) -> bool {
    let o = ip.octets();
    ip.is_loopback() || ip.is_private() || (o[0] == 100 && (o[1] & 0xC0) == 64)
}

pub fn classify(raw: &str) -> Result<Endpoint, OllamaRejection> {
    let url = url::Url::parse(raw.trim()).map_err(|_| OllamaRejection::Unparseable)?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err(OllamaRejection::NotHttp);
    }
    let host = url.host_str().ok_or(OllamaRejection::Unparseable)?.to_ascii_lowercase();
    let ok = match host.parse::<IpAddr>() {
        Ok(IpAddr::V4(v4)) => private_v4(v4),
        Ok(IpAddr::V6(v6)) => v6.is_loopback(),
        Err(_) => host == "localhost" || host.ends_with(".ts.net") || url.scheme() == "https",
    };
    if !ok {
        return Err(OllamaRejection::PublicAddress);
    }
    let base = format!(
        "{}://{}{}",
        url.scheme(),
        url.host_str().unwrap_or_default(),
        url.port().map(|p| format!(":{p}")).unwrap_or_default()
    );
    Ok(Endpoint { base })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_private_networks_and_rejects_public_http() {
        for ok in ["http://192.168.1.20:11434", "http://10.0.0.5:11434/", "http://172.20.3.4:11434", "http://100.101.5.6:11434", "http://pc.tailnet-1234.ts.net:11434", "http://127.0.0.1:11434", "https://ollama.example.org"] {
            assert!(classify(ok).is_ok(), "{ok}");
        }
        assert_eq!(classify("http://8.8.8.8:11434"), Err(OllamaRejection::PublicAddress));
        assert_eq!(classify("http://ollama.example.org:11434"), Err(OllamaRejection::PublicAddress));
        assert_eq!(classify("file:///etc/passwd"), Err(OllamaRejection::NotHttp));
        assert_eq!(classify("no es una url"), Err(OllamaRejection::Unparseable));
        assert_eq!(classify("http://192.168.1.20:11434/").unwrap().base, "http://192.168.1.20:11434");
    }
}

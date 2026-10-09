//! Proveedores autorizados (desde `config/providers.json`) y validación de URLs.
use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use url::Url;

use crate::ProxyError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthScheme {
    Bearer,
    XApiKey,
    XGoogApiKey,
    None,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProviderSpec {
    pub id: String,
    pub base_url: Url,
    pub auth: AuthScheme,
    pub local: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomEndpoint {
    pub id: String,
    pub base_url: String,
    pub auth: AuthScheme,
    pub local: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RegistryEntry {
    id: String,
    base_url: String,
    auth: AuthScheme,
    #[serde(rename = "type")]
    kind: String,
}

#[derive(Deserialize)]
struct Registry {
    providers: Vec<RegistryEntry>,
}

#[derive(Debug, Clone, Default)]
pub struct ProviderTable {
    specs: HashMap<String, ProviderSpec>,
}

fn with_trailing_slash(mut u: Url) -> Url {
    if !u.path().ends_with('/') {
        let p = format!("{}/", u.path());
        u.set_path(&p);
    }
    u
}

impl ProviderTable {
    pub fn from_registry_json(json: &str) -> Result<Self, ProxyError> {
        let reg: Registry = serde_json::from_str(json).map_err(|e| ProxyError::Config(e.to_string()))?;
        let mut t = ProviderTable::default();
        for p in reg.providers {
            let base = Url::parse(&p.base_url).map_err(|e| ProxyError::Config(format!("{}: {e}", p.id)))?;
            t.specs.insert(p.id.clone(), ProviderSpec { id: p.id, base_url: with_trailing_slash(base), auth: p.auth, local: p.kind == "local" });
        }
        Ok(t)
    }

    /// Solo `custom:*`, `ollama` y `lmstudio` admiten otra URL (los de la nube no se pueden redirigir).
    pub fn upsert_custom(&mut self, ep: &CustomEndpoint) -> Result<(), ProxyError> {
        let overridable = ep.id == "custom" || ep.id.starts_with("custom:") || ep.id == "ollama" || ep.id == "lmstudio";
        let deny = || ProxyError::UrlNotAllowed { provider: ep.id.clone(), url: ep.base_url.clone() };
        if !overridable {
            return Err(ProxyError::UnknownProvider(ep.id.clone()));
        }
        let base = with_trailing_slash(Url::parse(&ep.base_url).map_err(|_| deny())?);
        let scheme_ok = base.scheme() == "https" || (base.scheme() == "http" && ep.local);
        // Un endpoint remoto (no local) no puede apuntar a localhost/redes privadas: eso es un endpoint local explícito.
        if !scheme_ok || !base.username().is_empty() || base.password().is_some() || (!ep.local && crate::guard::is_private_host(&base)) {
            return Err(deny());
        }
        self.specs.insert(ep.id.clone(), ProviderSpec { id: ep.id.clone(), base_url: base, auth: ep.auth, local: ep.local });
        Ok(())
    }

    pub fn get(&self, id: &str) -> Option<&ProviderSpec> {
        self.specs.get(id)
    }

    /// `url` debe colgar de la URL base del proveedor (mismo esquema, host, puerto y prefijo de ruta).
    pub fn authorize(&self, provider_id: &str, url: &str) -> Result<(ProviderSpec, Url), ProxyError> {
        let spec = self.get(provider_id).ok_or_else(|| ProxyError::UnknownProvider(provider_id.to_string()))?;
        let deny = || ProxyError::UrlNotAllowed { provider: provider_id.to_string(), url: url.to_string() };
        if url.contains("/../") || url.contains("/./") {
            return Err(deny());
        }
        let target = Url::parse(url).map_err(|_| deny())?;
        let same_origin = target.scheme() == spec.base_url.scheme()
            && target.host_str() == spec.base_url.host_str()
            && target.port_or_known_default() == spec.base_url.port_or_known_default();
        let no_userinfo = target.username().is_empty() && target.password().is_none();
        let base_path = spec.base_url.path().trim_end_matches('/');
        let in_base = target.path() == base_path || target.path().starts_with(spec.base_url.path());
        if same_origin && no_userinfo && in_base {
            Ok((spec.clone(), target))
        } else {
            Err(deny())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const REG: &str = r#"{"version":1,"providers":[
      {"id":"anthropic","baseUrl":"https://api.anthropic.com/v1","auth":"x_api_key","type":"cloud"},
      {"id":"groq","baseUrl":"https://api.groq.com/openai/v1","auth":"bearer","type":"cloud"},
      {"id":"nvidia","baseUrl":"https://integrate.api.nvidia.com/v1","auth":"bearer","type":"cloud"},
      {"id":"ollama","baseUrl":"http://127.0.0.1:11434/v1","auth":"none","type":"local"}
    ]}"#;

    fn t() -> ProviderTable {
        ProviderTable::from_registry_json(REG).unwrap()
    }

    #[test]
    fn loads_providers_from_registry_json() {
        let t = t();
        assert_eq!(t.get("anthropic").unwrap().auth, AuthScheme::XApiKey);
        assert!(t.get("ollama").unwrap().local);
        assert_eq!(t.get("nvidia").unwrap().base_url.as_str(), "https://integrate.api.nvidia.com/v1/");
    }

    #[test]
    fn authorize_accepts_urls_under_the_base() {
        let (spec, url) = t().authorize("anthropic", "https://api.anthropic.com/v1/messages").unwrap();
        assert_eq!(spec.id, "anthropic");
        assert_eq!(url.path(), "/v1/messages");
        assert!(t().authorize("groq", "https://api.groq.com/openai/v1/chat/completions").is_ok());
        assert!(t().authorize("ollama", "http://127.0.0.1:11434/v1/models").is_ok());
    }

    #[test]
    fn authorize_rejects_other_hosts_schemes_ports_paths_and_userinfo() {
        for bad in [
            "https://evil.example/v1/messages",
            "http://api.anthropic.com/v1/messages",
            "https://api.anthropic.com:8443/v1/messages",
            "https://user:pw@api.anthropic.com/v1/messages",
            "https://api.anthropic.com/v2/messages",
            "https://api.anthropic.com/v1/../admin",
            "https://api.anthropic.com/v1/%2e%2e/admin",
            "https://api.anthropic.com@evil.example/v1/messages",
            "https://api.anthropic.com\\@evil.example/v1/messages",
            "https://api.anthropic.com.evil.example/v1/messages",
            "https://api.anthropic.com./v1/messages",
            "https://api.anthropic.com/v1evil",
            "/v1/messages",
            "//evil.example/v1/messages",
        ] {
            assert_eq!(t().authorize("anthropic", bad).unwrap_err().code(), "url_not_allowed", "{bad}");
        }
        assert_eq!(t().authorize("nope", "https://x.y/").unwrap_err().code(), "unknown_provider");
    }

    #[test]
    fn custom_endpoints_only_for_overridable_ids_and_https_unless_local() {
        let mut t = t();
        let ok = CustomEndpoint { id: "custom:mi-servidor".into(), base_url: "https://llm.example.org/v1".into(), auth: AuthScheme::Bearer, local: false };
        t.upsert_custom(&ok).unwrap();
        assert!(t.authorize("custom:mi-servidor", "https://llm.example.org/v1/chat/completions").is_ok());
        assert!(t.upsert_custom(&CustomEndpoint { id: "anthropic".into(), ..ok.clone() }).is_err());
        assert!(t.upsert_custom(&CustomEndpoint { base_url: "http://llm.example.org/v1".into(), ..ok.clone() }).is_err());
        for private in ["https://169.254.169.254/v1", "https://127.0.0.1/v1", "https://intranet/v1"] {
            assert!(t.upsert_custom(&CustomEndpoint { base_url: private.into(), ..ok.clone() }).is_err(), "{private}");
        }
        let lan = CustomEndpoint { id: "ollama".into(), base_url: "http://192.168.1.20:11434/v1".into(), auth: AuthScheme::None, local: true };
        t.upsert_custom(&lan).unwrap();
        // The fixed id the UI uses for its single custom endpoint (the provider registry entry is `custom`).
        t.upsert_custom(&CustomEndpoint { id: "custom".into(), ..ok.clone() }).unwrap();
        assert!(t.authorize("ollama", "http://192.168.1.20:11434/v1/chat/completions").is_ok());
    }
}

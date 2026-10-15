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

/// Cómo se obtiene la clave sin pegarla a mano. Solo `PkceKey` se puede ejecutar hoy; `Device` está en el
/// esquema para cuando un proveedor publique y confirme sus puntos de acceso.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LoginFlow {
    #[serde(rename = "oauth-pkce-key")]
    PkceKey,
    #[serde(rename = "oauth-device")]
    Device,
}

/// `available`: verificado con la documentación oficial. `unverified`/`gated`: el marco está listo pero no se ejecuta.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LoginStatus {
    Available,
    Unverified,
    Gated,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LoginSpec {
    pub flow: LoginFlow,
    pub status: LoginStatus,
    pub auth_url: Option<Url>,
    pub exchange_url: Option<Url>,
}

impl LoginSpec {
    pub fn runnable(&self) -> bool {
        self.flow == LoginFlow::PkceKey && self.status == LoginStatus::Available && self.auth_url.is_some() && self.exchange_url.is_some()
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProviderSpec {
    pub id: String,
    pub base_url: Url,
    pub auth: AuthScheme,
    pub local: bool,
    pub login: Option<LoginSpec>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LoginEntry {
    flow: LoginFlow,
    status: LoginStatus,
    auth_url: Option<String>,
    exchange_url: Option<String>,
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
    login: Option<LoginEntry>,
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

/// Las direcciones del inicio de sesión deben ser https y del mismo host que la API del proveedor: así la clave
/// (y el código de intercambio) solo viajan a quien ya recibe esa clave.
fn parse_login(id: &str, base: &Url, l: LoginEntry) -> Result<LoginSpec, ProxyError> {
    let cfg = |m: &str| ProxyError::Config(format!("{id}: login {m}"));
    let parse = |u: Option<String>| -> Result<Option<Url>, ProxyError> {
        u.map(|u| {
            let url = Url::parse(&u).map_err(|_| cfg("url is not valid"))?;
            let same_host = url.scheme() == "https" && url.host_str() == base.host_str() && url.port_or_known_default() == base.port_or_known_default();
            if same_host && url.username().is_empty() && url.password().is_none() { Ok(url) } else { Err(cfg("url must be https on the provider host")) }
        })
        .transpose()
    };
    let spec = LoginSpec { flow: l.flow, status: l.status, auth_url: parse(l.auth_url)?, exchange_url: parse(l.exchange_url)? };
    if spec.status == LoginStatus::Available && !spec.runnable() {
        return Err(cfg("is marked available but is not a complete pkce flow"));
    }
    Ok(spec)
}

impl ProviderTable {
    pub fn from_registry_json(json: &str) -> Result<Self, ProxyError> {
        let reg: Registry = serde_json::from_str(json).map_err(|e| ProxyError::Config(e.to_string()))?;
        let mut t = ProviderTable::default();
        for p in reg.providers {
            let base = Url::parse(&p.base_url).map_err(|e| ProxyError::Config(format!("{}: {e}", p.id)))?;
            let base = with_trailing_slash(base);
            let login = p.login.map(|l| parse_login(&p.id, &base, l)).transpose()?;
            t.specs.insert(p.id.clone(), ProviderSpec { id: p.id, base_url: base, auth: p.auth, local: p.kind == "local", login });
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
        self.specs.insert(ep.id.clone(), ProviderSpec { id: ep.id.clone(), base_url: base, auth: ep.auth, local: ep.local, login: None });
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
    fn login_specs_are_validated_against_the_provider_host() {
        let ok = r#"{"providers":[{"id":"openrouter","baseUrl":"https://openrouter.ai/api/v1","auth":"bearer","type":"cloud",
          "login":{"flow":"oauth-pkce-key","status":"available","authUrl":"https://openrouter.ai/auth","exchangeUrl":"https://openrouter.ai/api/v1/auth/keys"}},
          {"id":"nous","baseUrl":"https://inference-api.nousresearch.com/v1","auth":"bearer","type":"cloud","login":{"flow":"oauth-device","status":"unverified"}}]}"#;
        let t = ProviderTable::from_registry_json(ok).unwrap();
        assert!(t.get("openrouter").unwrap().login.as_ref().unwrap().runnable());
        assert!(!t.get("nous").unwrap().login.as_ref().unwrap().runnable());
        assert!(t.get("anthropic").is_none());
        for bad in [
            r#""authUrl":"https://evil.example/auth","exchangeUrl":"https://openrouter.ai/api/v1/auth/keys""#,
            r#""authUrl":"http://openrouter.ai/auth","exchangeUrl":"https://openrouter.ai/api/v1/auth/keys""#,
            r#""authUrl":"https://openrouter.ai/auth""#,
        ] {
            let j = format!(r#"{{"providers":[{{"id":"openrouter","baseUrl":"https://openrouter.ai/api/v1","auth":"bearer","type":"cloud","login":{{"flow":"oauth-pkce-key","status":"available",{bad}}}}}]}}"#);
            assert!(ProviderTable::from_registry_json(&j).is_err(), "{bad}");
        }
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

use std::{
    collections::HashMap,
    sync::{Arc, Mutex, RwLock},
};

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use futures::{
    future::{AbortHandle, Abortable},
    StreamExt,
};
use np_store::secrets::SecretStore;
use serde::{Deserialize, Serialize};

use crate::{
    headers::{auth_header, sanitize_request_headers, sanitize_response_headers},
    table::{AuthScheme, CustomEndpoint, ProviderTable},
    ProxyError,
};

pub const MAX_REQUEST_BODY: usize = 8 * 1024 * 1024;

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyRequest {
    pub request_id: String,
    pub url: String,
    pub method: String,
    pub headers: Vec<(String, String)>,
    pub body: Option<String>,
}

/// Orden: `head`, `chunk`*, `end` | `error`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
pub enum ProxyEvent {
    Head { status: u16, headers: Vec<(String, String)> },
    Chunk { b64: String },
    End,
    Error { code: String, message: String },
}

pub struct AiProxy {
    base: RwLock<ProviderTable>,
    table: RwLock<ProviderTable>,
    secrets: Arc<dyn SecretStore>,
    inflight: Mutex<HashMap<String, AbortHandle>>,
}

/// Nombre de la clave en el llavero: `ai.<proveedor>`; los `custom:x` se guardan como `ai.custom-x`.
pub fn secret_key(provider: &str) -> String {
    format!("ai.{}", provider.replace(':', "-"))
}

impl AiProxy {
    pub fn new(table: ProviderTable, secrets: Arc<dyn SecretStore>) -> Self {
        Self { base: RwLock::new(table.clone()), table: RwLock::new(table), secrets, inflight: Mutex::default() }
    }

    pub fn set_table(&self, table: ProviderTable) {
        *self.base.write().expect("lock") = table.clone();
        *self.table.write().expect("lock") = table;
    }

    pub fn set_custom(&self, endpoints: &[CustomEndpoint]) -> Result<(), ProxyError> {
        let mut t = self.base.read().expect("lock").clone();
        for ep in endpoints {
            t.upsert_custom(ep)?;
        }
        *self.table.write().expect("lock") = t;
        Ok(())
    }

    pub fn cancel(&self, request_id: &str) -> bool {
        self.inflight.lock().expect("lock").remove(request_id).map(|h| h.abort()).is_some()
    }

    pub async fn execute<F>(&self, provider: &str, req: ProxyRequest, client: reqwest::Client, sink: F) -> Result<(), ProxyError>
    where
        F: Fn(ProxyEvent) + Send + Sync,
    {
        let (handle, reg) = AbortHandle::new_pair();
        let id = req.request_id.clone();
        self.inflight.lock().expect("lock").insert(id.clone(), handle);
        let result = match Abortable::new(self.inner(provider, req, client, &sink), reg).await {
            Ok(r) => r,
            Err(_) => Err(ProxyError::Cancelled),
        };
        self.inflight.lock().expect("lock").remove(&id);
        if let Err(e) = &result {
            sink(ProxyEvent::Error { code: e.code().to_string(), message: e.to_string() });
        }
        result
    }

    async fn inner<F>(&self, provider: &str, req: ProxyRequest, client: reqwest::Client, sink: &F) -> Result<(), ProxyError>
    where
        F: Fn(ProxyEvent) + Send + Sync,
    {
        let (spec, url) = self.table.read().expect("lock").authorize(provider, &req.url)?;
        let method = match req.method.to_ascii_uppercase().as_str() {
            "GET" => reqwest::Method::GET,
            "POST" => reqwest::Method::POST,
            other => return Err(ProxyError::MethodNotAllowed(other.to_string())),
        };
        if req.body.as_ref().is_some_and(|b| b.len() > MAX_REQUEST_BODY) {
            return Err(ProxyError::BodyTooLarge(req.body.as_ref().map_or(0, |b| b.len())));
        }
        let mut headers = sanitize_request_headers(&req.headers);
        if spec.auth != AuthScheme::None {
            let key = self
                .secrets
                .get(&secret_key(&spec.id))
                .map_err(|e| ProxyError::Keyring(e.to_string()))?
                .filter(|k| !k.trim().is_empty())
                .ok_or_else(|| ProxyError::MissingKey(spec.id.clone()))?;
            headers.extend(auth_header(spec.auth, key.trim()));
        }
        let mut b = client.request(method, url);
        for (k, v) in &headers {
            b = b.header(k.as_str(), v.as_str());
        }
        if let Some(body) = req.body {
            b = b.body(body);
        }
        let resp = b.send().await.map_err(|e| ProxyError::Network(e.to_string()))?;
        let status = resp.status().as_u16();
        let resp_headers: Vec<(String, String)> = resp.headers().iter().filter_map(|(k, v)| v.to_str().ok().map(|v| (k.as_str().to_string(), v.to_string()))).collect();
        sink(ProxyEvent::Head { status, headers: sanitize_response_headers(&resp_headers) });
        let mut stream = resp.bytes_stream();
        while let Some(chunk) = stream.next().await {
            let bytes = chunk.map_err(|e| ProxyError::Network(e.to_string()))?;
            if !bytes.is_empty() {
                sink(ProxyEvent::Chunk { b64: B64.encode(&bytes) });
            }
        }
        sink(ProxyEvent::End);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secret_key_has_no_colon() {
        assert_eq!(secret_key("openai"), "ai.openai");
        assert_eq!(secret_key("custom:mi-servidor"), "ai.custom-mi-servidor");
    }
}

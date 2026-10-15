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
/// Tope de respuesta por petición (los modelos devuelven KB; esto frena un endpoint hostil).
pub const MAX_RESPONSE_BODY: usize = 64 * 1024 * 1024;
/// Tiempo total máximo de una petición (modelos lentos con razonamiento incluidos).
pub const REQUEST_DEADLINE: std::time::Duration = std::time::Duration::from_secs(600);

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

    /// Especificación del proveedor tal como está en la tabla (para el inicio de sesión).
    pub fn spec(&self, provider: &str) -> Option<crate::table::ProviderSpec> {
        self.table.read().expect("lock").get(provider).cloned()
    }

    pub fn cancel(&self, request_id: &str) -> bool {
        self.inflight.lock().expect("lock").remove(request_id).map(|h| h.abort()).is_some()
    }

    pub async fn execute<F>(&self, provider: &str, req: ProxyRequest, client: reqwest::Client, sink: F) -> Result<(), ProxyError>
    where
        F: Fn(ProxyEvent) + Send + Sync,
    {
        self.execute_live(provider, req, client, move |e| {
            sink(e);
            true
        })
        .await
    }

    /// Como `execute`, pero si `sink` devuelve `false` (el canal ya no tiene receptor) la descarga se corta.
    /// El `client` debe venir con las redirecciones desactivadas: las cabeceras de clave propias de cada
    /// proveedor (`x-api-key`) no las elimina reqwest al saltar a otro host.
    pub async fn execute_live<F>(&self, provider: &str, req: ProxyRequest, client: reqwest::Client, sink: F) -> Result<(), ProxyError>
    where
        F: Fn(ProxyEvent) -> bool + Send + Sync,
    {
        let (handle, reg) = AbortHandle::new_pair();
        let id = req.request_id.clone();
        {
            let mut inflight = self.inflight.lock().expect("lock");
            if inflight.contains_key(&id) {
                drop(inflight);
                let e = ProxyError::DuplicateRequest(id);
                sink(ProxyEvent::Error { code: e.code().to_string(), message: e.to_string() });
                return Err(e);
            }
            inflight.insert(id.clone(), handle);
        }
        let work = tokio::time::timeout(REQUEST_DEADLINE, self.inner(provider, req, client, &sink));
        let result = match Abortable::new(work, reg).await {
            Ok(Ok(r)) => r,
            Ok(Err(_)) => Err(ProxyError::Network("request timed out".into())),
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
        F: Fn(ProxyEvent) -> bool + Send + Sync,
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
        let headers = sanitize_request_headers(&req.headers);
        let mut headers_auth = None;
        if spec.auth != AuthScheme::None {
            let key = self
                .secrets
                .get(&secret_key(&spec.id))
                .map_err(|e| ProxyError::Keyring(e.to_string()))?
                .filter(|k| !k.trim().is_empty())
                .ok_or_else(|| ProxyError::MissingKey(spec.id.clone()))?;
            headers_auth = auth_header(spec.auth, key.trim());
        }
        let mut b = client.request(method, url);
        for (k, v) in &headers {
            b = b.header(k.as_str(), v.as_str());
        }
        if let Some((k, v)) = headers_auth {
            // Marcada como sensible: no aparece en `Debug` ni la reenvía un cliente con redirecciones.
            let mut hv = reqwest::header::HeaderValue::from_str(&v).map_err(|_| ProxyError::Keyring("stored key is not a valid header value".into()))?;
            hv.set_sensitive(true);
            b = b.header(k.as_str(), hv);
        }
        if let Some(body) = req.body {
            b = b.body(body);
        }
        let resp = b.send().await.map_err(|e| ProxyError::Network(e.to_string()))?;
        let status = resp.status().as_u16();
        let resp_headers: Vec<(String, String)> = resp.headers().iter().filter_map(|(k, v)| v.to_str().ok().map(|v| (k.as_str().to_string(), v.to_string()))).collect();
        if !sink(ProxyEvent::Head { status, headers: sanitize_response_headers(&resp_headers) }) {
            return Err(ProxyError::Cancelled);
        }
        let mut stream = resp.bytes_stream();
        let mut total = 0usize;
        while let Some(chunk) = stream.next().await {
            let bytes = chunk.map_err(|e| ProxyError::Network(e.to_string()))?;
            total += bytes.len();
            if total > MAX_RESPONSE_BODY {
                return Err(ProxyError::BodyTooLarge(total));
            }
            if !bytes.is_empty() && !sink(ProxyEvent::Chunk { b64: B64.encode(&bytes) }) {
                return Err(ProxyError::Cancelled);
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

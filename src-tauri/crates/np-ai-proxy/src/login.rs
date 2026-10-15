//! Inicio de sesión OAuth con PKCE para obtener una clave de API sin pegarla a mano ("Sign in with OpenRouter").
//!
//! Todo ocurre en Rust: el verificador PKCE, el `state`, el código y la clave resultante nunca llegan a la
//! webview ni a los registros. La respuesta del navegador la recibe un oyente en `127.0.0.1` con puerto aleatorio
//! que atiende una sola redirección válida, caduca solo y se cierra al terminar (o al cancelar).
use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD as B64U, Engine};
use futures::future::{AbortHandle, Abortable};
use np_store::secrets::SecretStore;
use sha2::{Digest, Sha256};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
};
use url::Url;

use crate::{table::LoginSpec, ProxyError};

/// Tiempo que se espera a que la persona apruebe el acceso en el navegador.
pub const LOGIN_TIMEOUT: Duration = Duration::from_secs(300);
const EXCHANGE_TIMEOUT: Duration = Duration::from_secs(30);
const CONN_READ_TIMEOUT: Duration = Duration::from_secs(3);
const MAX_REQUEST_HEAD: usize = 8 * 1024;
const MAX_EXCHANGE_BODY: usize = 64 * 1024;
const CALLBACK_PATH: &str = "/callback";

const PAGE_OK: &str = "<!doctype html><meta charset=utf-8><title>newpaper</title><body style=\"font:16px system-ui;margin:3rem\"><h1>Listo</h1><p>Ya puedes cerrar esta pesta\u{f1}a y volver a newpaper.</p>";
const PAGE_BAD: &str = "<!doctype html><meta charset=utf-8><title>newpaper</title><body style=\"font:16px system-ui;margin:3rem\"><h1>No se pudo completar</h1><p>Vuelve a newpaper e int\u{e9}ntalo de nuevo.</p>";

/// Un intento de inicio de sesión: puerto abierto, verificador y `state` aleatorios.
pub struct LoginSession {
    listener: TcpListener,
    verifier: String,
    state: String,
    port: u16,
    exchange_url: Url,
}

/// `code_challenge` = BASE64URL(SHA-256(verifier)), sin relleno (RFC 7636, método S256).
pub fn challenge_of(verifier: &str) -> String {
    B64U.encode(Sha256::digest(verifier.as_bytes()))
}

/// Verificador de 64 caracteres hexadecimales (alfabeto permitido por RFC 7636, 43–128): 244 bits de azar del SO.
fn new_verifier() -> String {
    format!("{}{}", uuid::Uuid::new_v4().simple(), uuid::Uuid::new_v4().simple())
}

impl LoginSession {
    /// Abre el oyente y construye la URL que hay que visitar. `auth_url` y `exchange_url` ya vienen validados.
    pub async fn begin(auth_url: &Url, exchange_url: &Url) -> Result<(Self, Url), ProxyError> {
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.map_err(|e| ProxyError::LoginFailed(format!("cannot listen: {e}")))?;
        let port = listener.local_addr().map_err(|e| ProxyError::LoginFailed(e.to_string()))?.port();
        let verifier = new_verifier();
        let state = uuid::Uuid::new_v4().simple().to_string();
        let mut url = auth_url.clone();
        url.query_pairs_mut()
            .append_pair("callback_url", &format!("http://localhost:{port}{CALLBACK_PATH}"))
            .append_pair("code_challenge", &challenge_of(&verifier))
            .append_pair("code_challenge_method", "S256")
            .append_pair("state", &state);
        Ok((Self { listener, verifier, state, port, exchange_url: exchange_url.clone() }, url))
    }

    pub fn port(&self) -> u16 {
        self.port
    }

    /// Espera la redirección del navegador. Solo vale una petición `GET /callback` con el `state` correcto y un
    /// `Host` local; el resto (otros caminos, otro `state`, otro `Host`, basura) se contesta y se ignora.
    pub async fn wait_for_code(&self, timeout: Duration) -> Result<String, ProxyError> {
        let deadline = Instant::now() + timeout;
        loop {
            let left = deadline.saturating_duration_since(Instant::now());
            let accepted = tokio::time::timeout(left, self.listener.accept()).await.map_err(|_| ProxyError::LoginTimeout)?;
            let Ok((mut stream, peer)) = accepted else { continue };
            if !peer.ip().is_loopback() {
                continue;
            }
            match self.handle(&mut stream).await {
                Callback::Code(c) => return Ok(c),
                Callback::Denied => return Err(ProxyError::LoginDenied),
                Callback::Ignored => {}
            }
        }
    }

    async fn handle(&self, stream: &mut TcpStream) -> Callback {
        let Some(head) = read_head(stream).await else {
            respond(stream, 400, PAGE_BAD).await;
            return Callback::Ignored;
        };
        let verdict = self.classify(&head);
        match &verdict {
            Callback::Ignored => respond(stream, 400, PAGE_BAD).await,
            _ => respond(stream, 200, PAGE_OK).await,
        }
        verdict
    }

    fn classify(&self, head: &str) -> Callback {
        let mut lines = head.split("\r\n");
        let mut first = lines.next().unwrap_or("").split(' ');
        let (method, target) = (first.next().unwrap_or(""), first.next().unwrap_or(""));
        if method != "GET" || !target.starts_with('/') {
            return Callback::Ignored;
        }
        let host_ok = lines.any(|l| {
            l.split_once(':').is_some_and(|(k, v)| {
                let v = v.trim();
                k.eq_ignore_ascii_case("host") && (v == format!("localhost:{}", self.port) || v == format!("127.0.0.1:{}", self.port))
            })
        });
        let Ok(url) = Url::parse(&format!("http://localhost{target}")) else { return Callback::Ignored };
        if !host_ok || url.path() != CALLBACK_PATH {
            return Callback::Ignored;
        }
        let q: HashMap<String, String> = url.query_pairs().map(|(k, v)| (k.into_owned(), v.into_owned())).collect();
        if !q.get("state").is_some_and(|s| ct_eq(s.as_bytes(), self.state.as_bytes())) {
            return Callback::Ignored;
        }
        match (q.get("code"), q.get("error")) {
            (Some(c), None) if !c.is_empty() && c.len() <= 512 => Callback::Code(c.clone()),
            (_, Some(_)) => Callback::Denied,
            _ => Callback::Ignored,
        }
    }

    /// Cambia el código por la clave (`POST` JSON con el verificador). El cliente no debe seguir redirecciones.
    pub async fn exchange(self, code: &str, client: &reqwest::Client) -> Result<String, ProxyError> {
        let body = serde_json::json!({ "code": code, "code_verifier": self.verifier, "code_challenge_method": "S256" });
        let mut resp = client
            .post(self.exchange_url.clone())
            .timeout(EXCHANGE_TIMEOUT)
            .json(&body)
            .send()
            .await
            .map_err(|e| ProxyError::LoginFailed(format!("network: {}", e.without_url())))?;
        if !resp.status().is_success() {
            // Sin el cuerpo: podría repetir el código. 403 = código caducado, ya usado o verificador distinto.
            return Err(ProxyError::LoginFailed(format!("the provider answered HTTP {}", resp.status().as_u16())));
        }
        let mut buf = Vec::new();
        while let Some(chunk) = resp.chunk().await.map_err(|e| ProxyError::LoginFailed(format!("network: {}", e.without_url())))? {
            buf.extend_from_slice(&chunk);
            if buf.len() > MAX_EXCHANGE_BODY {
                return Err(ProxyError::LoginFailed("the provider answer is too large".into()));
            }
        }
        let key = serde_json::from_slice::<serde_json::Value>(&buf).ok().and_then(|v| v.get("key")?.as_str().map(str::to_string));
        match key {
            Some(k) if (8..=512).contains(&k.len()) && k.bytes().all(|b| b.is_ascii_graphic()) => Ok(k),
            _ => Err(ProxyError::LoginFailed("the provider did not return a key".into())),
        }
    }
}

enum Callback {
    Code(String),
    Denied,
    Ignored,
}

fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |d, (x, y)| d | (x ^ y)) == 0
}

async fn read_head(stream: &mut TcpStream) -> Option<String> {
    let mut buf = Vec::with_capacity(1024);
    let mut chunk = [0u8; 1024];
    let read = async {
        loop {
            let n = stream.read(&mut chunk).await.ok()?;
            if n == 0 {
                return None;
            }
            buf.extend_from_slice(&chunk[..n]);
            if buf.windows(4).any(|w| w == b"\r\n\r\n") {
                return Some(());
            }
            if buf.len() > MAX_REQUEST_HEAD {
                return None;
            }
        }
    };
    tokio::time::timeout(CONN_READ_TIMEOUT, read).await.ok()??;
    String::from_utf8(buf).ok()
}

async fn respond(stream: &mut TcpStream, status: u16, html: &str) {
    let reason = if status == 200 { "OK" } else { "Bad Request" };
    let head = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nContent-Security-Policy: default-src 'none'; style-src 'unsafe-inline'\r\nConnection: close\r\n\r\n",
        html.len()
    );
    let _ = stream.write_all(head.as_bytes()).await;
    let _ = stream.write_all(html.as_bytes()).await;
    let _ = stream.shutdown().await;
}

/// Inicios de sesión en curso (uno por proveedor) para poder cancelarlos desde la interfaz.
#[derive(Default)]
pub struct LoginRegistry {
    inflight: Mutex<HashMap<String, AbortHandle>>,
}

pub struct LoginRun<'a> {
    pub provider: &'a str,
    pub spec: &'a LoginSpec,
    /// Dónde se guarda la clave en el llavero (`ai.<id>`); distinto del real solo en pruebas.
    pub secret_id: String,
    pub client: reqwest::Client,
    pub secrets: &'a dyn SecretStore,
    pub timeout: Duration,
}

impl LoginRegistry {
    pub fn cancel(&self, provider: &str) -> bool {
        self.inflight.lock().expect("lock").remove(provider).map(|h| h.abort()).is_some()
    }

    /// Ejecuta el inicio de sesión completo. `on_url` recibe la dirección que hay que abrir en el navegador.
    /// La clave se guarda en el llavero y no se devuelve.
    pub async fn run<F: FnOnce(&Url)>(&self, run: LoginRun<'_>, on_url: F) -> Result<(), ProxyError> {
        let (Some(auth), Some(exchange)) = (&run.spec.auth_url, &run.spec.exchange_url) else { return Err(ProxyError::LoginUnavailable(run.provider.to_string())) };
        if !run.spec.runnable() {
            return Err(ProxyError::LoginUnavailable(run.provider.to_string()));
        }
        let (handle, reg) = AbortHandle::new_pair();
        {
            let mut map = self.inflight.lock().expect("lock");
            if map.contains_key(run.provider) {
                return Err(ProxyError::LoginBusy(run.provider.to_string()));
            }
            map.insert(run.provider.to_string(), handle);
        }
        let result = Abortable::new(
            async {
                let (session, url) = LoginSession::begin(auth, exchange).await?;
                on_url(&url);
                let code = session.wait_for_code(run.timeout).await?;
                let key = session.exchange(&code, &run.client).await?;
                run.secrets.set(&run.secret_id, &key).map_err(|e| ProxyError::Keyring(e.to_string()))
            },
            reg,
        )
        .await
        .unwrap_or(Err(ProxyError::Cancelled));
        self.inflight.lock().expect("lock").remove(run.provider);
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn challenge_matches_the_rfc_7636_vector() {
        assert_eq!(challenge_of("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
        let v = new_verifier();
        assert!((43..=128).contains(&v.len()) && v.bytes().all(|b| b.is_ascii_hexdigit()));
        assert_ne!(v, new_verifier());
    }
}

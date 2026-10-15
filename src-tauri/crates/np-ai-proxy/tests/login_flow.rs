//! Inicio de sesión OAuth/PKCE contra un servidor local falso (nunca el proveedor real).
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};

use np_ai_proxy::{
    login::{challenge_of, LoginRegistry, LoginRun},
    LoginFlow, LoginSpec, LoginStatus, ProxyError,
};
use np_store::secrets::{MemorySecrets, SecretStore};
use tokio::{io::{AsyncReadExt, AsyncWriteExt}, net::TcpStream};
use url::Url;
use wiremock::{matchers::{method, path}, Match, Mock, MockServer, Request, ResponseTemplate};

/// Acepta el intercambio solo si el verificador cuadra con el `code_challenge` de la URL de autorización.
struct Pkce { challenge: Arc<Mutex<String>>, code: &'static str }
impl Match for Pkce {
    fn matches(&self, r: &Request) -> bool {
        let Ok(v) = serde_json::from_slice::<serde_json::Value>(&r.body) else { return false };
        v["code"] == self.code && v["code_challenge_method"] == "S256" && challenge_of(v["code_verifier"].as_str().unwrap_or("")) == *self.challenge.lock().unwrap()
    }
}

fn spec(server: &MockServer) -> LoginSpec {
    LoginSpec {
        flow: LoginFlow::PkceKey,
        status: LoginStatus::Available,
        auth_url: Some(Url::parse(&format!("{}/auth", server.uri())).unwrap()),
        exchange_url: Some(Url::parse(&format!("{}/api/v1/auth/keys", server.uri())).unwrap()),
    }
}

fn param(url: &Url, k: &str) -> String {
    url.query_pairs().find(|(a, _)| a == k).map(|(_, v)| v.into_owned()).unwrap_or_default()
}

/// Una petición HTTP cruda al oyente; devuelve la línea de estado (o `None` si no hay nadie escuchando).
async fn hit(port: u16, target: &str, host: &str) -> Option<String> {
    let mut s = TcpStream::connect(("127.0.0.1", port)).await.ok()?;
    s.write_all(format!("GET {target} HTTP/1.1\r\nHost: {host}\r\n\r\n").as_bytes()).await.ok()?;
    let mut out = String::new();
    let _ = s.read_to_string(&mut out).await;
    Some(out.lines().next().unwrap_or("").to_string())
}

fn port_of(callback: &str) -> u16 {
    Url::parse(callback).unwrap().port().unwrap()
}

struct Harness { reg: Arc<LoginRegistry>, secrets: Arc<MemorySecrets>, url: Arc<Mutex<Option<Url>>> }
impl Harness {
    fn new() -> Self {
        Self { reg: Arc::new(LoginRegistry::default()), secrets: Arc::new(MemorySecrets::default()), url: Arc::default() }
    }
    fn spawn(&self, spec: LoginSpec, timeout: Duration) -> tokio::task::JoinHandle<Result<(), ProxyError>> {
        let (reg, secrets, slot) = (self.reg.clone(), self.secrets.clone(), self.url.clone());
        tokio::spawn(async move {
            let run = LoginRun { provider: "openrouter", spec: &spec, secret_id: "ai.openrouter".into(), client: reqwest::Client::new(), secrets: &*secrets, timeout };
            reg.run(run, |u| *slot.lock().unwrap() = Some(u.clone())).await
        })
    }
    async fn auth_url(&self) -> Url {
        for _ in 0..200 {
            if let Some(u) = self.url.lock().unwrap().clone() {
                return u;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        panic!("no auth url");
    }
}

#[tokio::test]
async fn full_flow_checks_pkce_state_and_stores_the_key() {
    let server = MockServer::start().await;
    let challenge = Arc::new(Mutex::new(String::new()));
    Mock::given(method("POST")).and(path("/api/v1/auth/keys")).and(Pkce { challenge: challenge.clone(), code: "the-code" })
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({ "key": "sk-or-v1-fake-key-123" })))
        .up_to_n_times(1)
        .expect(1)
        .mount(&server)
        .await;
    let h = Harness::new();
    let task = h.spawn(spec(&server), Duration::from_secs(10));
    let url = h.auth_url().await;
    assert_eq!(param(&url, "code_challenge_method"), "S256");
    assert_eq!(param(&url, "code_challenge").len(), 43);
    *challenge.lock().unwrap() = param(&url, "code_challenge");
    let cb = param(&url, "callback_url");
    assert!(cb.starts_with("http://localhost:") && cb.ends_with("/callback"), "{cb}");
    let (port, state) = (port_of(&cb), param(&url, "state"));
    assert_eq!(state.len(), 32);

    // Ruido que no debe cerrar el inicio de sesión: otro estado, sin estado, otro camino, otro Host, otro método.
    let host = format!("localhost:{port}");
    for target in ["/callback?code=the-code&state=wrong", "/callback?code=the-code", "/other?code=the-code&state=".to_string().as_str()] {
        assert!(hit(port, target, &host).await.unwrap().contains("400"), "{target}");
    }
    assert!(hit(port, &format!("/callback?code=the-code&state={state}"), "evil.example").await.unwrap().contains("400"));
    assert!(!task.is_finished());

    assert!(hit(port, &format!("/callback?code=the-code&state={state}"), &host).await.unwrap().contains("200"));
    task.await.unwrap().unwrap();
    assert_eq!(h.secrets.get("ai.openrouter").unwrap().as_deref(), Some("sk-or-v1-fake-key-123"));
    // El oyente es de un solo uso: el mismo callback repetido ya no encuentra a nadie.
    assert!(hit(port, &format!("/callback?code=the-code&state={state}"), &host).await.is_none());
}

#[tokio::test]
async fn a_code_the_provider_rejects_fails_without_storing_anything() {
    let server = MockServer::start().await;
    Mock::given(method("POST")).and(path("/api/v1/auth/keys")).respond_with(ResponseTemplate::new(403).set_body_string("code sk-leak")).mount(&server).await;
    let h = Harness::new();
    let task = h.spawn(spec(&server), Duration::from_secs(10));
    let url = h.auth_url().await;
    let (port, state) = (port_of(&param(&url, "callback_url")), param(&url, "state"));
    hit(port, &format!("/callback?code=bad&state={state}"), &format!("127.0.0.1:{port}")).await.unwrap();
    let err = task.await.unwrap().unwrap_err();
    assert_eq!(err.code(), "login_failed");
    assert!(!err.to_string().contains("sk-leak"), "the provider body must not be echoed");
    assert!(h.secrets.get("ai.openrouter").unwrap().is_none());
}

#[tokio::test]
async fn a_wrong_verifier_is_refused_by_the_exchange() {
    // El servidor falso solo acepta el verificador de otra sesión: el intercambio debe fallar y no guardar clave.
    let server = MockServer::start().await;
    Mock::given(method("POST")).and(path("/api/v1/auth/keys")).and(Pkce { challenge: Arc::new(Mutex::new(challenge_of("another-session"))), code: "c" })
        .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({ "key": "sk-or-v1-never" })))
        .mount(&server)
        .await;
    let h = Harness::new();
    let task = h.spawn(spec(&server), Duration::from_secs(10));
    let url = h.auth_url().await;
    let (port, state) = (port_of(&param(&url, "callback_url")), param(&url, "state"));
    hit(port, &format!("/callback?code=c&state={state}"), &format!("localhost:{port}")).await.unwrap();
    assert_eq!(task.await.unwrap().unwrap_err().code(), "login_failed");
    assert!(h.secrets.get("ai.openrouter").unwrap().is_none());
}

#[tokio::test]
async fn times_out_and_closes_the_listener() {
    let server = MockServer::start().await;
    let h = Harness::new();
    let task = h.spawn(spec(&server), Duration::from_millis(300));
    let url = h.auth_url().await;
    let port = port_of(&param(&url, "callback_url"));
    assert_eq!(task.await.unwrap().unwrap_err().code(), "login_timeout");
    assert!(hit(port, "/callback", &format!("localhost:{port}")).await.is_none());
}

#[tokio::test]
async fn cancel_stops_the_wait_closes_the_port_and_allows_a_new_login() {
    let server = MockServer::start().await;
    let h = Harness::new();
    let task = h.spawn(spec(&server), Duration::from_secs(30));
    let url = h.auth_url().await;
    let port = port_of(&param(&url, "callback_url"));
    // Un segundo inicio para el mismo proveedor mientras el primero sigue vivo se rechaza.
    let again = h.spawn(spec(&server), Duration::from_secs(30)).await.unwrap().unwrap_err();
    assert_eq!(again.code(), "login_busy");
    assert!(h.reg.cancel("openrouter"));
    assert_eq!(task.await.unwrap().unwrap_err().code(), "cancelled");
    assert!(hit(port, "/callback", &format!("localhost:{port}")).await.is_none());
    assert!(!h.reg.cancel("openrouter"));
    *h.url.lock().unwrap() = None;
    let second = h.spawn(spec(&server), Duration::from_millis(100));
    assert_eq!(second.await.unwrap().unwrap_err().code(), "login_timeout");
}

#[tokio::test]
async fn denied_access_and_malformed_answers() {
    let server = MockServer::start().await;
    let h = Harness::new();
    let task = h.spawn(spec(&server), Duration::from_secs(10));
    let url = h.auth_url().await;
    let (port, state) = (port_of(&param(&url, "callback_url")), param(&url, "state"));
    hit(port, &format!("/callback?error=access_denied&state={state}"), &format!("localhost:{port}")).await.unwrap();
    assert_eq!(task.await.unwrap().unwrap_err().code(), "login_denied");

    Mock::given(method("POST")).and(path("/api/v1/auth/keys")).respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({ "nokey": true }))).mount(&server).await;
    *h.url.lock().unwrap() = None;
    let task = h.spawn(spec(&server), Duration::from_secs(10));
    let url = h.auth_url().await;
    let (port, state) = (port_of(&param(&url, "callback_url")), param(&url, "state"));
    hit(port, &format!("/callback?code=c&state={state}"), &format!("localhost:{port}")).await.unwrap();
    assert_eq!(task.await.unwrap().unwrap_err().code(), "login_failed");
}

#[tokio::test]
async fn providers_without_a_runnable_flow_are_refused() {
    let server = MockServer::start().await;
    let mut s = spec(&server);
    s.status = LoginStatus::Unverified;
    let h = Harness::new();
    assert_eq!(h.spawn(s, Duration::from_secs(1)).await.unwrap().unwrap_err().code(), "login_unavailable");
}

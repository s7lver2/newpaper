use std::sync::{Arc, Mutex};

use np_ai_proxy::{
    proxy::{AiProxy, ProxyEvent, ProxyRequest},
    ProviderTable,
};
use np_store::secrets::{MemorySecrets, SecretStore};
use wiremock::{matchers::{header, header_exists, method, path}, Mock, MockServer, ResponseTemplate};

fn table(base: &str) -> ProviderTable {
    ProviderTable::from_registry_json(&format!(
        r#"{{"version":1,"providers":[
          {{"id":"openai","baseUrl":"{base}/v1","auth":"bearer","type":"cloud"}},
          {{"id":"ollama","baseUrl":"{base}/local/v1","auth":"none","type":"local"}}]}}"#
    ))
    .unwrap()
}

fn req(url: String) -> ProxyRequest {
    ProxyRequest { request_id: "r1".into(), url, method: "POST".into(), headers: vec![("authorization".into(), "Bearer np-proxied".into()), ("content-type".into(), "application/json".into())], body: Some("{}".into()) }
}

#[tokio::test]
async fn injects_the_stored_key_and_streams_events() {
    let server = MockServer::start().await;
    Mock::given(method("POST")).and(path("/v1/chat/completions")).and(header("authorization", "Bearer sk-real"))
        .respond_with(ResponseTemplate::new(200).insert_header("content-type", "text/event-stream").set_body_string("data: hola\n\n"))
        .mount(&server).await;
    let secrets = Arc::new(MemorySecrets::default());
    secrets.set("ai.openai", "sk-real").unwrap();
    let proxy = AiProxy::new(table(&server.uri()), secrets);
    let events = Arc::new(Mutex::new(Vec::new()));
    let sink = events.clone();
    proxy.execute("openai", req(format!("{}/v1/chat/completions", server.uri())), reqwest::Client::new(), move |e| sink.lock().unwrap().push(e)).await.unwrap();
    let ev = events.lock().unwrap();
    assert!(matches!(ev[0], ProxyEvent::Head { status: 200, .. }));
    assert!(matches!(ev.last().unwrap(), ProxyEvent::End));
    let body: String = ev.iter().filter_map(|e| if let ProxyEvent::Chunk { b64 } = e { Some(b64.clone()) } else { None }).collect();
    use base64::Engine;
    assert_eq!(String::from_utf8(base64::engine::general_purpose::STANDARD.decode(body).unwrap()).unwrap(), "data: hola\n\n");
}

#[tokio::test]
async fn missing_key_and_foreign_urls_fail_without_network() {
    let server = MockServer::start().await;
    let proxy = AiProxy::new(table(&server.uri()), Arc::new(MemorySecrets::default()));
    let events = Arc::new(Mutex::new(Vec::new()));
    let sink = events.clone();
    let err = proxy.execute("openai", req(format!("{}/v1/x", server.uri())), reqwest::Client::new(), move |e| sink.lock().unwrap().push(e)).await.unwrap_err();
    assert_eq!(err.code(), "missing_key");
    assert!(matches!(&events.lock().unwrap()[0], ProxyEvent::Error { code, .. } if code == "missing_key"));
    let err = proxy.execute("openai", req("https://evil.example/v1/x".into()), reqwest::Client::new(), |_| {}).await.unwrap_err();
    assert_eq!(err.code(), "url_not_allowed");
}

#[tokio::test]
async fn local_providers_need_no_key_and_get_no_auth_header() {
    let server = MockServer::start().await;
    Mock::given(method("GET")).and(path("/local/v1/models")).respond_with(ResponseTemplate::new(200).set_body_string("{}")).mount(&server).await;
    Mock::given(header_exists("authorization")).respond_with(ResponseTemplate::new(400)).mount(&server).await;
    let proxy = AiProxy::new(table(&server.uri()), Arc::new(MemorySecrets::default()));
    let r = ProxyRequest { request_id: "r2".into(), url: format!("{}/local/v1/models", server.uri()), method: "GET".into(), headers: vec![("authorization".into(), "Bearer np-proxied".into())], body: None };
    let events = Arc::new(Mutex::new(Vec::new()));
    let sink = events.clone();
    proxy.execute("ollama", r, reqwest::Client::new(), move |e| sink.lock().unwrap().push(e)).await.unwrap();
    assert!(matches!(events.lock().unwrap()[0], ProxyEvent::Head { status: 200, .. }));
}

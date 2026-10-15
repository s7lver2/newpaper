use std::sync::Arc;

use np_ai_proxy::{
    cache::{self, CachedStage},
    login::{LoginRegistry, LoginRun, LOGIN_TIMEOUT},
    proxy::{AiProxy, ProxyEvent, ProxyRequest},
    sources::{fetch_source, is_allowed},
    usage::{self, MonthUsage},
    CustomEndpoint, LoginFlow, LoginSpec, LoginStatus,
};
use np_shell::extensions::{HttpPurpose, ShellExtensions};
use np_store::{secrets::SecretStore, Store};
use serde::Serialize;
use tauri::{ipc::Channel, State};

use super::{ollama_models, openai_models, AiConfig};
use crate::{
    error::{CmdError, CmdResult},
    sources::content_locale,
};

fn pe(e: np_ai_proxy::ProxyError) -> CmdError {
    CmdError::new(e.code(), e.to_string())
}

/// Sin redirecciones: el proxy de IA añade claves y las fuentes se revalidan en cada salto.
fn client(ext: &ShellExtensions, p: HttpPurpose) -> CmdResult<reqwest::Client> {
    ext.http_client_strict(p).map_err(|e| CmdError::new("network", e))
}

#[tauri::command]
pub async fn ai_fetch(
    proxy: State<'_, Arc<AiProxy>>,
    ext: State<'_, Arc<ShellExtensions>>,
    provider: String,
    request: ProxyRequest,
    on_event: Channel<ProxyEvent>,
) -> CmdResult<()> {
    let c = client(&ext, HttpPurpose::Ai)?;
    // Los errores ya viajan como `ProxyEvent::Error` por el canal; el comando termina bien.
    // Si la webview cierra el canal, la descarga se corta (no se sigue consumiendo red y memoria).
    let _ = proxy.execute_live(&provider, request, c, move |e| on_event.send(e).is_ok()).await;
    Ok(())
}

#[tauri::command]
pub async fn ai_cancel(proxy: State<'_, Arc<AiProxy>>, request_id: String) -> CmdResult<bool> {
    Ok(proxy.cancel(&request_id))
}

#[tauri::command]
pub async fn ai_set_endpoints(proxy: State<'_, Arc<AiProxy>>, store: State<'_, Arc<Store>>, endpoints: Vec<CustomEndpoint>) -> CmdResult<()> {
    proxy.set_custom(&endpoints).map_err(pe)?;
    store.set_setting("ai.customEndpoints", &endpoints)?;
    Ok(())
}

#[tauri::command]
pub async fn source_fetch(
    cfg: State<'_, Arc<AiConfig>>,
    store: State<'_, Arc<Store>>,
    ext: State<'_, Arc<ShellExtensions>>,
    url: String,
    allow_extra: Vec<String>,
) -> CmdResult<String> {
    let lang = content_locale(&store);
    let wl = cfg.primary_sources.read().expect("lock").get(&lang).cloned().unwrap_or_default();
    if !is_allowed(&url, &wl, &allow_extra) {
        return Err(CmdError::new("source_not_allowed", url));
    }
    fetch_source(&client(&ext, HttpPurpose::Content)?, &url, |u| is_allowed(u, &wl, &allow_extra)).await.map_err(pe)
}

#[tauri::command]
pub async fn analysis_cache_get(store: State<'_, Arc<Store>>, url: String, text_hash: String, stage: String) -> CmdResult<Option<CachedStage>> {
    Ok(cache::get(&store, &url, &text_hash, &stage, chrono::Utc::now().timestamp_millis())?)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn analysis_cache_put(store: State<'_, Arc<Store>>, url: String, text_hash: String, stage: String, json: String, model: Option<String>, cost: f64) -> CmdResult<()> {
    Ok(cache::put(&store, &url, &text_hash, &stage, &json, model.as_deref(), cost, chrono::Utc::now().timestamp_millis())?)
}

fn month_now() -> String {
    chrono::Utc::now().format("%Y-%m").to_string()
}

#[tauri::command]
pub async fn usage_record(store: State<'_, Arc<Store>>, provider: String, model: String, input_tokens: i64, output_tokens: i64, cost: f64) -> CmdResult<()> {
    Ok(usage::record(&store, &month_now(), &provider, &model, input_tokens, output_tokens, cost)?)
}

#[tauri::command]
pub async fn usage_month(store: State<'_, Arc<Store>>, month: Option<String>) -> CmdResult<MonthUsage> {
    Ok(usage::month_total(&store, &month.unwrap_or_else(month_now))?)
}

#[derive(Serialize)]
pub struct LocalProbe {
    pub ollama: Option<Vec<String>>,
    pub lmstudio: Option<Vec<String>>,
}

/// Detecta Ollama y LM Studio en `localhost` (§6.1.1 "aparecen como Detectado").
#[tauri::command]
pub async fn ai_local_probe() -> CmdResult<LocalProbe> {
    let c = reqwest::Client::builder().no_proxy().timeout(std::time::Duration::from_millis(800)).build().map_err(|e| CmdError::new("network", e.to_string()))?;
    let get = |url: &'static str| {
        let c = c.clone();
        async move { c.get(url).send().await.ok()?.text().await.ok() }
    };
    let (o, l) = tokio::join!(get("http://127.0.0.1:11434/api/tags"), get("http://127.0.0.1:1234/v1/models"));
    Ok(LocalProbe { ollama: o.as_deref().and_then(ollama_models), lmstudio: l.as_deref().and_then(openai_models) })
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
pub enum LoginEvent {
    /// Dirección de autorización del proveedor; `opened` dice si ya se abrió en el navegador del sistema.
    Url { url: String, opened: bool },
}

/// Solo en compilaciones de desarrollo: `NP_TEST_OAUTH=http://127.0.0.1:<puerto>` sustituye al proveedor por un
/// servidor local falso, guarda la clave con otro nombre (`ai.oauthtest`) y no abre ningún navegador.
fn test_oauth() -> Option<(LoginSpec, reqwest::Client)> {
    if !cfg!(debug_assertions) {
        return None;
    }
    let base = url::Url::parse(&std::env::var("NP_TEST_OAUTH").ok()?).ok()?;
    if base.scheme() != "http" || !matches!(base.host_str(), Some("127.0.0.1" | "localhost")) {
        return None;
    }
    let spec = LoginSpec { flow: LoginFlow::PkceKey, status: LoginStatus::Available, auth_url: base.join("/auth").ok(), exchange_url: base.join("/api/v1/auth/keys").ok() };
    let client = reqwest::Client::builder().no_proxy().redirect(reqwest::redirect::Policy::none()).build().ok()?;
    Some((spec, client))
}

/// Abre una dirección https en el navegador predeterminado del sistema sin pasar por ningún intérprete de comandos.
fn open_system_browser(url: &url::Url) -> bool {
    if url.scheme() != "https" {
        return false;
    }
    let u = url.as_str();
    #[cfg(windows)]
    let mut cmd = {
        use std::os::windows::process::CommandExt;
        let mut c = std::process::Command::new("rundll32.exe");
        c.args(["url.dll,FileProtocolHandler", u]).creation_flags(0x0800_0000);
        c
    };
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = std::process::Command::new("open");
        c.arg(u);
        c
    };
    #[cfg(all(not(windows), not(target_os = "macos")))]
    let mut cmd = {
        let mut c = std::process::Command::new("xdg-open");
        c.arg(u);
        c
    };
    cmd.spawn().is_ok()
}

/// "Iniciar sesión con <proveedor>": abre la página del proveedor, espera la aprobación y guarda la clave en el
/// llavero (`ai.<id>`). Ni la clave ni el verificador PKCE salen de Rust.
#[tauri::command]
pub async fn ai_login(
    proxy: State<'_, Arc<AiProxy>>,
    logins: State<'_, Arc<LoginRegistry>>,
    secrets: State<'_, Arc<dyn SecretStore>>,
    ext: State<'_, Arc<ShellExtensions>>,
    provider: String,
    on_event: Channel<LoginEvent>,
) -> CmdResult<()> {
    let test = test_oauth().filter(|_| provider == "openrouter");
    let (spec, client, secret_id) = match test {
        Some((spec, client)) => (spec, client, "ai.oauthtest".to_string()),
        None => {
            let spec = proxy.spec(&provider).and_then(|s| s.login).ok_or_else(|| pe(np_ai_proxy::ProxyError::LoginUnavailable(provider.clone())))?;
            (spec, client(&ext, HttpPurpose::Ai)?, np_ai_proxy::proxy::secret_key(&provider))
        }
    };
    let is_test = secret_id == "ai.oauthtest";
    let run = LoginRun { provider: &provider, spec: &spec, secret_id, client, secrets: secrets.inner().as_ref(), timeout: LOGIN_TIMEOUT };
    logins
        .run(run, |url| {
            let opened = !is_test && open_system_browser(url);
            let _ = on_event.send(LoginEvent::Url { url: url.to_string(), opened });
        })
        .await
        .map_err(pe)
}

#[tauri::command]
pub async fn ai_login_cancel(logins: State<'_, Arc<LoginRegistry>>, provider: String) -> CmdResult<bool> {
    Ok(logins.cancel(&provider))
}

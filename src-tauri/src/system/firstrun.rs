//! Primer arranque: opciones de instalación (§9). Todo efecto de SO (autostart, Tor, Ollama, marcadores)
//! ocurre solo tras una acción explícita del usuario en la pantalla de primer arranque.
use std::{path::PathBuf, sync::Arc, time::Duration};

use futures::StreamExt;
use np_net::NetMode;
use np_store::Store;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_autostart::ManagerExt;

use crate::{
    config::OutletIndex,
    error::{CmdError, CmdResult},
    privacy::settings::MODE_KEY,
};

pub fn setup(_app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

const FIRST_RUN_KEY: &str = "device.firstRunDone";

/// Navegadores cuyos marcadores se pueden importar (solo perfil `Default`).
const BROWSERS: &[&str] = &["edge", "chrome", "brave"];

fn bookmarks_file(browser: &str) -> Option<PathBuf> {
    let base = PathBuf::from(std::env::var_os("LOCALAPPDATA")?);
    let rel = match browser {
        "edge" => "Microsoft/Edge/User Data/Default/Bookmarks",
        "chrome" => "Google/Chrome/User Data/Default/Bookmarks",
        "brave" => "BraveSoftware/Brave-Browser/User Data/Default/Bookmarks",
        _ => return None,
    };
    Some(base.join(rel))
}

async fn ollama_running() -> bool {
    let Ok(c) = reqwest::Client::builder().no_proxy().timeout(Duration::from_millis(800)).build() else { return false };
    c.get("http://127.0.0.1:11434/api/tags").send().await.is_ok_and(|r| r.status().is_success())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FirstRunStatus {
    pub done: bool,
    pub browsers: Vec<String>,
    pub ollama: bool,
    pub autostart: bool,
}

#[tauri::command]
pub async fn first_run_status(app: AppHandle, store: State<'_, Arc<Store>>) -> CmdResult<FirstRunStatus> {
    Ok(FirstRunStatus {
        done: store.get_setting::<bool>(FIRST_RUN_KEY)?.unwrap_or(false),
        browsers: BROWSERS.iter().filter(|b| bookmarks_file(b).is_some_and(|p| p.exists())).map(|b| b.to_string()).collect(),
        ollama: ollama_running().await,
        autostart: app.autolaunch().is_enabled().unwrap_or(false),
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FirstRunOptions {
    pub autostart: bool,
    pub tor: bool,
}

#[tauri::command]
pub async fn first_run_apply(app: AppHandle, store: State<'_, Arc<Store>>, opts: FirstRunOptions) -> CmdResult<()> {
    let al = app.autolaunch();
    let r = if opts.autostart { al.enable() } else { al.disable() };
    r.map_err(|e| CmdError::new("autostart", e.to_string()))?;
    if opts.tor {
        // El subproyecto 2 observa este ajuste y arranca Arti.
        store.set_setting(MODE_KEY, &NetMode::Tor)?;
    }
    store.set_setting(FIRST_RUN_KEY, &true)?;
    Ok(())
}

#[derive(Serialize)]
pub struct Bookmark {
    pub url: String,
    pub title: String,
}

fn walk(node: &serde_json::Value, out: &mut Vec<Bookmark>) {
    match node.get("type").and_then(|t| t.as_str()) {
        Some("url") => {
            if let (Some(url), Some(name)) = (node.get("url").and_then(|v| v.as_str()), node.get("name").and_then(|v| v.as_str())) {
                out.push(Bookmark { url: url.into(), title: name.into() });
            }
        }
        _ => {
            if let Some(children) = node.get("children").and_then(|c| c.as_array()) {
                for c in children {
                    walk(c, out);
                }
            }
        }
    }
}

/// Marcadores de medios conocidos (`OutletIndex`), como máximo 200. Los demás se ignoran y la UI lo dice.
pub fn scan_bookmarks(path: &std::path::Path, domains: &[String]) -> Result<(Vec<Bookmark>, usize), String> {
    let text = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    let mut all = Vec::new();
    if let Some(roots) = json.get("roots").and_then(|r| r.as_object()) {
        for v in roots.values() {
            walk(v, &mut all);
        }
    }
    let total = all.len();
    let is_news = |u: &str| {
        url::Url::parse(u).ok().and_then(|x| x.host_str().map(str::to_ascii_lowercase)).is_some_and(|h| domains.iter().any(|d| h == *d || h.ends_with(&format!(".{d}"))))
    };
    let news: Vec<Bookmark> = all.into_iter().filter(|b| is_news(&b.url)).take(200).collect();
    let ignored = total - news.len();
    Ok((news, ignored))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BookmarkScan {
    pub bookmarks: Vec<Bookmark>,
    pub ignored: usize,
}

#[tauri::command]
pub async fn bookmarks_scan(outlets: State<'_, Arc<OutletIndex>>, browser: String) -> CmdResult<BookmarkScan> {
    if !BROWSERS.contains(&browser.as_str()) {
        return Err(CmdError::new("bookmarks", "unknown browser"));
    }
    let path = bookmarks_file(&browser).ok_or_else(|| CmdError::new("bookmarks", "no profile path"))?;
    let (bookmarks, ignored) = scan_bookmarks(&path, &outlets.domains()).map_err(|e| CmdError::new("bookmarks", e))?;
    Ok(BookmarkScan { bookmarks, ignored })
}

#[tauri::command]
pub async fn ollama_pull(app: AppHandle, model: String) -> CmdResult<()> {
    let c = reqwest::Client::builder().no_proxy().build().map_err(|e| CmdError::new("ollama", e.to_string()))?;
    let resp = c
        .post("http://127.0.0.1:11434/api/pull")
        .json(&serde_json::json!({ "model": model, "stream": true }))
        .send()
        .await
        .map_err(|e| CmdError::new("ollama", e.to_string()))?
        .error_for_status()
        .map_err(|e| CmdError::new("ollama", e.to_string()))?;
    let mut stream = resp.bytes_stream();
    let mut buf = Vec::new();
    while let Some(chunk) = stream.next().await {
        buf.extend_from_slice(&chunk.map_err(|e| CmdError::new("ollama", e.to_string()))?);
        while let Some(i) = buf.iter().position(|b| *b == b'\n') {
            let line: Vec<u8> = buf.drain(..=i).collect();
            if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&line) {
                let _ = app.emit_to("ui", "ollama://progress", v);
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn open_default_apps() -> CmdResult<()> {
    // Abre la página de Configuración directamente; no usa el shell para no interpretar argumentos.
    std::process::Command::new("explorer.exe").arg("ms-settings:defaultapps").spawn().map_err(|e| CmdError::new("system", e.to_string()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_only_known_outlets_and_counts_the_rest() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("Bookmarks");
        let json = r#"{"roots":{"bookmark_bar":{"type":"folder","children":[
            {"type":"url","name":"A","url":"https://www.elpais.com/x"},
            {"type":"url","name":"B","url":"https://example.org/"},
            {"type":"folder","children":[{"type":"url","name":"C","url":"https://elpais.com/y"}]}
        ]}}}"#;
        std::fs::write(&p, json).unwrap();
        let (news, ignored) = scan_bookmarks(&p, &["elpais.com".to_string()]).unwrap();
        assert_eq!(news.len(), 2);
        assert_eq!(ignored, 1);
    }
}

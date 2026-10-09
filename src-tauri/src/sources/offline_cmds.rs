use std::{path::PathBuf, sync::Arc};

use np_feeds::{
    briefing::{briefing, followed_topics},
    offline::{self, Edition, OfflineHit, OfflineSettings},
    saved::{self, SavedArticle},
    settings::FeedsSettings,
    text::Lang,
};
use np_shell::extensions::{HttpPurpose, ShellExtensions};
use np_store::Store;
use serde::Serialize;
use tauri::{http::{Request, Response, StatusCode}, AppHandle, Manager, State, UriSchemeContext, UriSchemeResponder, Wry};

use super::{content_locale, offline_sched::LAST_BUILT_KEY};
use crate::error::{CmdError, CmdResult};

fn fe(e: np_feeds::FeedsError) -> CmdError {
    CmdError::new("offline", e.to_string())
}

fn offline_dir(app: &AppHandle) -> CmdResult<PathBuf> {
    Ok(app.path().app_local_data_dir().map_err(|e| CmdError::new("io", e.to_string()))?.join("offline"))
}

fn safe_segment(s: &str) -> bool {
    !s.is_empty() && s.len() <= 80 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.' || c == '_') && !s.contains("..")
}

#[tauri::command]
pub async fn saved_add(store: State<'_, Arc<Store>>, article: SavedArticle) -> CmdResult<()> {
    saved::save(&store, &article).map_err(fe)
}

#[tauri::command]
pub async fn saved_remove(store: State<'_, Arc<Store>>, url: String) -> CmdResult<()> {
    saved::remove(&store, &url).map_err(fe)
}

#[tauri::command]
pub async fn saved_list(store: State<'_, Arc<Store>>) -> CmdResult<Vec<SavedArticle>> {
    saved::list(&store).map_err(fe)
}

#[tauri::command]
pub async fn saved_get(store: State<'_, Arc<Store>>, url: String) -> CmdResult<Option<SavedArticle>> {
    saved::get(&store, &url).map_err(fe)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub url: String,
    pub title: String,
    pub outlet: Option<String>,
    pub topic: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BeginResult {
    pub edition_id: String,
    pub candidates: Vec<Candidate>,
    pub summary_json: String,
}

/// Abre una edición y propone los N artículos más cubiertos de los temas seguidos (o de portada si no hay temas).
#[tauri::command]
pub async fn offline_begin(store: State<'_, Arc<Store>>, date: String) -> CmdResult<BeginResult> {
    let settings = OfflineSettings::load(&store).map_err(fe)?;
    let lang = content_locale(&store);
    let now = chrono::Utc::now().timestamp();
    let topics = followed_topics(&store).map_err(fe)?;
    let fs = FeedsSettings::load(&store).map_err(fe)?;
    let cards = store.with_conn(|c| briefing(c, &lang, now, 30, &[], &fs).map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e))))?;
    let candidates: Vec<Candidate> = store.with_conn(|c| {
        let mut st = c.prepare(
            "SELECT a.url, a.title, o.name, a.topic, (SELECT count(DISTINCT a2.outlet_id) FROM event_articles e2 JOIN articles a2 ON a2.id = e2.article_id WHERE e2.event_id = ea.event_id) AS n
             FROM articles a JOIN event_articles ea ON ea.article_id = a.id LEFT JOIN outlets o ON o.id = a.outlet_id
             WHERE a.language = ?1 AND a.published_at >= ?2 GROUP BY ea.event_id ORDER BY n DESC, a.published_at DESC",
        )?;
        let rows = st.query_map(rusqlite::params![lang, now - 24 * 3600], |r| Ok(Candidate { url: r.get(0)?, title: r.get(1)?, outlet: r.get(2)?, topic: r.get(3)? }))?;
        rows.collect()
    })?;
    let mut picked: Vec<Candidate> = candidates.into_iter().filter(|c| topics.is_empty() || c.topic.as_ref().is_some_and(|t| topics.contains(t))).collect();
    picked.truncate(settings.articles);
    let edition_id = offline::begin(&store, &date, now).map_err(fe)?;
    Ok(BeginResult { edition_id, candidates: picked, summary_json: serde_json::to_string(&cards).unwrap_or_default() })
}

#[tauri::command]
pub async fn offline_fetch_html(ext: State<'_, Arc<ShellExtensions>>, url: String) -> CmdResult<String> {
    let client = ext.http_client(HttpPurpose::Content).map_err(|e| CmdError::new("network", e))?;
    let resp = client.get(&url).send().await.map_err(|e| CmdError::new("network", e.to_string()))?;
    if !resp.status().is_success() {
        return Err(CmdError::new("http", resp.status().to_string()));
    }
    resp.text().await.map_err(|e| CmdError::new("network", e.to_string()))
}

#[tauri::command]
pub async fn offline_save_image(app: AppHandle, store: State<'_, Arc<Store>>, edition_id: String, name: String, data_base64: String) -> CmdResult<String> {
    use base64::Engine;
    if !safe_segment(&edition_id) || !safe_segment(&name) {
        return Err(CmdError::new("offline", "invalid name"));
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(data_base64).map_err(|e| CmdError::new("offline", e.to_string()))?;
    if bytes.len() > 2 * 1024 * 1024 {
        return Err(CmdError::new("offline", "image too large"));
    }
    let dir = offline_dir(&app)?.join(&edition_id);
    std::fs::create_dir_all(&dir).map_err(|e| CmdError::new("io", e.to_string()))?;
    std::fs::write(dir.join(&name), &bytes).map_err(|e| CmdError::new("io", e.to_string()))?;
    offline::add_bytes(&store, &edition_id, bytes.len() as i64).map_err(fe)?;
    Ok(format!("{edition_id}/{name}"))
}

#[tauri::command]
pub async fn offline_add_article(
    store: State<'_, Arc<Store>>,
    edition_id: String,
    url: String,
    title: String,
    outlet: Option<String>,
    article_json: String,
    analysis_json: Option<String>,
) -> CmdResult<()> {
    offline::add_article(&store, &edition_id, &url, &title, outlet.as_deref(), &article_json, analysis_json.as_deref()).map_err(fe)
}

#[tauri::command]
pub async fn offline_finish(app: AppHandle, store: State<'_, Arc<Store>>, edition_id: String, summary_json: String, date: String) -> CmdResult<Vec<String>> {
    offline::finish(&store, &edition_id, &summary_json).map_err(fe)?;
    store.set_setting(LAST_BUILT_KEY, &date)?;
    offline_cleanup(app, store).await
}

#[tauri::command]
pub async fn offline_editions(store: State<'_, Arc<Store>>) -> CmdResult<Vec<Edition>> {
    offline::editions(&store).map_err(fe)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OfflineArticle {
    pub url: String,
    pub title: String,
    pub outlet: Option<String>,
    pub article_json: String,
    pub analysis_json: Option<String>,
}

#[tauri::command]
pub async fn offline_edition(store: State<'_, Arc<Store>>, id: String) -> CmdResult<Vec<OfflineArticle>> {
    Ok(offline::edition_articles(&store, &id)
        .map_err(fe)?
        .into_iter()
        .map(|(url, title, outlet, article_json, analysis_json)| OfflineArticle { url, title, outlet, article_json, analysis_json })
        .collect())
}

#[tauri::command]
pub async fn offline_search(store: State<'_, Arc<Store>>, query: String) -> CmdResult<Vec<OfflineHit>> {
    offline::search(&store, &query, Lang::from_code(&content_locale(&store))).map_err(fe)
}

#[tauri::command]
pub async fn offline_cleanup(app: AppHandle, store: State<'_, Arc<Store>>) -> CmdResult<Vec<String>> {
    let s = OfflineSettings::load(&store).map_err(fe)?;
    let removed = offline::cleanup(&store, chrono::Utc::now().timestamp(), (s.max_mb as i64) * 1024 * 1024, s.expiry_days).map_err(fe)?;
    let dir = offline_dir(&app)?;
    for id in &removed {
        let _ = std::fs::remove_dir_all(dir.join(id));
    }
    Ok(removed)
}

/// `http://npoffline.localhost/<editionId>/<fichero>` → `<app_local_data>/offline/<editionId>/<fichero>` (solo webview `ui`).
pub fn protocol(ctx: UriSchemeContext<'_, Wry>, request: Request<Vec<u8>>, responder: UriSchemeResponder) {
    let empty = |code: StatusCode| Response::builder().status(code).body(Vec::new()).expect("response");
    if ctx.webview_label() != "ui" {
        return responder.respond(empty(StatusCode::FORBIDDEN));
    }
    let path = percent_encoding::percent_decode_str(request.uri().path().trim_start_matches('/')).decode_utf8_lossy().to_string();
    let mut parts = path.splitn(2, '/');
    let (Some(ed), Some(file)) = (parts.next(), parts.next()) else { return responder.respond(empty(StatusCode::BAD_REQUEST)) };
    if !safe_segment(ed) || !safe_segment(file) {
        return responder.respond(empty(StatusCode::BAD_REQUEST));
    }
    let Ok(dir) = ctx.app_handle().path().app_local_data_dir() else { return responder.respond(empty(StatusCode::INTERNAL_SERVER_ERROR)) };
    match std::fs::read(dir.join("offline").join(ed).join(file)) {
        Ok(bytes) => responder.respond(Response::builder().status(200).header("Content-Type", "image/webp").body(bytes).expect("response")),
        Err(_) => responder.respond(empty(StatusCode::NOT_FOUND)),
    }
}

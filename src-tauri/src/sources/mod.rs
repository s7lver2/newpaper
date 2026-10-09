//! Subproyecto 3: fuentes, hechos, línea editorial, hemeroteca y lectura sin conexión.
pub mod commands;

use std::{collections::HashMap, sync::{Arc, RwLock}, time::Duration};

use np_feeds::{
    config::Sources,
    custom::{as_sources, list_custom},
    ingest::ingest,
    priors::OutletPriors,
    repo::sync_sources,
    search::Endpoints,
    settings::FeedsSettings,
    stats::recompute_stats,
    text::Lang,
    topics::Topics,
    watches::check_watches,
};
use np_lexicon::schema::Lexicon;
use np_shell::extensions::{HttpPurpose, ShellExtensions};
use np_store::Store;
use tauri::{App, AppHandle, Emitter, Manager};
use tokio::sync::Notify;

use crate::config::{read_config_text, CONTENT_LOCALES};

pub struct SourcesState {
    pub sources: RwLock<Sources>,
    pub topics: RwLock<HashMap<String, Topics>>,
    pub priors: RwLock<OutletPriors>,
    pub lexicons: RwLock<HashMap<String, Lexicon>>,
    pub endpoints: Endpoints,
    /// Despierta el bucle de descarga (cambio de idioma de contenidos o "actualizar ahora").
    pub kick: Notify,
}

pub fn content_locale(store: &Store) -> String {
    let valid = |v: Option<String>| v.filter(|l| CONTENT_LOCALES.contains(&l.as_str()));
    valid(store.get_setting::<String>("content.locale").ok().flatten())
        .or_else(|| valid(store.get_setting::<String>("general.locale").ok().flatten()))
        .unwrap_or_else(|| "es".into())
}

/// Título sin el sufijo " | Medio" o " - Medio" para la búsqueda de respaldo.
pub fn search_query(title: &str) -> String {
    let t = title.split(" | ").next().unwrap_or(title);
    t.rsplit_once(" - ").map(|(a, _)| a).unwrap_or(t).trim().to_string()
}

fn load_all(app: &AppHandle, store: &Store) -> Result<(Sources, HashMap<String, Topics>, OutletPriors, HashMap<String, Lexicon>), Box<dyn std::error::Error>> {
    let mut files = Vec::new();
    let mut topics = HashMap::new();
    let mut lexicons = HashMap::new();
    for l in CONTENT_LOCALES {
        if let Ok(text) = read_config_text(app, &format!("sources-{l}.json")) {
            files.push(Sources::from_json(&text)?);
        }
        if let Ok(text) = read_config_text(app, &format!("topics-{l}.json")) {
            topics.insert(l.to_string(), Topics::from_json(&text, Lang::from_code(l))?);
        }
        if let Ok(text) = read_config_text(app, &format!("lexicon-{l}.json")) {
            lexicons.insert(l.to_string(), serde_json::from_str::<Lexicon>(&text)?);
        }
    }
    files.push(as_sources(&list_custom(store)?));
    let priors = read_config_text(app, "outlet-priors.json").ok().map(|t| OutletPriors::from_json(&t)).transpose()?.unwrap_or_else(OutletPriors::empty);
    Ok((Sources::merge(&files), topics, priors, lexicons))
}

/// Vuelve a leer configuración y fuentes personalizadas y las vuelca en SQLite.
pub fn reload(app: &AppHandle, store: &Store, state: &SourcesState) -> Result<(), Box<dyn std::error::Error>> {
    let (sources, topics, priors, lexicons) = load_all(app, store)?;
    store.with_tx(|tx| sync_sources(tx, &sources).map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e))))?;
    *state.sources.write().expect("lock") = sources;
    *state.topics.write().expect("lock") = topics;
    *state.priors.write().expect("lock") = priors;
    *state.lexicons.write().expect("lock") = lexicons;
    Ok(())
}

pub async fn run_ingest(app: &AppHandle) -> Option<np_feeds::ingest::IngestReport> {
    let store = app.state::<Arc<Store>>().inner().clone();
    let ext = app.state::<Arc<ShellExtensions>>().inner().clone();
    let state = app.state::<Arc<SourcesState>>().inner().clone();
    let client = match ext.http_client(HttpPurpose::Feeds) {
        Ok(c) => c,
        Err(e) => {
            tracing::info!(error = %e, "feeds skipped: network not available");
            return None;
        }
    };
    let lang = content_locale(&store);
    let settings = FeedsSettings::load(&store).unwrap_or_default();
    let topics = state.topics.read().expect("lock").get(&lang).cloned();
    let now = chrono::Utc::now().timestamp();
    match ingest(&store, &client, &lang, topics.as_ref(), &settings, now).await {
        Ok(report) => {
            let _ = app.emit_to("ui", "feeds://updated", &report);
            if let Ok(done) = check_watches(&store, settings.min_coverages, now) {
                for w in done {
                    let _ = app.emit_to("ui", "feeds://watch-fulfilled", &w);
                }
            }
            Some(report)
        }
        Err(e) => {
            tracing::warn!(error = %e, "ingest failed");
            None
        }
    }
}

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let store = app.state::<Arc<Store>>().inner().clone();
    let state = Arc::new(SourcesState {
        sources: RwLock::new(Sources { version: 1, outlets: vec![] }),
        topics: RwLock::default(),
        priors: RwLock::new(OutletPriors::empty()),
        lexicons: RwLock::default(),
        endpoints: Endpoints::default(),
        kick: Notify::new(),
    });
    reload(app.handle(), &store, &state)?;
    app.manage(state.clone());

    let kicker = state.clone();
    store.on_setting_change("content.locale", move |_, _| kicker.kick.notify_one());

    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(15)).await;
        loop {
            run_ingest(&handle).await;
            let minutes = FeedsSettings::load(&handle.state::<Arc<Store>>()).unwrap_or_default().fetch_interval_minutes.max(5);
            let st = handle.state::<Arc<SourcesState>>().inner().clone();
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(minutes * 60)) => {}
                _ = st.kick.notified() => {}
            }
        }
    });

    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        loop {
            let store = handle.state::<Arc<Store>>().inner().clone();
            let days = FeedsSettings::load(&store).unwrap_or_default().lean_window_days;
            let now_ms = chrono::Utc::now().timestamp_millis();
            if let Err(e) = store.with_conn(|c| recompute_stats(c, now_ms, days).map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))) {
                tracing::warn!(error = %e, "outlet stats recompute failed");
            }
            tokio::time::sleep(Duration::from_secs(24 * 3600)).await;
        }
    });

    Ok(())
}

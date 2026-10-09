use std::sync::Arc;

use np_feeds::{
    briefing::{briefing, event_detail as detail, events_search as search_events, set_following, topics_state, EventCard, EventDetail, TopicState},
    coverage::{coverage_for_event, find_event, Coverage},
    custom::{add_custom, list_custom, remove_custom, CustomOutlet},
    events::{cluster_window, event_outlet_count},
    ingest::IngestReport,
    repo::{insert_articles, NewArticle},
    search::{backup_search, Provider},
    settings::FeedsSettings,
    stats::{outlet_leans, recompute_stats, set_override, OutletLean},
    text::Lang,
    watches::{add_watch, list_watches, Watch},
};
use np_lexicon::score::{score_text, LexStatus, LexiconScore};
use np_shell::extensions::{HttpPurpose, ShellExtensions};
use np_store::{secrets::SecretStore, Store};
use serde::Serialize;
use tauri::{AppHandle, State};

use super::{content_locale, reload, run_ingest, search_query, SourcesState};
use crate::error::{CmdError, CmdResult};

type S<'a> = State<'a, Arc<SourcesState>>;
type St<'a> = State<'a, Arc<Store>>;

fn fe(e: np_feeds::FeedsError) -> CmdError {
    CmdError::new("feeds", e.to_string())
}

fn sql<E: std::error::Error + Send + Sync + 'static>(e: E) -> rusqlite::Error {
    rusqlite::Error::ToSqlConversionFailure(Box::new(e))
}

fn now() -> i64 {
    chrono::Utc::now().timestamp()
}

fn leans(store: &Store, state: &SourcesState) -> CmdResult<Vec<OutletLean>> {
    let settings = FeedsSettings::load(store).map_err(fe)?;
    outlet_leans(store, &state.priors.read().expect("lock"), settings.prior_default_sd).map_err(fe)
}

#[tauri::command]
pub async fn feeds_refresh_now(app: AppHandle) -> CmdResult<IngestReport> {
    run_ingest(&app).await.ok_or_else(|| CmdError::new("feeds_unavailable", "network not available or ingest failed"))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverageResult {
    pub event_id: Option<i64>,
    pub coverages: Vec<Coverage>,
    pub outlet_count: usize,
    pub searched: bool,
    pub search_skipped: Option<&'static str>,
    pub enough: bool,
}

#[tauri::command]
pub async fn coverage_for(
    store: St<'_>,
    state: S<'_>,
    ext: State<'_, Arc<ShellExtensions>>,
    secrets: State<'_, Arc<dyn SecretStore>>,
    url: String,
    title: String,
    excerpt: Option<String>,
) -> CmdResult<CoverageResult> {
    let lang = content_locale(&store);
    let settings = FeedsSettings::load(&store).map_err(fe)?;
    let excerpt = excerpt.unwrap_or_default();
    let t = now();
    // El propio artículo entra en el índice (origen "visited") si es de un medio conocido.
    let outlet = state.sources.read().expect("lock").outlet_for_url(&url).cloned();
    if let Some(o) = outlet {
        let item = NewArticle { url: url.clone(), outlet_id: Some(o.id), title: title.clone(), summary: excerpt.chars().take(1000).collect(), language: o.language, published_at: t, origin: "visited".into(), topic: None };
        store.with_tx(|tx| {
            insert_articles(tx, &[item], t).map_err(sql)?;
            cluster_window(tx, &lang, t, settings.window_hours, settings.cluster_threshold).map_err(sql)
        })?;
    }
    let find = |store: &Store| store.with_conn(|c| find_event(c, &lang, &url, &title, &excerpt, t, &settings).map_err(sql));
    let mut event = find(&store)?;
    let count = |store: &Store, ev: Option<i64>| -> CmdResult<usize> {
        Ok(match ev {
            Some(e) => store.with_conn(|c| event_outlet_count(c, e).map_err(sql))?,
            None => 0,
        })
    };
    let (mut searched, mut skipped) = (false, None);
    if count(&store, event)? < settings.min_coverages {
        let provider = Provider::from_id(&settings.search_provider).unwrap_or(Provider::Brave);
        match secrets.get(provider.secret_key())? {
            None => skipped = Some("no_key"),
            Some(key) => match ext.http_client(HttpPurpose::Search) {
                Err(_) => skipped = Some("network"),
                Ok(client) => {
                    let sources = state.sources.read().expect("lock").clone();
                    backup_search(&store, &client, provider, &state.endpoints, &key, &search_query(&title), &sources, &lang, &settings, t).await.map_err(fe)?;
                    searched = true;
                    event = find(&store)?;
                }
            },
        }
    }
    let leans = leans(&store, &state)?;
    let (coverages, outlet_count) = match event {
        Some(e) => store.with_conn(|c| coverage_for_event(c, e, Some(&url), &leans, &settings).map_err(sql))?,
        None => (vec![], 0),
    };
    Ok(CoverageResult { event_id: event, enough: outlet_count >= settings.min_coverages, coverages, outlet_count, searched, search_skipped: skipped })
}

#[tauri::command]
pub async fn events_briefing(store: St<'_>, state: S<'_>, limit: Option<usize>) -> CmdResult<Vec<EventCard>> {
    let lang = content_locale(&store);
    let leans = leans(&store, &state)?;
    let s = FeedsSettings::load(&store).map_err(fe)?;
    Ok(store.with_conn(|c| briefing(c, &lang, now(), limit.unwrap_or(12), &leans, &s).map_err(sql))?)
}

#[tauri::command]
pub async fn events_search(store: St<'_>, query: String) -> CmdResult<Vec<EventCard>> {
    let lang = Lang::from_code(&content_locale(&store));
    Ok(store.with_conn(|c| search_events(c, &query, lang, 20).map_err(sql))?)
}

#[tauri::command]
pub async fn event_detail(store: St<'_>, state: S<'_>, event_id: i64) -> CmdResult<Option<EventDetail>> {
    let leans = leans(&store, &state)?;
    let s = FeedsSettings::load(&store).map_err(fe)?;
    Ok(store.with_conn(|c| detail(c, event_id, &leans, &s).map_err(sql))?)
}

#[tauri::command]
pub async fn outlets_list(store: St<'_>, state: S<'_>) -> CmdResult<Vec<OutletLean>> {
    leans(&store, &state)
}

#[tauri::command]
pub async fn outlet_override_set(store: St<'_>, state: S<'_>, outlet_id: String, lean: Option<f64>, note: Option<String>) -> CmdResult<Vec<OutletLean>> {
    set_override(&store, &outlet_id, lean, note).map_err(fe)?;
    leans(&store, &state)
}

#[tauri::command]
pub async fn outlet_stats_recompute(store: St<'_>) -> CmdResult<usize> {
    let days = FeedsSettings::load(&store).map_err(fe)?.lean_window_days;
    Ok(store.with_conn(|c| recompute_stats(c, chrono::Utc::now().timestamp_millis(), days).map_err(sql))?)
}

#[tauri::command]
pub async fn custom_outlets_list(store: St<'_>) -> CmdResult<Vec<CustomOutlet>> {
    list_custom(&store).map_err(fe)
}

#[tauri::command]
pub async fn custom_outlet_add(app: AppHandle, store: St<'_>, state: S<'_>, outlet: CustomOutlet) -> CmdResult<Vec<CustomOutlet>> {
    add_custom(&store, &outlet).map_err(fe)?;
    reload(&app, &store, &state).map_err(|e| CmdError::new("config", e.to_string()))?;
    list_custom(&store).map_err(fe)
}

#[tauri::command]
pub async fn custom_outlet_remove(app: AppHandle, store: St<'_>, state: S<'_>, domain: String) -> CmdResult<Vec<CustomOutlet>> {
    remove_custom(&store, &domain).map_err(fe)?;
    reload(&app, &store, &state).map_err(|e| CmdError::new("config", e.to_string()))?;
    list_custom(&store).map_err(fe)
}

#[tauri::command]
pub async fn topics_list(store: St<'_>, state: S<'_>) -> CmdResult<Vec<TopicState>> {
    let lang = content_locale(&store);
    let topics = state.topics.read().expect("lock").get(&lang).cloned();
    match topics {
        Some(t) => topics_state(&store, &t, now()).map_err(fe),
        None => Ok(vec![]),
    }
}

#[tauri::command]
pub async fn topic_set_following(store: St<'_>, state: S<'_>, topic_id: String, following: bool) -> CmdResult<Vec<TopicState>> {
    set_following(&store, &topic_id, following).map_err(fe)?;
    topics_list(store, state).await
}

#[tauri::command]
pub async fn watch_add(store: St<'_>, article_url: Option<String>, query: Option<String>, event_id: Option<i64>) -> CmdResult<String> {
    add_watch(&store, article_url.as_deref(), query.as_deref(), event_id, now()).map_err(fe)
}

#[tauri::command]
pub async fn watches_list(store: St<'_>) -> CmdResult<Vec<Watch>> {
    list_watches(&store).map_err(fe)
}

#[tauri::command]
pub async fn lexicon_score(state: S<'_>, text: String, locale: String) -> CmdResult<LexiconScore> {
    let lex = state.lexicons.read().expect("lock").get(&locale).cloned();
    Ok(match lex {
        Some(l) => score_text(&text, &l),
        None => LexiconScore { status: LexStatus::Unavailable, value: None, confidence: 0.0, matches: vec![] },
    })
}

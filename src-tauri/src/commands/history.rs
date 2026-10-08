//! Comandos de historial y sugerencias de la barra de direcciones (spec §16).
use std::sync::Arc;

use np_shell::{input::{is_internal, parse_input, search_url, Target}, TabId, TabManager};
use np_store::{
    history::{DeleteScope, HistoryEntry, HistoryFilter, HistoryRepo, SearchSource},
    Store,
};
use serde::Serialize;
use tauri::State;

use crate::{config::{OutletIndex, OutletRef}, error::CmdResult};

pub const MAX_SUGGESTIONS: usize = 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SuggestionKind {
    Go,
    Search,
    History,
    Outlet,
    Recent,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Suggestion {
    pub kind: SuggestionKind,
    pub label: String,
    /// Texto que se pasa a `tab_navigate`.
    pub value: String,
    pub detail: Option<String>,
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub fn record_visit_impl(store: &Store, private: bool, url: &str, title: &str, at: i64) -> CmdResult<Option<String>> {
    if private || is_internal(url) || !(url.starts_with("http://") || url.starts_with("https://")) {
        return Ok(None);
    }
    Ok(HistoryRepo::new(store).record_visit(url, title, at)?)
}

pub fn build_suggestions(input: &str, visits: Vec<HistoryEntry>, recent: Vec<String>, outlets: &[&OutletRef]) -> Vec<Suggestion> {
    let mut out: Vec<Suggestion> = Vec::new();
    match parse_input(input) {
        Some(Target::Web(u)) => out.push(Suggestion { kind: SuggestionKind::Go, label: u.to_string(), value: u.to_string(), detail: None }),
        Some(Target::Internal(s)) => out.push(Suggestion { kind: SuggestionKind::Go, label: s.clone(), value: s, detail: None }),
        Some(Target::Search(q)) => out.push(Suggestion { kind: SuggestionKind::Search, label: q.clone(), value: search_url(&q), detail: None }),
        None => return out,
    }
    let mut seen: Vec<String> = out.iter().map(|s| s.value.clone()).collect();
    let mut push = |s: Suggestion, out: &mut Vec<Suggestion>| {
        if out.len() < MAX_SUGGESTIONS && !seen.contains(&s.value) {
            seen.push(s.value.clone());
            out.push(s);
        }
    };
    for v in visits.into_iter().take(4) {
        let Some(url) = v.url else { continue };
        push(Suggestion { kind: SuggestionKind::History, label: v.title.unwrap_or_else(|| url.clone()), value: url.clone(), detail: Some(url) }, &mut out);
    }
    for o in outlets.iter().take(2) {
        push(Suggestion { kind: SuggestionKind::Outlet, label: o.name.clone(), value: format!("https://{}/", o.domain), detail: Some(o.domain.clone()) }, &mut out);
    }
    let needle = input.trim().to_lowercase();
    for q in recent.into_iter().filter(|q| q.to_lowercase().starts_with(&needle) && q.to_lowercase() != needle).take(3) {
        push(Suggestion { kind: SuggestionKind::Recent, label: q.clone(), value: search_url(&q), detail: None }, &mut out);
    }
    out
}

#[tauri::command]
pub async fn history_record_visit(store: State<'_, Arc<Store>>, tabs: State<'_, Arc<TabManager>>, tab_id: TabId, url: String, title: String) -> CmdResult<Option<String>> {
    let private = tabs.tab(tab_id).map(|t| t.private).unwrap_or(true);
    record_visit_impl(&store, private, &url, &title, now_ms())
}

#[tauri::command]
pub async fn history_record_search(store: State<'_, Arc<Store>>, query: String, source: SearchSource) -> CmdResult<Option<String>> {
    Ok(HistoryRepo::new(&store).record_search(&query, source, now_ms())?)
}

#[tauri::command]
pub async fn history_mark_analyzed(store: State<'_, Arc<Store>>, url: String) -> CmdResult<usize> {
    Ok(HistoryRepo::new(&store).mark_analyzed(&url)?)
}

#[tauri::command]
pub async fn history_search(store: State<'_, Arc<Store>>, filter: HistoryFilter) -> CmdResult<Vec<HistoryEntry>> {
    Ok(HistoryRepo::new(&store).search(&filter)?)
}

#[tauri::command]
pub async fn history_delete(store: State<'_, Arc<Store>>, scope: DeleteScope) -> CmdResult<usize> {
    Ok(HistoryRepo::new(&store).delete(&scope)?)
}

#[tauri::command]
pub async fn omnibox_suggest(store: State<'_, Arc<Store>>, outlets: State<'_, Arc<OutletIndex>>, input: String) -> CmdResult<Vec<Suggestion>> {
    let repo = HistoryRepo::new(&store);
    let visits = repo.suggest_visits(&input, 6)?;
    let recent = repo.recent_searches(20)?;
    Ok(build_suggestions(&input, visits, recent, &outlets.matching(&input, 2)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::OutletRef;
    use np_store::{history::{HistoryEntry, HistoryKind}, Store};

    fn visit(url: &str, title: &str) -> HistoryEntry {
        HistoryEntry { id: "x".into(), kind: HistoryKind::Visit, url: Some(url.into()), title: Some(title.into()), outlet: None, query: None, source: None, analyzed: false, at: 0 }
    }

    #[test]
    fn private_tabs_never_record() {
        let s = Store::open_in_memory().unwrap();
        assert_eq!(record_visit_impl(&s, true, "https://a.example/", "A", 1).unwrap(), None);
        assert!(record_visit_impl(&s, false, "https://a.example/", "A", 1).unwrap().is_some());
        assert_eq!(record_visit_impl(&s, false, "newpaper://inicio", "Inicio", 2).unwrap(), None, "internal pages are not visits");
    }

    #[test]
    fn suggestions_start_with_the_direct_action() {
        let outlets = vec![OutletRef { id: "elpais".into(), name: "El País".into(), domain: "elpais.com".into() }];
        let s = build_suggestions("elpais.com", vec![], vec![], &outlets.iter().collect::<Vec<_>>());
        assert_eq!(s[0].kind, SuggestionKind::Go);
        assert_eq!(s[0].value, "https://elpais.com/");
        let s = build_suggestions("subida smi", vec![], vec!["subida smi enero".into()], &[]);
        assert_eq!(s[0].kind, SuggestionKind::Search);
        assert_eq!(s[1].kind, SuggestionKind::Recent);
    }

    #[test]
    fn suggestions_merge_history_outlets_and_recent_without_duplicates() {
        let outlets = vec![OutletRef { id: "elpais".into(), name: "El País".into(), domain: "elpais.com".into() }];
        let visits = vec![visit("https://elpais.com/a", "Presupuestos"), visit("https://elpais.com/a", "Presupuestos")];
        let s = build_suggestions("el", visits, vec!["el indulto".into()], &outlets.iter().collect::<Vec<_>>());
        let kinds: Vec<_> = s.iter().map(|x| x.kind).collect();
        assert_eq!(kinds, vec![SuggestionKind::Search, SuggestionKind::History, SuggestionKind::Outlet, SuggestionKind::Recent]);
        assert_eq!(s[2].value, "https://elpais.com/");
        assert!(s.len() <= MAX_SUGGESTIONS);
    }
}

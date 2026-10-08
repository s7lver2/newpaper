//! Historial de visitas y búsquedas con FTS5, retención y borrado (spec §16).
use rusqlite::{params, params_from_iter, types::Value as SqlValue, OptionalExtension, Row};
use serde::{Deserialize, Serialize};

use crate::{ids::random_id, Store, StoreError};

pub const RETENTION_KEY: &str = "history.retentionDays";
pub const PAUSED_KEY: &str = "history.paused";
pub const DEFAULT_RETENTION_DAYS: u32 = 90;
const DEDUP_WINDOW_MS: i64 = 30 * 60_000;
const TOMBSTONE_TTL_MS: i64 = 30 * 86_400_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HistoryKind {
    Visit,
    Search,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SearchSource {
    Bar,
    Coverage,
    Hemeroteca,
}

impl SearchSource {
    fn as_str(self) -> &'static str {
        match self {
            SearchSource::Bar => "bar",
            SearchSource::Coverage => "coverage",
            SearchSource::Hemeroteca => "hemeroteca",
        }
    }
    fn parse(s: &str) -> Option<Self> {
        match s {
            "bar" => Some(Self::Bar),
            "coverage" => Some(Self::Coverage),
            "hemeroteca" => Some(Self::Hemeroteca),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub kind: HistoryKind,
    pub url: Option<String>,
    pub title: Option<String>,
    pub outlet: Option<String>,
    pub query: Option<String>,
    pub source: Option<SearchSource>,
    pub analyzed: bool,
    pub at: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HistoryFilterKind {
    Visit,
    Search,
    Analysis,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct HistoryFilter {
    pub text: Option<String>,
    pub kind: Option<HistoryFilterKind>,
    pub outlet: Option<String>,
    pub from: Option<i64>,
    pub to: Option<i64>,
    pub limit: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "scope", rename_all = "camelCase")]
pub enum DeleteScope {
    Range { from: i64, to: i64 },
    Outlet { outlet: String },
    All,
    One { id: String },
}

pub fn outlet_of(url: &str) -> Option<String> {
    let u = url::Url::parse(url).ok()?;
    if !matches!(u.scheme(), "http" | "https") {
        return None;
    }
    let host = u.host_str()?;
    Some(host.strip_prefix("www.").unwrap_or(host).to_ascii_lowercase())
}

/// Convierte texto libre en una consulta FTS5 segura: cada palabra entre comillas y con prefijo.
fn fts_query(text: &str) -> Option<String> {
    let terms: Vec<String> = text
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| !t.is_empty())
        .map(|t| format!("\"{}\"*", t.replace('"', "")))
        .collect();
    (!terms.is_empty()).then(|| terms.join(" "))
}

fn row_to_entry(r: &Row<'_>) -> rusqlite::Result<HistoryEntry> {
    let kind: String = r.get("kind")?;
    let source: Option<String> = r.get("source")?;
    Ok(HistoryEntry {
        id: r.get("id")?,
        kind: if kind == "search" { HistoryKind::Search } else { HistoryKind::Visit },
        url: r.get("url")?,
        title: r.get("title")?,
        outlet: r.get("outlet")?,
        query: r.get("query")?,
        source: source.as_deref().and_then(SearchSource::parse),
        analyzed: r.get::<_, i64>("analyzed")? != 0,
        at: r.get("at")?,
    })
}

pub struct HistoryRepo<'a> {
    store: &'a Store,
}

impl<'a> HistoryRepo<'a> {
    pub fn new(store: &'a Store) -> Self {
        Self { store }
    }

    fn paused(&self) -> Result<bool, StoreError> {
        Ok(self.store.get_setting::<bool>(PAUSED_KEY)?.unwrap_or(false))
    }

    pub fn record_visit(&self, url: &str, title: &str, at: i64) -> Result<Option<String>, StoreError> {
        if self.paused()? {
            return Ok(None);
        }
        let stamp = self.store.stamp();
        let outlet = outlet_of(url);
        let title: String = title.chars().take(1000).collect();
        self.store.with_tx(|tx| {
            let recent: Option<String> = tx
                .query_row(
                    "SELECT id FROM history WHERE kind = 'visit' AND deleted = 0 AND url = ?1 AND at >= ?2 ORDER BY at DESC LIMIT 1",
                    params![url, at - DEDUP_WINDOW_MS],
                    |r| r.get(0),
                )
                .optional()?;
            if let Some(id) = recent {
                tx.execute(
                    "UPDATE history SET title = ?2, at = ?3, updated_at = ?4 WHERE id = ?1",
                    params![id, title, at, stamp],
                )?;
                return Ok(Some(id));
            }
            let id = random_id();
            tx.execute(
                "INSERT INTO history(id, kind, url, title, outlet, at, updated_at) VALUES (?1, 'visit', ?2, ?3, ?4, ?5, ?6)",
                params![id, url, title, outlet, at, stamp],
            )?;
            Ok(Some(id))
        })
    }

    pub fn record_search(&self, query: &str, source: SearchSource, at: i64) -> Result<Option<String>, StoreError> {
        let query = query.trim();
        if query.is_empty() || self.paused()? {
            return Ok(None);
        }
        let id = random_id();
        let stamp = self.store.stamp();
        let q: String = query.chars().take(500).collect();
        self.store.with_conn(|c| {
            c.execute(
                "INSERT INTO history(id, kind, query, source, at, updated_at) VALUES (?1, 'search', ?2, ?3, ?4, ?5)",
                params![id, q, source.as_str(), at, stamp],
            )
        })?;
        Ok(Some(id))
    }

    pub fn mark_analyzed(&self, url: &str) -> Result<usize, StoreError> {
        let stamp = self.store.stamp();
        self.store.with_conn(|c| {
            c.execute(
                "UPDATE history SET analyzed = 1, updated_at = ?2 WHERE kind = 'visit' AND deleted = 0 AND url = ?1 AND analyzed = 0",
                params![url, stamp],
            )
        })
    }

    pub fn search(&self, f: &HistoryFilter) -> Result<Vec<HistoryEntry>, StoreError> {
        let mut sql = String::from("SELECT h.* FROM history h WHERE h.deleted = 0");
        let mut args: Vec<SqlValue> = Vec::new();
        if let Some(q) = f.text.as_deref().and_then(fts_query) {
            sql.push_str(" AND h.rowid IN (SELECT rowid FROM history_fts WHERE history_fts MATCH ?)");
            args.push(q.into());
        }
        match f.kind {
            Some(HistoryFilterKind::Visit) => sql.push_str(" AND h.kind = 'visit'"),
            Some(HistoryFilterKind::Search) => sql.push_str(" AND h.kind = 'search'"),
            Some(HistoryFilterKind::Analysis) => sql.push_str(" AND h.kind = 'visit' AND h.analyzed = 1"),
            None => {}
        }
        if let Some(o) = &f.outlet {
            sql.push_str(" AND h.outlet = ?");
            args.push(o.clone().into());
        }
        if let Some(from) = f.from {
            sql.push_str(" AND h.at >= ?");
            args.push(from.into());
        }
        if let Some(to) = f.to {
            sql.push_str(" AND h.at < ?");
            args.push(to.into());
        }
        sql.push_str(" ORDER BY h.at DESC LIMIT ?");
        args.push(i64::from(if f.limit == 0 { 500 } else { f.limit.min(5_000) }).into());
        self.store.with_conn(|c| {
            let mut st = c.prepare(&sql)?;
            let rows = st.query_map(params_from_iter(args.iter()), row_to_entry)?;
            rows.collect()
        })
    }

    pub fn delete(&self, scope: &DeleteScope) -> Result<usize, StoreError> {
        let stamp = self.store.stamp();
        let (cond, args): (&str, Vec<SqlValue>) = match scope {
            DeleteScope::Range { from, to } => ("at >= ? AND at < ?", vec![(*from).into(), (*to).into()]),
            DeleteScope::Outlet { outlet } => ("outlet = ?", vec![outlet.clone().into()]),
            DeleteScope::All => ("1 = 1", vec![]),
            DeleteScope::One { id } => ("id = ?", vec![id.clone().into()]),
        };
        let sql = format!(
            "UPDATE history SET deleted = 1, url = NULL, title = NULL, outlet = NULL, query = NULL, source = NULL, analyzed = 0, updated_at = ? WHERE deleted = 0 AND {cond}"
        );
        let mut all: Vec<SqlValue> = vec![stamp.into()];
        all.extend(args);
        self.store.with_conn(|c| c.execute(&sql, params_from_iter(all.iter())))
    }

    pub fn purge_expired(&self, now_ms: i64) -> Result<usize, StoreError> {
        let days: Option<u32> = match self.store.get_setting::<Option<u32>>(RETENTION_KEY)? {
            None => Some(DEFAULT_RETENTION_DAYS),
            Some(v) => v,
        };
        self.store.with_conn(|c| {
            let mut n = c.execute(
                "DELETE FROM history WHERE deleted = 1 AND at < ?1",
                params![now_ms - TOMBSTONE_TTL_MS],
            )?;
            if let Some(d) = days {
                n += c.execute(
                    "DELETE FROM history WHERE deleted = 0 AND at < ?1",
                    params![now_ms - i64::from(d) * 86_400_000],
                )?;
            }
            Ok(n)
        })
    }

    pub fn recent_searches(&self, limit: u32) -> Result<Vec<String>, StoreError> {
        self.store.with_conn(|c| {
            let mut st = c.prepare(
                "SELECT query FROM history WHERE kind = 'search' AND deleted = 0 GROUP BY query ORDER BY max(at) DESC LIMIT ?1",
            )?;
            let rows = st.query_map([limit], |r| r.get(0))?;
            rows.collect()
        })
    }

    pub fn suggest_visits(&self, prefix: &str, limit: u32) -> Result<Vec<HistoryEntry>, StoreError> {
        let Some(q) = fts_query(prefix) else { return Ok(Vec::new()) };
        self.store.with_conn(|c| {
            let mut st = c.prepare(
                "SELECT h.* FROM history h WHERE h.deleted = 0 AND h.kind = 'visit'
                 AND h.rowid IN (SELECT rowid FROM history_fts WHERE history_fts MATCH ?1)
                 GROUP BY h.url ORDER BY max(h.at) DESC LIMIT ?2",
            )?;
            let rows = st.query_map(params![q, limit], row_to_entry)?;
            rows.collect()
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Store;

    const MIN: i64 = 60_000;
    const DAY: i64 = 86_400_000;

    fn repo_store() -> Store {
        Store::open_in_memory().unwrap()
    }

    #[test]
    fn records_visits_and_dedups_within_30_minutes() {
        let s = repo_store();
        let r = HistoryRepo::new(&s);
        r.record_visit("https://www.elpais.example/a", "Titular A", 1_000).unwrap();
        r.record_visit("https://www.elpais.example/a", "Titular A (act.)", 1_000 + 10 * MIN).unwrap();
        r.record_visit("https://www.elpais.example/a", "Titular A", 1_000 + 45 * MIN).unwrap();
        let all = r.search(&HistoryFilter::default()).unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all[1].title.as_deref(), Some("Titular A (act.)"));
        assert_eq!(all[1].outlet.as_deref(), Some("elpais.example"));
        assert_eq!(all[0].at, 1_000 + 45 * MIN);
    }

    #[test]
    fn records_searches_with_source() {
        let s = repo_store();
        let r = HistoryRepo::new(&s);
        r.record_search("subida del smi", SearchSource::Bar, 10).unwrap();
        r.record_search("indulto", SearchSource::Hemeroteca, 20).unwrap();
        assert_eq!(r.recent_searches(10).unwrap(), vec!["indulto".to_string(), "subida del smi".to_string()]);
        let f = HistoryFilter { kind: Some(HistoryFilterKind::Search), ..Default::default() };
        let rows = r.search(&f).unwrap();
        assert_eq!(rows[1].source, Some(SearchSource::Bar));
    }

    #[test]
    fn pause_skips_recording() {
        let s = repo_store();
        s.set_setting(PAUSED_KEY, &true).unwrap();
        let r = HistoryRepo::new(&s);
        assert_eq!(r.record_visit("https://a.example/", "A", 1).unwrap(), None);
        assert_eq!(r.record_search("q", SearchSource::Bar, 1).unwrap(), None);
        assert!(r.search(&HistoryFilter::default()).unwrap().is_empty());
    }

    #[test]
    fn full_text_search_ignores_accents_and_filters() {
        let s = repo_store();
        let r = HistoryRepo::new(&s);
        r.record_visit("https://a.example/1", "La subida del salario mínimo", 1 * DAY).unwrap();
        r.record_visit("https://b.example/2", "Elecciones en Galicia", 2 * DAY).unwrap();
        r.mark_analyzed("https://b.example/2").unwrap();
        let by_text = r.search(&HistoryFilter { text: Some("minimo".into()), ..Default::default() }).unwrap();
        assert_eq!(by_text.len(), 1);
        let analyzed = r.search(&HistoryFilter { kind: Some(HistoryFilterKind::Analysis), ..Default::default() }).unwrap();
        assert_eq!(analyzed.len(), 1);
        assert!(analyzed[0].analyzed);
        let by_outlet = r.search(&HistoryFilter { outlet: Some("a.example".into()), ..Default::default() }).unwrap();
        assert_eq!(by_outlet.len(), 1);
        let by_range = r.search(&HistoryFilter { from: Some(DAY + DAY / 2), ..Default::default() }).unwrap();
        assert_eq!(by_range.len(), 1);
    }

    #[test]
    fn delete_scopes_leave_scrubbed_tombstones() {
        let s = repo_store();
        let r = HistoryRepo::new(&s);
        r.record_visit("https://a.example/1", "A1", 1 * DAY).unwrap();
        r.record_visit("https://a.example/2", "A2", 2 * DAY).unwrap();
        r.record_visit("https://b.example/1", "B1", 3 * DAY).unwrap();
        assert_eq!(r.delete(&DeleteScope::Outlet { outlet: "a.example".into() }).unwrap(), 2);
        assert_eq!(r.search(&HistoryFilter::default()).unwrap().len(), 1);
        let leaked: i64 = s
            .with_conn(|c| c.query_row("SELECT count(*) FROM history WHERE deleted = 1 AND (url IS NOT NULL OR title IS NOT NULL)", [], |r| r.get(0)))
            .unwrap();
        assert_eq!(leaked, 0);
        assert!(r.search(&HistoryFilter { text: Some("A1".into()), ..Default::default() }).unwrap().is_empty());
        assert_eq!(r.delete(&DeleteScope::All).unwrap(), 1);
        assert!(r.search(&HistoryFilter::default()).unwrap().is_empty());
    }

    #[test]
    fn retention_purges_old_rows_and_old_tombstones() {
        let s = repo_store();
        let r = HistoryRepo::new(&s);
        r.record_visit("https://a.example/old", "Old", 0).unwrap();
        r.record_visit("https://a.example/new", "New", 100 * DAY).unwrap();
        // por defecto 90 días
        assert_eq!(r.purge_expired(100 * DAY).unwrap(), 1);
        s.set_setting(RETENTION_KEY, &Option::<u32>::None).unwrap();
        r.record_visit("https://a.example/older", "Older", 1).unwrap();
        assert_eq!(r.purge_expired(1_000 * DAY).unwrap(), 0);
        s.set_setting(RETENTION_KEY, &Some(7u32)).unwrap();
        assert_eq!(r.purge_expired(1_000 * DAY).unwrap(), 2);
    }

    #[test]
    fn suggests_visits_by_prefix() {
        let s = repo_store();
        let r = HistoryRepo::new(&s);
        r.record_visit("https://www.elpais.example/a", "Presupuestos 2027", 1).unwrap();
        r.record_visit("https://www.abc.example/b", "Otra cosa", 2).unwrap();
        let sug = r.suggest_visits("presu", 5).unwrap();
        assert_eq!(sug.len(), 1);
        assert_eq!(sug[0].title.as_deref(), Some("Presupuestos 2027"));
        assert_eq!(r.suggest_visits("elpais", 5).unwrap().len(), 1);
    }

    #[test]
    fn outlet_strips_www_and_rejects_non_http() {
        assert_eq!(outlet_of("https://www.elmundo.es/x").as_deref(), Some("elmundo.es"));
        assert_eq!(outlet_of("newpaper://inicio"), None);
    }
}

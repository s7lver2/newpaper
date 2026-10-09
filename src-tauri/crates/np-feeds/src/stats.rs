//! Estadísticas propias por medio a partir de los análisis guardados y correcciones del usuario.

use std::collections::BTreeMap;

use np_store::{ids::stable_id, Store};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::{
    config::host_of,
    lean::{combine, reliability, sample_stats, LeanEstimate, LeanInputs, Reliability, SampleStats},
    priors::OutletPriors,
    FeedsError, Result,
};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TopicLean {
    pub topic: String,
    pub mean: f64,
    pub n: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OutletLean {
    pub outlet_id: String,
    pub name: String,
    pub domain: String,
    pub language: String,
    pub kind: String,
    pub estimate: Option<LeanEstimate>,
    pub by_topic: Vec<TopicLean>,
    pub reliability: Option<Reliability>,
    pub override_lean: Option<f64>,
    pub override_note: Option<String>,
    /// La corrección del usuario si existe; si no, la estimación.
    pub effective: Option<f64>,
    pub effective_uncertainty: Option<f64>,
}

fn outlet_domains(conn: &Connection) -> rusqlite::Result<Vec<(String, String)>> {
    let mut st = conn.prepare("SELECT id, domain FROM outlets")?;
    let rows = st.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
    rows.collect()
}

fn outlet_for(url: &str, outlets: &[(String, String)]) -> Option<String> {
    let host = host_of(url)?;
    outlets
        .iter()
        .filter(|(_, d)| host == *d || host.ends_with(&format!(".{d}")))
        .max_by_key(|(_, d)| d.len())
        .map(|(id, _)| id.clone())
}

/// Recalcula `outlet_stats` con los análisis de los últimos `window_days`. Devuelve cuántos medios tienen datos.
pub fn recompute_stats(conn: &Connection, now_ms: i64, window_days: i64) -> Result<usize> {
    let outlets = outlet_domains(conn)?;
    let since = now_ms - window_days * 86_400_000;
    let mut framing: BTreeMap<String, Vec<f64>> = BTreeMap::new();
    let mut by_topic: BTreeMap<(String, String), Vec<f64>> = BTreeMap::new();
    let mut verdicts: BTreeMap<String, Vec<String>> = BTreeMap::new();

    let mut st = conn.prepare(
        "SELECT an.url, an.stage, an.json, ar.topic FROM analyses an LEFT JOIN articles ar ON ar.url = an.url
         WHERE an.deleted = 0 AND an.created_at >= ?1 AND an.stage IN ('score', 'verify')",
    )?;
    let rows = st.query_map([since], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, Option<String>>(3)?)))?;
    for row in rows {
        let (url, stage, json, topic) = row?;
        let Some(outlet) = outlet_for(&url, &outlets) else { continue };
        let v: serde_json::Value = serde_json::from_str(&json).unwrap_or_default();
        if stage == "score" {
            if let Some(f) = v.get("framing").and_then(|x| x.as_f64()) {
                framing.entry(outlet.clone()).or_default().push(f);
                if let Some(t) = topic {
                    by_topic.entry((outlet, t)).or_default().push(f);
                }
            }
        } else if let Some(arr) = v.as_array() {
            let e = verdicts.entry(outlet).or_default();
            e.extend(arr.iter().filter_map(|x| x.get("status").and_then(|s| s.as_str()).map(str::to_string)));
        }
    }

    conn.execute("DELETE FROM outlet_stats", [])?;
    let mut touched = 0;
    for (id, _) in &outlets {
        let own = framing.get(id).and_then(|v| sample_stats(v));
        let rel = verdicts.get(id).and_then(|v| reliability(v));
        if own.is_none() && rel.is_none() {
            continue;
        }
        let topics: Vec<TopicLean> = by_topic
            .iter()
            .filter(|((o, _), _)| o == id)
            .map(|((_, t), v)| TopicLean { topic: t.clone(), mean: v.iter().sum::<f64>() / v.len() as f64, n: v.len() })
            .collect();
        conn.execute(
            "INSERT INTO outlet_stats(outlet_id, framing_mean, framing_se, framing_n, by_topic_json, reliability, reliability_n, computed_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                id,
                own.map(|s| s.mean),
                own.map(|s| s.se),
                own.map_or(0, |s| s.n) as i64,
                serde_json::to_string(&topics)?,
                rel.map(|r| r.ratio),
                rel.map_or(0, |r| r.n) as i64,
                now_ms
            ],
        )?;
        touched += 1;
    }
    Ok(touched)
}

pub fn outlet_leans(store: &Store, priors: &OutletPriors, prior_default_sd: f64) -> Result<Vec<OutletLean>> {
    store.with_conn(|c| {
        let mut st = c.prepare(
            "SELECT o.id, o.name, o.domain, o.language, o.kind, s.framing_mean, s.framing_se, s.framing_n, s.by_topic_json,
                    s.reliability, s.reliability_n, ov.lean, ov.note
             FROM outlets o
             LEFT JOIN outlet_stats s ON s.outlet_id = o.id
             LEFT JOIN outlet_overrides ov ON ov.outlet_id = o.id AND ov.deleted = 0
             ORDER BY o.name",
        )?;
        let rows = st.query_map([], |r| {
            let id: String = r.get(0)?;
            let mean: Option<f64> = r.get(5)?;
            let own = mean.map(|m| SampleStats { mean: m, se: r.get::<_, Option<f64>>(6).unwrap_or(None).unwrap_or(0.0), n: r.get::<_, i64>(7).unwrap_or(0) as usize });
            let (audience, external) = priors.for_outlet(&id);
            let estimate = combine(&LeanInputs { own, audience, external, prior_default_sd });
            let by_topic: Vec<TopicLean> = r.get::<_, Option<String>>(8)?.and_then(|j| serde_json::from_str(&j).ok()).unwrap_or_default();
            let rel = r.get::<_, Option<f64>>(9)?.map(|ratio| Reliability { ratio, n: r.get::<_, i64>(10).unwrap_or(0) as usize });
            let override_lean: Option<f64> = r.get(11)?;
            Ok(OutletLean {
                outlet_id: id,
                name: r.get(1)?,
                domain: r.get(2)?,
                language: r.get(3)?,
                kind: r.get(4)?,
                effective: override_lean.or(estimate.as_ref().map(|e| e.value)),
                effective_uncertainty: if override_lean.is_some() { None } else { estimate.as_ref().map(|e| e.uncertainty) },
                estimate,
                by_topic,
                reliability: rel,
                override_lean,
                override_note: r.get(12)?,
            })
        })?;
        rows.collect()
    })
    .map_err(FeedsError::from)
}

/// Corrección manual (fila sincronizable). `lean = None` la retira (lápida).
pub fn set_override(store: &Store, outlet_id: &str, lean: Option<f64>, note: Option<String>) -> Result<()> {
    if lean.is_some_and(|l| !(0.0..=100.0).contains(&l)) {
        return Err(FeedsError::Config("override must be within 0–100".into()));
    }
    let id = stable_id("outlet_override", outlet_id);
    let stamp = store.stamp();
    store.with_conn(|c| {
        let exists: Option<i64> = c.query_row("SELECT 1 FROM outlet_overrides WHERE outlet_id = ?1", [outlet_id], |r| r.get(0)).optional()?;
        match (lean, exists) {
            (Some(l), _) => c.execute(
                "INSERT INTO outlet_overrides(outlet_id, id, lean, note, updated_at, deleted) VALUES (?1, ?2, ?3, ?4, ?5, 0)
                 ON CONFLICT(outlet_id) DO UPDATE SET lean = excluded.lean, note = excluded.note, updated_at = excluded.updated_at, deleted = 0",
                params![outlet_id, id, l, note, stamp],
            ),
            (None, Some(_)) => c.execute(
                "UPDATE outlet_overrides SET deleted = 1, lean = NULL, note = NULL, updated_at = ?2 WHERE outlet_id = ?1",
                params![outlet_id, stamp],
            ),
            (None, None) => Ok(0),
        }
    })?;
    Ok(())
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::{config::Sources, priors::OutletPriors, repo::{insert_articles, sync_sources, NewArticle}};
    use np_store::Store;
    use serde_json::json;

    const SRC: &str = r#"{"version":1,"medios":[
      {"id":"a","nombre":"A","dominio":"a.test","feeds":[],"pais":"ES","idioma":"es","tipo":"medio"},
      {"id":"b","nombre":"B","dominio":"b.test","feeds":[],"pais":"ES","idioma":"es","tipo":"medio"}
    ]}"#;
    const DAY_MS: i64 = 86_400_000;

    fn analysis(s: &Store, url: &str, stage: &str, json: serde_json::Value, at_ms: i64) {
        let id = np_store::ids::random_id();
        let stamp = s.stamp();
        s.with_conn(|c| {
            c.execute(
                "INSERT INTO analyses(id, url, text_hash, stage, json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![id, url, id, stage, json.to_string(), at_ms, stamp],
            )
        })
        .unwrap();
    }

    fn setup() -> Store {
        let s = Store::open_in_memory().unwrap();
        s.with_conn(|c| {
            sync_sources(c, &Sources::from_json(SRC).unwrap()).unwrap();
            insert_articles(c, &[NewArticle { url: "https://a.test/1".into(), outlet_id: Some("a".into()), title: "t".into(), summary: String::new(), language: "es".into(), published_at: 0, origin: "rss".into(), topic: Some("economia".into()) }], 0).unwrap();
            Ok(())
        })
        .unwrap();
        s
    }

    #[test]
    fn aggregates_own_framing_per_outlet_topic_and_reliability_within_window() {
        let s = setup();
        let now = 100 * DAY_MS;
        analysis(&s, "https://a.test/1", "score", json!({ "framing": 20.0 }), now - DAY_MS);
        analysis(&s, "https://www.a.test/2", "score", json!({ "framing": 40.0 }), now - DAY_MS);
        analysis(&s, "https://a.test/3", "score", json!({ "framing": null }), now - DAY_MS);
        analysis(&s, "https://a.test/old", "score", json!({ "framing": 90.0 }), now - 95 * DAY_MS);
        analysis(&s, "https://a.test/1", "verify", json!([{ "status": "verificado" }, { "status": "falso" }, { "status": "opinion" }]), now - DAY_MS);
        let n = s.with_conn(|c| Ok(recompute_stats(c, now, 90).unwrap())).unwrap();
        assert_eq!(n, 1);
        let leans = outlet_leans(&s, &OutletPriors::empty(), 10.0).unwrap();
        let a = leans.iter().find(|o| o.outlet_id == "a").unwrap();
        let est = a.estimate.as_ref().unwrap();
        assert!((est.value - 30.0).abs() < 1e-9);
        assert_eq!(est.own_n, 2);
        assert_eq!(a.by_topic, vec![TopicLean { topic: "economia".into(), mean: 20.0, n: 1 }]);
        assert!((a.reliability.unwrap().ratio - 0.5).abs() < 1e-9);
        assert!(leans.iter().find(|o| o.outlet_id == "b").unwrap().estimate.is_none());
    }

    #[test]
    fn overrides_are_synced_rows_and_win_over_the_estimate() {
        let s = setup();
        set_override(&s, "a", Some(75.0), Some("mi criterio".into())).unwrap();
        let a = outlet_leans(&s, &OutletPriors::empty(), 10.0).unwrap().into_iter().find(|o| o.outlet_id == "a").unwrap();
        assert_eq!(a.override_lean, Some(75.0));
        assert_eq!(a.effective, Some(75.0));
        let (id, deleted): (String, i64) = s.with_conn(|c| c.query_row("SELECT id, deleted FROM outlet_overrides WHERE outlet_id='a'", [], |r| Ok((r.get(0)?, r.get(1)?)))).unwrap();
        assert_eq!(id, np_store::ids::stable_id("outlet_override", "a"));
        assert_eq!(deleted, 0);
        set_override(&s, "a", None, None).unwrap();
        let a = outlet_leans(&s, &OutletPriors::empty(), 10.0).unwrap().into_iter().find(|o| o.outlet_id == "a").unwrap();
        assert_eq!(a.override_lean, None);
        assert!(set_override(&s, "a", Some(140.0), None).is_err());
    }
}

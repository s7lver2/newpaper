//! Coberturas equilibradas izquierda / centro / derecha de un hecho (§5.1, etapa 3 del pipeline).
use std::collections::HashSet;

use rusqlite::{params, Connection};
use serde::Serialize;

use crate::{
    events::{event_articles, event_of_article},
    repo::article_by_url,
    settings::FeedsSettings,
    stats::OutletLean,
    text::{tokenize_lang, Lang},
    tfidf::{cosine, idf, vectorize},
    Result,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Bucket {
    Left,
    Center,
    Right,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Coverage {
    pub outlet_id: String,
    pub outlet: String,
    pub url: String,
    pub title: String,
    pub lean: Option<f64>,
    pub lean_uncertainty: Option<f64>,
    pub bucket: Bucket,
    pub published_at: i64,
}

pub fn bucket_of(lean: Option<f64>, s: &FeedsSettings) -> Bucket {
    match lean {
        None => Bucket::Unknown,
        Some(l) if l <= s.lean_left_max => Bucket::Left,
        Some(l) if l >= s.lean_right_min => Bucket::Right,
        Some(_) => Bucket::Center,
    }
}

pub fn balanced(mut candidates: Vec<Coverage>, per_bucket: usize) -> Vec<Coverage> {
    candidates.sort_by_key(|c| c.published_at);
    let mut seen: HashSet<String> = HashSet::new();
    let mut out = Vec::new();
    for b in [Bucket::Left, Bucket::Center, Bucket::Right, Bucket::Unknown] {
        let mut taken = 0;
        for c in candidates.iter().filter(|c| c.bucket == b) {
            if taken == per_bucket {
                break;
            }
            if seen.insert(c.outlet_id.clone()) {
                out.push(c.clone());
                taken += 1;
            }
        }
    }
    out
}

/// Hecho de un artículo: por su URL si está indexado; si no, por similitud TF‑IDF con la ventana.
pub fn find_event(conn: &Connection, lang: &str, url: &str, title: &str, excerpt: &str, now: i64, s: &FeedsSettings) -> Result<Option<i64>> {
    if let Some(a) = article_by_url(conn, url)? {
        if let Some(ev) = event_of_article(conn, a.id)? {
            return Ok(Some(ev));
        }
    }
    let l = Lang::from_code(lang);
    let query = tokenize_lang(&format!("{title} {excerpt}"), l);
    if query.is_empty() {
        return Ok(None);
    }
    let mut st = conn.prepare(
        "SELECT a.title, a.summary, ea.event_id FROM articles a JOIN event_articles ea ON ea.article_id = a.id
         WHERE a.language = ?1 AND a.published_at >= ?2",
    )?;
    let window: Vec<(Vec<String>, i64)> = st
        .query_map(params![lang, now - s.window_hours * 3600], |r| {
            let t: String = r.get(0)?;
            let sm: String = r.get(1)?;
            Ok((tokenize_lang(&format!("{t} {sm}"), l), r.get(2)?))
        })?
        .collect::<rusqlite::Result<_>>()?;
    let mut docs: Vec<Vec<String>> = window.iter().map(|(t, _)| t.clone()).collect();
    docs.push(query.clone());
    let idf = idf(&docs);
    let q = vectorize(&query, &idf);
    let best = window
        .iter()
        .map(|(t, ev)| (cosine(&q, &vectorize(t, &idf)), *ev))
        .filter(|(sim, _)| *sim >= s.cluster_threshold)
        .max_by(|a, b| a.0.total_cmp(&b.0));
    Ok(best.map(|(_, ev)| ev))
}

pub fn coverage_for_event(conn: &Connection, event_id: i64, exclude_url: Option<&str>, leans: &[OutletLean], s: &FeedsSettings) -> Result<(Vec<Coverage>, usize)> {
    let arts = event_articles(conn, event_id)?;
    let exclude_outlet = exclude_url.and_then(|u| arts.iter().find(|a| a.url == u)).and_then(|a| a.outlet_id.clone());
    let mut candidates = Vec::new();
    let mut outlets: HashSet<String> = HashSet::new();
    for a in arts {
        let Some(oid) = a.outlet_id.clone() else { continue };
        if Some(a.url.as_str()) == exclude_url || Some(&oid) == exclude_outlet.as_ref() {
            continue;
        }
        outlets.insert(oid.clone());
        let lean = leans.iter().find(|l| l.outlet_id == oid);
        let value = lean.and_then(|l| l.effective);
        candidates.push(Coverage {
            outlet: a.outlet_name.clone().unwrap_or_else(|| oid.clone()),
            outlet_id: oid,
            url: a.url,
            title: a.title,
            lean: value,
            lean_uncertainty: lean.and_then(|l| l.effective_uncertainty),
            bucket: bucket_of(value, s),
            published_at: a.published_at,
        });
    }
    Ok((balanced(candidates, s.coverage_per_bucket), outlets.len()))
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::{config::Sources, events::cluster_window, repo::{insert_articles, sync_sources, NewArticle}};
    use np_store::Store;

    fn cov(outlet: &str, lean: Option<f64>, at: i64) -> Coverage {
        let s = FeedsSettings::default();
        Coverage { outlet_id: outlet.into(), outlet: outlet.to_uppercase(), url: format!("https://{outlet}.test/{at}"), title: "t".into(), lean, lean_uncertainty: None, bucket: bucket_of(lean, &s), published_at: at }
    }

    #[test]
    fn buckets_follow_settings_thresholds() {
        let s = FeedsSettings::default();
        assert_eq!(bucket_of(Some(12.0), &s), Bucket::Left);
        assert_eq!(bucket_of(Some(40.0), &s), Bucket::Left);
        assert_eq!(bucket_of(Some(50.0), &s), Bucket::Center);
        assert_eq!(bucket_of(Some(60.0), &s), Bucket::Right);
        assert_eq!(bucket_of(None, &s), Bucket::Unknown);
    }

    #[test]
    fn balanced_picks_one_per_outlet_and_per_bucket_quota() {
        let picked = balanced(
            vec![cov("l1", Some(10.0), 1), cov("l1", Some(10.0), 2), cov("l2", Some(20.0), 3), cov("l3", Some(30.0), 4), cov("c1", Some(50.0), 5), cov("r1", Some(80.0), 6), cov("u1", None, 7)],
            2,
        );
        let ids: Vec<&str> = picked.iter().map(|c| c.outlet_id.as_str()).collect();
        assert_eq!(ids, vec!["l1", "l2", "c1", "r1", "u1"]);
    }

    #[test]
    fn finds_the_event_for_an_unindexed_article_by_similarity() {
        let s = Store::open_in_memory().unwrap();
        let src = r#"{"version":1,"medios":[
          {"id":"a","nombre":"A","dominio":"a.test","feeds":[],"pais":"ES","idioma":"es","tipo":"medio"},
          {"id":"b","nombre":"B","dominio":"b.test","feeds":[],"pais":"ES","idioma":"es","tipo":"medio"}]}"#;
        let art = |u: &str, o: &str, t: &str| NewArticle { url: u.into(), outlet_id: Some(o.into()), title: t.into(), summary: String::new(), language: "es".into(), published_at: 1000, origin: "rss".into(), topic: None };
        s.with_conn(|c| {
            sync_sources(c, &Sources::from_json(src).unwrap()).unwrap();
            insert_articles(c, &[art("https://a.test/1", "a", "El Gobierno aprueba la subida del salario mínimo a 1.200 euros"), art("https://b.test/1", "b", "Un incendio forestal obliga a desalojar tres municipios")], 0).unwrap();
            cluster_window(c, "es", 2000, 72, 0.30).unwrap();
            let settings = FeedsSettings::default();
            let ev = find_event(c, "es", "https://c.test/x", "Sube el salario mínimo a 1.200 euros", "El Consejo de Ministros aprueba la subida", 2000, &settings).unwrap();
            assert_eq!(ev, crate::events::event_of_article(c, 1).unwrap());
            assert_eq!(find_event(c, "es", "https://b.test/1", "", "", 2000, &settings).unwrap(), crate::events::event_of_article(c, 2).unwrap());
            assert_eq!(find_event(c, "es", "https://c.test/y", "El Betis gana el derbi", "", 2000, &settings).unwrap(), None);
            let (covs, outlets) = coverage_for_event(c, ev.unwrap(), Some("https://c.test/x"), &[], &settings).unwrap();
            assert_eq!(outlets, 1);
            assert_eq!(covs[0].bucket, Bucket::Unknown);
            Ok(())
        })
        .unwrap();
    }
}

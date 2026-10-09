use std::collections::{HashMap, HashSet};

use np_feeds::{
    cluster::{assign, ClusterDoc, EventRef},
    settings::FeedsSettings,
    text::tokenize,
};
use serde::Deserialize;

#[derive(Deserialize)]
struct Fx {
    id: i64,
    published_at: i64,
    group: String,
    title: String,
    summary: String,
}

fn load() -> Vec<Fx> {
    serde_json::from_str(include_str!("fixtures/cluster_es.json")).unwrap()
}

fn docs(fx: &[Fx]) -> Vec<ClusterDoc> {
    fx.iter()
        .map(|f| ClusterDoc { article_id: f.id, published_at: f.published_at, tokens: tokenize(&format!("{} {}", f.title, f.summary)), event_id: None })
        .collect()
}

#[test]
fn fixtures_cluster_into_expected_events_with_default_threshold() {
    let fx = load();
    let out = assign(&docs(&fx), FeedsSettings::default().cluster_threshold);
    let by: HashMap<i64, EventRef> = out.iter().map(|a| (a.article_id, a.event)).collect();
    for a in &fx {
        for b in &fx {
            assert_eq!(a.group == b.group, by[&a.id] == by[&b.id], "articles {} and {} ({} / {})", a.id, b.id, a.group, b.group);
        }
    }
}

#[test]
fn new_article_joins_existing_event() {
    let fx = load();
    let mut d = docs(&fx);
    for doc in d.iter_mut() {
        if doc.article_id != 3 {
            doc.event_id = Some(if [1, 2].contains(&doc.article_id) { 77 } else { 100 + doc.article_id });
        }
    }
    let out = assign(&d, FeedsSettings::default().cluster_threshold);
    assert_eq!(out.len(), 1);
    assert_eq!(out[0].event, EventRef::Existing(77));
    assert!(out[0].similarity >= FeedsSettings::default().cluster_threshold);
}

#[test]
fn threshold_above_one_keeps_every_article_apart() {
    let fx = load();
    let distinct: HashSet<_> = assign(&docs(&fx), 1.01).iter().map(|a| a.event).collect();
    assert_eq!(distinct.len(), fx.len());
}

//! Descarga cada feed del idioma de contenidos, indexa artículos nuevos y agrupa la ventana.
use futures::{stream, StreamExt};
use np_store::Store;
use serde::Serialize;

use crate::{
    events::cluster_window,
    fetch::{fetch_feed, FetchOutcome},
    parse::parse_feed,
    repo::{insert_articles, list_feeds, record_fetch, FeedRow, NewArticle},
    settings::FeedsSettings,
    topics::Topics,
    FeedsError, Result,
};

const CONCURRENCY: usize = 6;

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestReport {
    pub feeds_ok: usize,
    pub feeds_not_modified: usize,
    pub feeds_failed: usize,
    pub inserted: usize,
    pub assigned: usize,
    pub new_events: usize,
}

pub async fn ingest(
    store: &Store,
    client: &reqwest::Client,
    lang: &str,
    topics: Option<&Topics>,
    settings: &FeedsSettings,
    now: i64,
) -> Result<IngestReport> {
    let feeds: Vec<FeedRow> = store.with_conn(|c| list_feeds(c, lang).map_err(to_sql))?;
    let results: Vec<(FeedRow, Result<FetchOutcome>)> = stream::iter(feeds)
        .map(|f| async move {
            let out = fetch_feed(client, &f.url, f.etag.as_deref(), f.last_modified.as_deref()).await;
            (f, out)
        })
        .buffer_unordered(CONCURRENCY)
        .collect()
        .await;

    let mut report = IngestReport::default();
    let mut items: Vec<NewArticle> = Vec::new();
    store.with_conn(|c| {
        for (feed, out) in &results {
            match out {
                Ok(FetchOutcome::NotModified) => {
                    report.feeds_not_modified += 1;
                    record_fetch(c, feed.id, now, Some(304), None, None, None).map_err(to_sql)?;
                }
                Ok(FetchOutcome::Fetched { body, etag, last_modified }) => match parse_feed(body) {
                    Ok(parsed) => {
                        report.feeds_ok += 1;
                        record_fetch(c, feed.id, now, Some(200), etag.as_deref(), last_modified.as_deref(), None).map_err(to_sql)?;
                        for p in parsed {
                            let topic = topics.and_then(|t| t.classify(&format!("{} {}", p.title, p.summary)));
                            items.push(NewArticle {
                                url: p.url,
                                outlet_id: Some(feed.outlet_id.clone()),
                                title: p.title,
                                summary: p.summary,
                                language: lang.to_string(),
                                published_at: p.published_at.unwrap_or(now).min(now),
                                origin: "rss".into(),
                                topic,
                            });
                        }
                    }
                    Err(e) => {
                        report.feeds_failed += 1;
                        record_fetch(c, feed.id, now, Some(200), None, None, Some(&e.to_string())).map_err(to_sql)?;
                    }
                },
                Err(e) => {
                    report.feeds_failed += 1;
                    let status = if let FeedsError::Status(s) = e { Some(*s) } else { None };
                    tracing::debug!(feed = %feed.url, error = %e, "feed download failed");
                    record_fetch(c, feed.id, now, status, None, None, Some(&e.to_string())).map_err(to_sql)?;
                }
            }
        }
        Ok(())
    })?;

    let (inserted, cluster) = store.with_tx(|tx| {
        let n = insert_articles(tx, &items, now).map_err(to_sql)?;
        let r = cluster_window(tx, lang, now, settings.window_hours, settings.cluster_threshold).map_err(to_sql)?;
        Ok((n, r))
    })?;
    report.inserted = inserted;
    report.assigned = cluster.assigned;
    report.new_events = cluster.new_events;
    Ok(report)
}

/// `Store::with_conn` exige `rusqlite::Result`; los errores de np-feeds viajan como `ToSqlConversionFailure`.
pub(crate) fn to_sql(e: FeedsError) -> rusqlite::Error {
    match e {
        FeedsError::Sql(s) => s,
        other => rusqlite::Error::ToSqlConversionFailure(Box::new(other)),
    }
}

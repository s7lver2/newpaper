//! Búsqueda de respaldo cuando un hecho tiene pocas coberturas (§5.1).
use np_store::Store;
use serde_json::{json, Value};

use crate::{
    config::Sources,
    events::cluster_window,
    ingest::to_sql,
    repo::{insert_articles, NewArticle},
    settings::FeedsSettings,
    FeedsError, Result,
};

#[derive(Debug, Clone, PartialEq)]
pub struct SearchHit {
    pub url: String,
    pub title: String,
    pub snippet: String,
    pub published_at: Option<i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Provider {
    Brave,
    Tavily,
    Exa,
}

impl Provider {
    pub fn from_id(id: &str) -> Option<Provider> {
        match id {
            "brave" => Some(Provider::Brave),
            "tavily" => Some(Provider::Tavily),
            "exa" => Some(Provider::Exa),
            _ => None,
        }
    }

    /// Nombre de la clave en el llavero (subproyecto 1, `SecretStore`).
    pub fn secret_key(self) -> &'static str {
        match self {
            Provider::Brave => "search.brave",
            Provider::Tavily => "search.tavily",
            Provider::Exa => "search.exa",
        }
    }
}

#[derive(Debug, Clone)]
pub struct Endpoints {
    pub brave: String,
    pub tavily: String,
    pub exa: String,
}

impl Default for Endpoints {
    fn default() -> Self {
        Self {
            brave: "https://api.search.brave.com/res/v1/web/search".into(),
            tavily: "https://api.tavily.com/search".into(),
            exa: "https://api.exa.ai/search".into(),
        }
    }
}

fn date(v: Option<&Value>) -> Option<i64> {
    v.and_then(Value::as_str)
        .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
        .map(|d| d.timestamp())
}

fn hits(arr: Option<&Value>, title: &str, snippet: &str, published: &str) -> Vec<SearchHit> {
    arr.and_then(Value::as_array)
        .map(|a| {
            a.iter()
                .filter_map(|r| {
                    Some(SearchHit {
                        url: r.get("url")?.as_str()?.to_string(),
                        title: r.get(title)?.as_str()?.to_string(),
                        snippet: r.get(snippet).and_then(Value::as_str).unwrap_or_default().to_string(),
                        published_at: date(r.get(published)),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

pub async fn run_search(client: &reqwest::Client, provider: Provider, e: &Endpoints, key: &str, query: &str, lang: &str) -> Result<Vec<SearchHit>> {
    let resp = match provider {
        Provider::Brave => client
            .get(&e.brave)
            .query(&[("q", query), ("count", "20"), ("search_lang", lang)])
            .header("X-Subscription-Token", key)
            .header("Accept", "application/json")
            .send()
            .await?,
        Provider::Tavily => client.post(&e.tavily).bearer_auth(key).json(&json!({ "query": query, "max_results": 20, "topic": "news" })).send().await?,
        Provider::Exa => client.post(&e.exa).header("x-api-key", key).json(&json!({ "query": query, "numResults": 20, "type": "auto" })).send().await?,
    };
    if !resp.status().is_success() {
        return Err(FeedsError::Status(resp.status().as_u16()));
    }
    let body: Value = resp.json().await?;
    Ok(match provider {
        Provider::Brave => hits(body.pointer("/web/results"), "title", "description", "page_age"),
        Provider::Tavily => hits(body.get("results"), "title", "content", "published_date"),
        Provider::Exa => hits(body.get("results"), "title", "text", "publishedDate"),
    })
}

#[allow(clippy::too_many_arguments)]
pub async fn backup_search(
    store: &Store,
    client: &reqwest::Client,
    provider: Provider,
    e: &Endpoints,
    key: &str,
    query: &str,
    sources: &Sources,
    lang: &str,
    settings: &FeedsSettings,
    now: i64,
) -> Result<usize> {
    let results = run_search(client, provider, e, key, query, lang).await?;
    let items: Vec<NewArticle> = results
        .into_iter()
        .filter_map(|h| {
            let outlet = sources.outlet_for_url(&h.url)?;
            Some(NewArticle {
                url: h.url,
                outlet_id: Some(outlet.id.clone()),
                title: h.title,
                summary: h.snippet,
                language: outlet.language.clone(),
                published_at: h.published_at.unwrap_or(now).min(now),
                origin: "search".into(),
                topic: None,
            })
        })
        .collect();
    store
        .with_tx(|tx| {
            let n = insert_articles(tx, &items, now).map_err(to_sql)?;
            cluster_window(tx, lang, now, settings.window_hours, settings.cluster_threshold).map_err(to_sql)?;
            Ok(n)
        })
        .map_err(FeedsError::from)
}

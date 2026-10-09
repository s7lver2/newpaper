//! Descarga de feeds con GET condicional (ETag / Last-Modified).
use reqwest::{
    header::{HeaderValue, ETAG, IF_MODIFIED_SINCE, IF_NONE_MATCH, LAST_MODIFIED},
    StatusCode,
};

use crate::{FeedsError, Result};

pub const MAX_FEED_BYTES: usize = 5 * 1024 * 1024;

#[derive(Debug, PartialEq)]
pub enum FetchOutcome {
    NotModified,
    Fetched { body: Vec<u8>, etag: Option<String>, last_modified: Option<String> },
}

pub async fn fetch_feed(client: &reqwest::Client, url: &str, etag: Option<&str>, last_modified: Option<&str>) -> Result<FetchOutcome> {
    let mut req = client.get(url);
    if let Some(e) = etag {
        req = req.header(IF_NONE_MATCH, e);
    }
    if let Some(lm) = last_modified {
        req = req.header(IF_MODIFIED_SINCE, lm);
    }
    let resp = req.send().await?;
    if resp.status() == StatusCode::NOT_MODIFIED {
        return Ok(FetchOutcome::NotModified);
    }
    if !resp.status().is_success() {
        return Err(FeedsError::Status(resp.status().as_u16()));
    }
    let header = |name| resp.headers().get(name).and_then(|v: &HeaderValue| v.to_str().ok()).map(str::to_string);
    let etag = header(ETAG);
    let last_modified = header(LAST_MODIFIED);
    if let Some(len) = resp.content_length() {
        if len as usize > MAX_FEED_BYTES {
            return Err(FeedsError::TooLarge(len as usize));
        }
    }
    let body = resp.bytes().await?;
    if body.len() > MAX_FEED_BYTES {
        return Err(FeedsError::TooLarge(body.len()));
    }
    Ok(FetchOutcome::Fetched { body: body.to_vec(), etag, last_modified })
}

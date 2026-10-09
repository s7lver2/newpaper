//! RSS/Atom → artículos, con feed-rs.
use crate::{text::strip_html, FeedsError, Result};

#[derive(Debug, Clone, PartialEq)]
pub struct ParsedItem {
    pub url: String,
    pub title: String,
    pub summary: String,
    /// Segundos Unix; `None` si el feed no trae fecha.
    pub published_at: Option<i64>,
}

const MAX_SUMMARY_CHARS: usize = 1000;

pub fn parse_feed(bytes: &[u8]) -> Result<Vec<ParsedItem>> {
    let feed = feed_rs::parser::parse(bytes).map_err(|e| FeedsError::Parse(e.to_string()))?;
    let mut out = Vec::new();
    for e in feed.entries {
        let url = e
            .links
            .iter()
            .find(|l| l.rel.as_deref().is_none_or(|r| r == "alternate"))
            .map(|l| l.href.clone())
            .or_else(|| e.id.starts_with("http").then(|| e.id.clone()));
        let Some(url) = url.filter(|u| u.starts_with("http://") || u.starts_with("https://")) else { continue };
        let title = e.title.as_ref().map(|t| strip_html(&t.content)).unwrap_or_default();
        if title.is_empty() {
            continue;
        }
        let raw = e
            .summary
            .as_ref()
            .map(|t| t.content.clone())
            .or_else(|| e.content.as_ref().and_then(|c| c.body.clone()))
            .unwrap_or_default();
        let summary: String = strip_html(&raw).chars().take(MAX_SUMMARY_CHARS).collect();
        let published_at = e.published.or(e.updated).map(|d| d.timestamp());
        out.push(ParsedItem { url, title, summary, published_at });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_rss_items_cleaning_html_and_dropping_untitled() {
        let items = parse_feed(include_bytes!("../tests/fixtures/rss_sample.xml")).unwrap();
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].url, "https://medio.test/economia/smi_1.html");
        assert_eq!(items[0].summary, "El Consejo de Ministros aprueba el SMI & más.");
        assert_eq!(items[0].published_at, Some(1_791_266_400));
        assert_eq!(items[1].published_at, None);
    }

    #[test]
    fn parses_atom_with_alternate_link() {
        let items = parse_feed(include_bytes!("../tests/fixtures/atom_sample.xml")).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].url, "https://atom.test/bce");
        assert_eq!(items[0].summary, "Lagarde no descarta bajadas.");
    }

    #[test]
    fn garbage_is_a_parse_error() {
        assert!(matches!(parse_feed(b"<html>no</html>"), Err(crate::FeedsError::Parse(_))));
    }
}

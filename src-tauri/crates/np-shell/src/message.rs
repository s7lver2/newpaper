//! Validación (esquema, tamaño, origen) de los WebMessage de las webviews de contenido.
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const MAX_MESSAGE_BYTES: usize = 2 * 1024 * 1024;
const MAX_TITLE: usize = 1_000;
const MAX_FIELD: usize = 500;
const MAX_HTML: usize = 1_500_000;
const MAX_TEXT: usize = 1_000_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct NewsSignals {
    pub og_type: Option<String>,
    pub json_ld_types: Vec<String>,
}

/// Qué es la página: artículo (lector), listado (portada, sección, búsqueda: selector de artículos) u otra cosa.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PageKind {
    Article,
    Listing,
    #[default]
    Other,
}

/// Titular de un listado, ya acotado y con URL http(s).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ListingItem {
    pub title: String,
    pub url: String,
    pub summary: Option<String>,
    pub image: Option<String>,
    pub section: Option<String>,
}

const MAX_ITEMS: usize = 150;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PagePayload {
    pub article: bool,
    pub url: String,
    pub title: String,
    pub byline: Option<String>,
    pub site_name: Option<String>,
    pub published: Option<String>,
    pub lang: Option<String>,
    pub html: String,
    pub text: String,
    pub excerpt: Option<String>,
    pub signals: NewsSignals,
    /// Artículo limitado por suscripción: solo se muestra lo que la página entrega.
    #[serde(default)]
    pub limited: bool,
    #[serde(default)]
    pub kind: PageKind,
    #[serde(default)]
    pub items: Vec<ListingItem>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ShortcutAction {
    FocusAddress,
    NewTab,
    Analyze,
    AskAgent,
}

#[derive(Debug, Clone, PartialEq)]
pub enum ContentMessage {
    Page(PagePayload),
    Nav { url: String, title: String },
    Shortcut(ShortcutAction),
    Other { kind: String, payload: Value },
}

#[derive(Debug, Clone, PartialEq, thiserror::Error)]
pub enum MessageError {
    #[error("message too large")]
    TooLarge,
    #[error("message is not JSON")]
    NotJson,
    #[error("message is not a JSON object")]
    NotObject,
    #[error("message has no string `type`")]
    MissingType,
    #[error("invalid message: {0}")]
    Invalid(String),
    #[error("message url does not match the sender document")]
    UrlMismatch,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct NavRaw {
    url: String,
    title: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct ShortcutRaw {
    action: ShortcutAction,
}

fn strip_fragment(u: &str) -> &str {
    u.split('#').next().unwrap_or(u)
}

fn check_len(name: &str, v: Option<&str>, max: usize) -> Result<(), MessageError> {
    match v {
        Some(s) if s.chars().count() > max => Err(MessageError::Invalid(format!("{name} too long"))),
        _ => Ok(()),
    }
}

fn same_document(url: &str, source: &str) -> bool {
    strip_fragment(url) == strip_fragment(source)
}

pub fn parse_content_message(raw: &str, source_url: &str) -> Result<ContentMessage, MessageError> {
    if raw.len() > MAX_MESSAGE_BYTES {
        return Err(MessageError::TooLarge);
    }
    let value: Value = serde_json::from_str(raw).map_err(|_| MessageError::NotJson)?;
    let Value::Object(mut obj) = value else { return Err(MessageError::NotObject) };
    let kind = match obj.remove("type") {
        Some(Value::String(s)) if !s.is_empty() && s.len() <= 64 => s,
        _ => return Err(MessageError::MissingType),
    };
    let rest = Value::Object(obj);
    let invalid = |e: serde_json::Error| MessageError::Invalid(e.to_string());
    match kind.as_str() {
        "page" => {
            let p: PagePayload = serde_json::from_value(rest).map_err(invalid)?;
            check_len("title", Some(&p.title), MAX_TITLE)?;
            for (n, v) in [("byline", &p.byline), ("siteName", &p.site_name), ("published", &p.published), ("excerpt", &p.excerpt)] {
                check_len(n, v.as_deref(), MAX_FIELD)?;
            }
            check_len("lang", p.lang.as_deref(), 35)?;
            if p.html.len() > MAX_HTML || p.text.len() > MAX_TEXT {
                return Err(MessageError::Invalid("body too large".into()));
            }
            if p.signals.json_ld_types.len() > 50 || p.signals.json_ld_types.iter().any(|t| t.len() > 100) {
                return Err(MessageError::Invalid("too many json-ld types".into()));
            }
            if p.items.len() > MAX_ITEMS {
                return Err(MessageError::Invalid("too many listing items".into()));
            }
            for it in &p.items {
                check_len("item.title", Some(&it.title), 300)?;
                check_len("item.url", Some(&it.url), 2_000)?;
                check_len("item.summary", it.summary.as_deref(), 400)?;
                check_len("item.image", it.image.as_deref(), 2_000)?;
                check_len("item.section", it.section.as_deref(), 100)?;
                let web = |u: &str| u.starts_with("http://") || u.starts_with("https://");
                if !web(&it.url) || it.image.as_deref().is_some_and(|i| !web(i)) {
                    return Err(MessageError::Invalid("listing item url is not http(s)".into()));
                }
            }
            if !same_document(&p.url, source_url) {
                return Err(MessageError::UrlMismatch);
            }
            Ok(ContentMessage::Page(p))
        }
        "nav" => {
            let n: NavRaw = serde_json::from_value(rest).map_err(invalid)?;
            check_len("title", Some(&n.title), MAX_TITLE)?;
            if !same_document(&n.url, source_url) {
                return Err(MessageError::UrlMismatch);
            }
            Ok(ContentMessage::Nav { url: n.url, title: n.title })
        }
        "shortcut" => {
            let s: ShortcutRaw = serde_json::from_value(rest).map_err(invalid)?;
            Ok(ContentMessage::Shortcut(s.action))
        }
        _ => {
            // Los manejadores de extensiones reciben el mensaje completo, con su `type`.
            let mut payload = rest;
            if let Value::Object(o) = &mut payload {
                o.insert("type".into(), Value::String(kind.clone()));
            }
            Ok(ContentMessage::Other { kind, payload })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const SRC: &str = "https://diario.example/a#comentarios";

    fn page(extra: serde_json::Value) -> String {
        let mut v = json!({
            "type": "page", "article": true, "url": "https://diario.example/a", "title": "T",
            "byline": null, "siteName": "Diario", "published": null, "lang": "es",
            "html": "<p>x</p>", "text": "x", "excerpt": null,
            "signals": { "ogType": "article", "jsonLdTypes": ["NewsArticle"] }
        });
        v.as_object_mut().unwrap().extend(extra.as_object().unwrap().clone());
        v.to_string()
    }

    #[test]
    fn accepts_a_valid_page_message() {
        match parse_content_message(&page(json!({})), SRC).unwrap() {
            ContentMessage::Page(p) => {
                assert_eq!(p.title, "T");
                assert_eq!(p.site_name.as_deref(), Some("Diario"));
                assert_eq!(p.signals.json_ld_types, vec!["NewsArticle".to_string()]);
            }
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn parses_listing_pages_and_rejects_bad_items() {
        let ok = page(json!({"article": false, "kind": "listing", "limited": false, "items": [
            {"title": "Titular de prueba largo", "url": "https://diario.example/x.html", "summary": null, "image": null, "section": "Hoy"}]}));
        match parse_content_message(&ok, SRC).unwrap() {
            ContentMessage::Page(p) => {
                assert_eq!(p.kind, PageKind::Listing);
                assert_eq!(p.items.len(), 1);
            }
            other => panic!("{other:?}"),
        }
        let bad = page(json!({"kind": "listing", "items": [{"title": "t", "url": "javascript:alert(1)", "summary": null, "image": null, "section": null}]}));
        assert!(matches!(parse_content_message(&bad, SRC), Err(MessageError::Invalid(_))));
        // Mensajes antiguos sin los campos nuevos siguen siendo válidos.
        match parse_content_message(&page(json!({})), SRC).unwrap() {
            ContentMessage::Page(p) => assert_eq!((p.kind, p.limited, p.items.len()), (PageKind::Other, false, 0)),
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn rejects_unknown_fields_wrong_types_and_oversized_fields() {
        assert!(matches!(parse_content_message(&page(json!({"evil": 1})), SRC), Err(MessageError::Invalid(_))));
        assert!(matches!(parse_content_message(&page(json!({"title": 5})), SRC), Err(MessageError::Invalid(_))));
        let long = "x".repeat(1_001);
        assert!(matches!(parse_content_message(&page(json!({"title": long})), SRC), Err(MessageError::Invalid(_))));
    }

    #[test]
    fn rejects_url_that_does_not_match_the_sender() {
        let spoof = page(json!({"url": "https://otro.example/"}));
        assert!(matches!(parse_content_message(&spoof, SRC), Err(MessageError::UrlMismatch)));
    }

    #[test]
    fn rejects_non_objects_and_huge_payloads() {
        assert!(matches!(parse_content_message("[1,2]", SRC), Err(MessageError::NotObject)));
        assert!(matches!(parse_content_message("{oops", SRC), Err(MessageError::NotJson)));
        assert!(matches!(parse_content_message(r#"{"a":1}"#, SRC), Err(MessageError::MissingType)));
        let huge = format!(r#"{{"type":"x","p":"{}"}}"#, "a".repeat(MAX_MESSAGE_BYTES));
        assert!(matches!(parse_content_message(&huge, SRC), Err(MessageError::TooLarge)));
    }

    #[test]
    fn parses_nav_and_shortcut_and_passes_other_kinds_through() {
        let nav = json!({"type": "nav", "url": "https://diario.example/a", "title": "T"}).to_string();
        assert!(matches!(parse_content_message(&nav, SRC).unwrap(), ContentMessage::Nav { .. }));
        let sc = json!({"type": "shortcut", "action": "ask-agent"}).to_string();
        assert_eq!(parse_content_message(&sc, SRC).unwrap(), ContentMessage::Shortcut(ShortcutAction::AskAgent));
        let bad = json!({"type": "shortcut", "action": "format-disk"}).to_string();
        assert!(parse_content_message(&bad, SRC).is_err());
        let other = json!({"type": "np-cosmetic-init", "url": "https://diario.example/a"}).to_string();
        match parse_content_message(&other, SRC).unwrap() {
            ContentMessage::Other { kind, payload } => {
                assert_eq!(kind, "np-cosmetic-init");
                assert_eq!(payload["url"], "https://diario.example/a");
                assert_eq!(payload["type"], "np-cosmetic-init");
            }
            m => panic!("{m:?}"),
        }
    }
}

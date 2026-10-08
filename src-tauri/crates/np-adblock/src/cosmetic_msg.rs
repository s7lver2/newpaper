//! Protocolo WebMessage del filtrado cosmético. La página puede falsificar mensajes:
//! todo se valida y la respuesta solo contiene CSS de ocultación.

use serde_json::{json, Value};

use crate::{cosmetic::css_for_selectors, service::AdblockService};

pub const COSMETIC_SCRIPT: &str = include_str!("../assets/cosmetic.js");
pub const KIND_INIT: &str = "np-cosmetic-init";
pub const KIND_GENERIC: &str = "np-cosmetic-generic";
pub const KIND_CSS: &str = "np-cosmetic-css";

pub const MAX_URL_LEN: usize = 4096;
pub const MAX_ITEMS: usize = 1000;
pub const MAX_ITEM_LEN: usize = 200;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CosmeticRequest {
    Init { url: String },
    Generic { url: String, classes: Vec<String>, ids: Vec<String> },
}

fn valid_url(v: &Value) -> Option<String> {
    let url = v.get("url")?.as_str()?;
    let ok = url.len() <= MAX_URL_LEN && (url.starts_with("https://") || url.starts_with("http://"));
    ok.then(|| url.to_owned())
}

fn names(v: &Value, key: &str) -> Vec<String> {
    v.get(key)
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_str)
                .filter(|s| !s.is_empty() && s.len() <= MAX_ITEM_LEN && !s.chars().any(char::is_whitespace))
                .take(MAX_ITEMS)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

pub fn parse_cosmetic_message(v: &Value) -> Option<CosmeticRequest> {
    match v.get("type")?.as_str()? {
        KIND_INIT => Some(CosmeticRequest::Init { url: valid_url(v)? }),
        KIND_GENERIC => Some(CosmeticRequest::Generic {
            url: valid_url(v)?,
            classes: names(v, "classes"),
            ids: names(v, "ids"),
        }),
        _ => None,
    }
}

pub fn handle_cosmetic(svc: &AdblockService, req: CosmeticRequest) -> Option<Value> {
    if !svc.settings().enabled {
        return None;
    }
    let blocker = svc.blocker();
    let css = match req {
        CosmeticRequest::Init { url } => css_for_selectors(&blocker.cosmetic_for(&url).hide_selectors),
        CosmeticRequest::Generic { url, classes, ids } => {
            let res = blocker.cosmetic_for(&url);
            if res.generichide {
                String::new()
            } else {
                css_for_selectors(&blocker.generic_selectors(&classes, &ids, &res.exceptions))
            }
        }
    };
    (!css.is_empty()).then(|| json!({ "type": KIND_CSS, "css": css }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{blocker::Blocker, service::{AdblockSettings, BlockedNotifier}};
    use serde_json::json;
    use std::sync::Arc;

    struct Nop;
    impl BlockedNotifier for Nop {
        fn blocked(&self, _: u64, _: u64) {}
    }

    fn svc() -> AdblockService {
        let s = AdblockService::new(AdblockSettings::default(), Arc::new(Nop));
        s.install_blocker(Blocker::from_lists(["example.org##.cookie-banner\n##.newsletter-modal\n"]));
        s
    }

    #[test]
    fn parses_valid_messages() {
        assert_eq!(
            parse_cosmetic_message(&json!({"type": "np-cosmetic-init", "url": "https://example.org/a"})),
            Some(CosmeticRequest::Init { url: "https://example.org/a".into() })
        );
        assert_eq!(
            parse_cosmetic_message(&json!({
                "type": "np-cosmetic-generic", "url": "https://example.org/a",
                "classes": ["newsletter-modal", "con espacio", ""], "ids": ["x"]
            })),
            Some(CosmeticRequest::Generic {
                url: "https://example.org/a".into(),
                classes: vec!["newsletter-modal".into()],
                ids: vec!["x".into()],
            })
        );
    }

    #[test]
    fn rejects_bad_urls_and_unknown_types() {
        assert_eq!(parse_cosmetic_message(&json!({"type": "np-cosmetic-init", "url": "file:///c:/x"})), None);
        assert_eq!(parse_cosmetic_message(&json!({"type": "otro", "url": "https://a.es"})), None);
        let long = format!("https://a.es/{}", "x".repeat(5000));
        assert_eq!(parse_cosmetic_message(&json!({"type": "np-cosmetic-init", "url": long})), None);
    }

    #[test]
    fn truncates_huge_class_lists() {
        let classes: Vec<String> = (0..5000).map(|i| format!("c{i}")).collect();
        let msg = json!({"type": "np-cosmetic-generic", "url": "https://a.es", "classes": classes, "ids": []});
        match parse_cosmetic_message(&msg) {
            Some(CosmeticRequest::Generic { classes, .. }) => assert_eq!(classes.len(), MAX_ITEMS),
            other => panic!("unexpected: {other:?}"),
        }
    }

    #[test]
    fn init_returns_site_specific_css() {
        let out = handle_cosmetic(&svc(), CosmeticRequest::Init { url: "https://example.org/a".into() }).unwrap();
        assert_eq!(out["type"], "np-cosmetic-css");
        assert!(out["css"].as_str().unwrap().contains(".cookie-banner { display: none !important; }"));
    }

    #[test]
    fn generic_returns_css_for_seen_classes_and_none_when_empty() {
        let s = svc();
        let out = handle_cosmetic(
            &s,
            CosmeticRequest::Generic { url: "https://a.es/".into(), classes: vec!["newsletter-modal".into()], ids: vec![] },
        )
        .unwrap();
        assert!(out["css"].as_str().unwrap().contains(".newsletter-modal"));
        assert!(handle_cosmetic(
            &s,
            CosmeticRequest::Generic { url: "https://a.es/".into(), classes: vec!["nada".into()], ids: vec![] },
        )
        .is_none());
    }

    #[test]
    fn disabled_service_returns_nothing() {
        let s = svc();
        s.set_enabled(false);
        assert!(handle_cosmetic(&s, CosmeticRequest::Init { url: "https://example.org/a".into() }).is_none());
    }
}

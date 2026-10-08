//! Detección de noticia: dominio en la lista de medios, o og:type=article / JSON-LD NewsArticle.
use std::collections::HashSet;

use crate::message::NewsSignals;

pub fn host_key(url: &str) -> Option<String> {
    let u = url::Url::parse(url).ok()?;
    let h = u.host_str()?.to_ascii_lowercase();
    Some(h.strip_prefix("www.").map(str::to_string).unwrap_or(h))
}

fn known_host(host: &str, known: &HashSet<String>) -> bool {
    let mut h = host;
    loop {
        if known.contains(h) {
            return true;
        }
        match h.split_once('.') {
            Some((_, rest)) if rest.contains('.') => h = rest,
            _ => return false,
        }
    }
}

pub fn is_news(url: &str, signals: &NewsSignals, known_domains: &HashSet<String>) -> bool {
    if host_key(url).is_some_and(|h| known_host(&h, known_domains)) {
        return true;
    }
    signals.og_type.as_deref() == Some("article") || signals.json_ld_types.iter().any(|t| t.ends_with("NewsArticle"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::message::NewsSignals;

    fn known() -> HashSet<String> {
        ["elpais.com", "efe.com"].iter().map(|s| s.to_string()).collect()
    }
    fn none() -> NewsSignals {
        NewsSignals { og_type: None, json_ld_types: vec![] }
    }

    #[test]
    fn known_domain_and_subdomains_are_news() {
        assert!(is_news("https://elpais.com/espana/x.html", &none(), &known()));
        assert!(is_news("https://www.elpais.com/x", &none(), &known()));
        assert!(is_news("https://cincodias.elpais.com/x", &none(), &known()));
        assert!(!is_news("https://notelpais.com/x", &none(), &known()));
    }

    #[test]
    fn metadata_marks_unknown_sites_as_news() {
        let og = NewsSignals { og_type: Some("article".into()), json_ld_types: vec![] };
        let ld = NewsSignals { og_type: None, json_ld_types: vec!["ReportageNewsArticle".into()] };
        assert!(is_news("https://blog.example/x", &og, &known()));
        assert!(is_news("https://blog.example/x", &ld, &known()));
        assert!(!is_news("https://shop.example/", &none(), &known()));
    }
}

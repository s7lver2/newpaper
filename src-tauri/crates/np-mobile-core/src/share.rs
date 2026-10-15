//! URL de un texto compartido desde otra app ("Título https://… vía @app").

const TRACKING: &[&str] = &["fbclid", "gclid", "mc_cid", "mc_eid", "igshid"];

pub fn extract_url(text: &str) -> Option<String> {
    let start = text.find("https://").or_else(|| text.find("http://"))?;
    let rest = &text[start..];
    let end = rest.find(|c: char| c.is_whitespace() || c == '"' || c == '<' || c == '>').unwrap_or(rest.len());
    let raw = rest[..end].trim_end_matches(['.', ',', ';', ':', ')', ']', '!', '?', '»']);
    let mut url = url::Url::parse(raw).ok()?;
    if !matches!(url.scheme(), "http" | "https") {
        return None;
    }
    let kept: Vec<(String, String)> = url
        .query_pairs()
        .filter(|(k, _)| !k.starts_with("utm_") && !TRACKING.contains(&k.as_ref()))
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();
    if kept.is_empty() {
        url.set_query(None);
    } else {
        url.query_pairs_mut().clear().extend_pairs(kept);
    }
    url.set_fragment(None);
    Some(url.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_first_url_and_cleans_it() {
        assert_eq!(
            extract_url("El SMI bate récords https://www.elpais.com/economia/smi.html?utm_source=tw&id=3, vía @elpais").as_deref(),
            Some("https://www.elpais.com/economia/smi.html?id=3")
        );
        assert_eq!(extract_url("Mira esto: (https://d.example/a?fbclid=xyz).").as_deref(), Some("https://d.example/a"));
        assert_eq!(extract_url("sin enlaces"), None);
        assert_eq!(extract_url("ftp://d.example/a javascript:alert(1)"), None);
    }
}

//! Interpretación del texto de la barra de direcciones.
use url::Url;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Target {
    Web(Url),
    Internal(String),
    Search(String),
}

pub fn is_internal(url: &str) -> bool {
    url.get(..11).is_some_and(|p| p.eq_ignore_ascii_case("newpaper://"))
}

pub fn search_url(query: &str) -> String {
    let encoded: String = url::form_urlencoded::byte_serialize(query.as_bytes()).collect();
    format!("newpaper://inicio?q={}", encoded.replace('+', "%20"))
}

fn is_local_host(host: &str) -> bool {
    host == "localhost" || host.parse::<std::net::IpAddr>().is_ok()
}

fn looks_like_domain(host: &str) -> bool {
    let Some((_, tld)) = host.rsplit_once('.') else { return false };
    tld.len() >= 2 && tld.chars().all(|c| c.is_ascii_alphabetic())
}

pub fn parse_input(text: &str) -> Option<Target> {
    let s = text.trim();
    if s.is_empty() {
        return None;
    }
    if is_internal(s) {
        return Some(Target::Internal(format!("newpaper://{}", &s[11..])));
    }
    if s.contains("://") {
        return match Url::parse(s) {
            Ok(u) if matches!(u.scheme(), "http" | "https") && u.host_str().is_some() => Some(Target::Web(u)),
            _ => Some(Target::Search(s.to_string())),
        };
    }
    if !s.contains(char::is_whitespace) {
        if let Ok(u) = Url::parse(&format!("http://{s}")) {
            if let Some(host) = u.host_str() {
                if is_local_host(host) {
                    return Some(Target::Web(u));
                }
                if looks_like_domain(host) {
                    return Url::parse(&format!("https://{s}")).ok().map(Target::Web);
                }
            }
        }
    }
    Some(Target::Search(s.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn web(s: &str) -> String {
        match parse_input(s) {
            Some(Target::Web(u)) => u.to_string(),
            other => panic!("{s:?} -> {other:?}"),
        }
    }

    #[test]
    fn urls_with_scheme() {
        assert_eq!(web("https://elpais.com/espana/"), "https://elpais.com/espana/");
        assert_eq!(web("  http://a.example/x?y=1 "), "http://a.example/x?y=1");
    }

    #[test]
    fn bare_domains_get_https_and_local_hosts_get_http() {
        assert_eq!(web("elpais.com"), "https://elpais.com/");
        assert_eq!(web("www.bbc.co.uk/news"), "https://www.bbc.co.uk/news");
        assert_eq!(web("localhost:4567/noticia.html"), "http://localhost:4567/noticia.html");
        assert_eq!(web("127.0.0.1:8080"), "http://127.0.0.1:8080/");
    }

    #[test]
    fn internal_pages() {
        assert_eq!(parse_input("newpaper://ajustes/red"), Some(Target::Internal("newpaper://ajustes/red".into())));
        assert_eq!(parse_input("NEWPAPER://inicio"), Some(Target::Internal("newpaper://inicio".into())));
        assert!(is_internal("newpaper://sintesis/abc"));
        assert!(!is_internal("https://newpaper.example/"));
    }

    #[test]
    fn everything_else_is_a_search() {
        assert_eq!(parse_input("subida del smi"), Some(Target::Search("subida del smi".into())));
        assert_eq!(parse_input("javascript:alert(1)"), Some(Target::Search("javascript:alert(1)".into())));
        assert_eq!(parse_input("file:///C:/x.html"), Some(Target::Search("file:///C:/x.html".into())));
        assert_eq!(parse_input("presupuestos.2027"), Some(Target::Search("presupuestos.2027".into())));
        assert_eq!(parse_input("   "), None);
    }

    #[test]
    fn search_url_is_encoded() {
        assert_eq!(search_url("smi & empleo"), "newpaper://inicio?q=smi%20%26%20empleo");
    }
}

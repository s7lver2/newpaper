//! Cabeceras: JS nunca puede fijar credenciales ni cabeceras de salto; Rust pone la autenticación.
use crate::table::AuthScheme;

const BLOCKED_REQUEST: &[&str] = &[
    "authorization", "x-api-key", "x-goog-api-key", "api-key", "cookie", "host", "content-length",
    "connection", "proxy-authorization", "transfer-encoding", "te", "upgrade", "origin", "referer",
];
const BLOCKED_RESPONSE: &[&str] = &["set-cookie", "set-cookie2", "content-length", "transfer-encoding", "connection"];

fn filter(pairs: &[(String, String)], blocked: &[&str]) -> Vec<(String, String)> {
    pairs.iter().filter(|(k, _)| !blocked.contains(&k.to_ascii_lowercase().as_str())).map(|(k, v)| (k.to_ascii_lowercase(), v.clone())).collect()
}

pub fn sanitize_request_headers(pairs: &[(String, String)]) -> Vec<(String, String)> {
    filter(pairs, BLOCKED_REQUEST)
}

pub fn sanitize_response_headers(pairs: &[(String, String)]) -> Vec<(String, String)> {
    filter(pairs, BLOCKED_RESPONSE)
}

pub fn auth_header(scheme: AuthScheme, key: &str) -> Option<(String, String)> {
    match scheme {
        AuthScheme::Bearer => Some(("authorization".into(), format!("Bearer {key}"))),
        AuthScheme::XApiKey => Some(("x-api-key".into(), key.into())),
        AuthScheme::XGoogApiKey => Some(("x-goog-api-key".into(), key.into())),
        AuthScheme::None => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn h(pairs: &[(&str, &str)]) -> Vec<(String, String)> {
        pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn strips_credentials_and_hop_headers_sent_by_js() {
        let out = sanitize_request_headers(&h(&[
            ("Authorization", "Bearer np-proxied"),
            ("x-api-key", "np-proxied"),
            ("X-Goog-Api-Key", "np-proxied"),
            ("Host", "evil"),
            ("Cookie", "a=b"),
            ("content-type", "application/json"),
            ("anthropic-version", "2023-06-01"),
        ]));
        assert_eq!(out, h(&[("content-type", "application/json"), ("anthropic-version", "2023-06-01")]));
    }

    #[test]
    fn builds_auth_header_per_scheme() {
        assert_eq!(auth_header(AuthScheme::Bearer, "k"), Some(("authorization".into(), "Bearer k".into())));
        assert_eq!(auth_header(AuthScheme::XApiKey, "k"), Some(("x-api-key".into(), "k".into())));
        assert_eq!(auth_header(AuthScheme::XGoogApiKey, "k"), Some(("x-goog-api-key".into(), "k".into())));
        assert_eq!(auth_header(AuthScheme::None, "k"), None);
    }

    #[test]
    fn response_headers_drop_cookies() {
        let out = sanitize_response_headers(&h(&[("set-cookie", "x"), ("content-type", "text/event-stream")]));
        assert_eq!(out, h(&[("content-type", "text/event-stream")]));
    }
}

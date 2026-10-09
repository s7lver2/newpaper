//! Datos de diagnóstico de una navegación fallida (los usa el botón "Copiar detalles" de la página de error).
//! Solo cabeceras útiles para entender un rechazo del servidor; nunca cookies ni credenciales.
use serde::Serialize;

pub type Headers = Vec<(String, String)>;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NavDiagnostics {
    pub navigation_id: u64,
    /// Marca de tiempo (ms desde la época Unix).
    pub at_ms: u64,
    pub app_version: String,
    pub webview2_version: String,
    /// Cabeceras enviadas por la navegación principal (vacío si no hubo respuesta que las revelara).
    pub request_headers: Headers,
    /// Cabeceras relevantes de la respuesta (servidor, caché, WAF...).
    pub response_headers: Headers,
}

/// Cabeceras de petición que se incluyen: identidad del navegador, idioma, origen y client hints.
fn request_wanted(name: &str) -> bool {
    matches!(name, "user-agent" | "accept" | "accept-language" | "referer" | "upgrade-insecure-requests")
        || name.starts_with("sec-ch-ua")
        || name.starts_with("sec-fetch-")
}

/// Cabeceras de respuesta que se incluyen: quién respondió y qué protección del sitio intervino.
fn response_wanted(name: &str) -> bool {
    matches!(
        name,
        "server" | "via" | "x-cache" | "x-cache-hits" | "x-served-by" | "content-type" | "retry-after" | "cf-ray" | "cf-cache-status" | "cf-mitigated"
    ) || name.starts_with("x-akamai")
        || name.starts_with("akamai-")
        || name.starts_with("x-datadome")
}

fn pick(all: &[(String, String)], wanted: fn(&str) -> bool) -> Headers {
    all.iter()
        .map(|(k, v)| (k.to_ascii_lowercase(), v.trim().to_string()))
        // Nunca cookies ni credenciales, aunque alguien las añada a la lista.
        .filter(|(k, _)| !matches!(k.as_str(), "cookie" | "set-cookie" | "authorization" | "proxy-authorization") && wanted(k))
        .collect()
}

pub fn pick_request_headers(all: &[(String, String)]) -> Headers {
    pick(all, request_wanted)
}

pub fn pick_response_headers(all: &[(String, String)]) -> Headers {
    pick(all, response_wanted)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn h(items: &[(&str, &str)]) -> Headers {
        items.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()
    }

    #[test]
    fn requests_keep_identity_headers_and_drop_cookies() {
        let all = h(&[
            ("User-Agent", "UA"),
            ("Cookie", "datadome=secret"),
            ("Authorization", "Bearer x"),
            ("Accept-Language", "es"),
            ("Sec-CH-UA", "\"Chromium\";v=\"154\""),
            ("Sec-CH-UA-Platform", "\"Windows\""),
            ("X-Custom", "nope"),
        ]);
        let got = pick_request_headers(&all);
        let names: Vec<_> = got.iter().map(|(k, _)| k.as_str()).collect();
        assert_eq!(names, ["user-agent", "accept-language", "sec-ch-ua", "sec-ch-ua-platform"]);
    }

    #[test]
    fn responses_keep_waf_headers_and_drop_set_cookie() {
        let all = h(&[
            ("Server", "openresty"),
            ("Set-Cookie", "datadome=secret"),
            ("X-DataDome", "protected"),
            ("X-Akamai-Transformed", "9"),
            ("CF-RAY", "abc"),
            ("Content-Length", "10"),
        ]);
        let names: Vec<_> = pick_response_headers(&all).into_iter().map(|(k, _)| k).collect();
        assert_eq!(names, ["server", "x-datadome", "x-akamai-transformed", "cf-ray"]);
    }
}

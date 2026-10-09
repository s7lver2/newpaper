//! Protocolo `npimg`: las imágenes del lector se descargan en Rust por el cliente de la red activa.
use std::{sync::Arc, time::Duration};

use np_shell::extensions::{HttpPurpose, ShellExtensions};
use percent_encoding::percent_decode_str;
use tauri::{
    http::{header::CONTENT_TYPE, Request, Response, StatusCode},
    AppHandle, Manager, UriSchemeContext, UriSchemeResponder, Wry,
};
use url::Url;

pub const MAX_IMAGE_BYTES: u64 = 10 * 1024 * 1024;

/// Muchos CDN rechazan (403) a clientes sin cara de navegador: se presenta como un Chromium genérico,
/// igual que las webviews de contenido (sin las marcas de Edge).
const BROWSER_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const ACCEPT_IMAGES: &str = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";

/// Solo en compilaciones de desarrollo y con `NP_TEST_ALLOW_LOCAL_IMAGES`: permite imágenes de
/// 127.0.0.1 para probar el lector con fixtures locales. Nunca en release.
fn allow_local() -> bool {
    cfg!(debug_assertions) && std::env::var_os("NP_TEST_ALLOW_LOCAL_IMAGES").is_some()
}

fn is_private_host(u: &Url) -> bool {
    if allow_local() {
        return false;
    }
    match u.host() {
        Some(url::Host::Ipv4(ip)) => ip.is_private() || ip.is_loopback() || ip.is_link_local() || ip.is_unspecified(),
        Some(url::Host::Ipv6(ip)) => ip.is_loopback() || ip.is_unspecified(),
        Some(url::Host::Domain(d)) => d == "localhost" || d.ends_with(".localhost"),
        None => true,
    }
}

pub fn decode_target(path: &str) -> Option<Url> {
    let raw = percent_decode_str(path.trim_start_matches('/')).decode_utf8().ok()?;
    let u = Url::parse(&raw).ok()?;
    (matches!(u.scheme(), "http" | "https") && !is_private_host(&u)).then_some(u)
}

/// Tipo de imagen por los primeros bytes, para CDN que sirven imágenes como `application/octet-stream`
/// o sin tipo. Nunca se sirve algo que no empiece como imagen.
pub fn sniff_image(bytes: &[u8]) -> Option<&'static str> {
    let b = bytes;
    if b.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if b.starts_with(&[0x89, b'P', b'N', b'G']) {
        Some("image/png")
    } else if b.starts_with(b"GIF8") {
        Some("image/gif")
    } else if b.len() > 12 && &b[0..4] == b"RIFF" && &b[8..12] == b"WEBP" {
        Some("image/webp")
    } else if b.len() > 12 && &b[4..8] == b"ftyp" && (&b[8..12] == b"avif" || &b[8..12] == b"avis") {
        Some("image/avif")
    } else {
        None
    }
}

fn is_image_type(ct: Option<&str>) -> bool {
    ct.is_some_and(|c| c.trim().to_ascii_lowercase().starts_with("image/"))
}

pub fn check_image(status: u16, content_type: Option<&str>, len: Option<u64>) -> Result<(), u16> {
    if !(200..300).contains(&status) {
        return Err(502);
    }
    if len.is_some_and(|l| l > MAX_IMAGE_BYTES) {
        return Err(413);
    }
    // Un tipo que no sea de imagen solo se rechaza si el tipo es textual; el resto se comprueba por contenido.
    if let Some(c) = content_type {
        let c = c.trim().to_ascii_lowercase();
        if c.starts_with("text/") || c.contains("json") || (c.contains("xml") && !c.contains("svg")) {
            return Err(415);
        }
    }
    Ok(())
}

fn status(code: u16) -> Response<Vec<u8>> {
    Response::builder().status(StatusCode::from_u16(code).unwrap_or(StatusCode::BAD_GATEWAY)).body(Vec::new()).expect("response")
}

/// `Referer` como lo enviaría un navegador (`strict-origin-when-cross-origin`): solo el origen de la página.
pub fn referer_origin(page: &str) -> Option<String> {
    let u = Url::parse(page).ok()?;
    matches!(u.scheme(), "http" | "https").then(|| format!("{}/", u.origin().ascii_serialization()))
}

fn query_param(query: Option<&str>, key: &str) -> Option<String> {
    url::form_urlencoded::parse(query?.as_bytes()).find(|(k, _)| k == key).map(|(_, v)| v.into_owned())
}

async fn fetch_once(client: &reqwest::Client, target: &Url, referer: Option<&str>) -> Result<(u16, Option<String>, Option<u64>, reqwest::Response), ()> {
    let mut req = client
        .get(target.clone())
        .header("User-Agent", BROWSER_UA)
        .header("Accept", ACCEPT_IMAGES)
        .timeout(Duration::from_secs(25));
    if let Some(r) = referer {
        req = req.header("Referer", r);
    }
    let resp = req.send().await.map_err(|_| ())?;
    let ct = resp.headers().get(CONTENT_TYPE).and_then(|v| v.to_str().ok()).map(str::to_string);
    Ok((resp.status().as_u16(), ct, resp.content_length(), resp))
}

async fn serve(app: AppHandle, path: String, query: Option<String>) -> Response<Vec<u8>> {
    let Some(target) = decode_target(&path) else { return status(400) };
    let referer = query_param(query.as_deref(), "r").and_then(|p| referer_origin(&p));
    let ext = app.state::<Arc<ShellExtensions>>();
    let client = match ext.http_client(HttpPurpose::Content) {
        Ok(c) => c,
        Err(_) => return status(503), // p. ej. Tor no listo: nunca hay vuelta a directo
    };
    // Un reintento ante fallos transitorios (circuitos de Tor lentos, 5xx).
    let mut attempt = 0;
    let (code, ct, len, resp) = loop {
        match fetch_once(&client, &target, referer.as_deref()).await {
            Ok((c, ..)) if c >= 500 && attempt == 0 => {}
            Ok(r) => break r,
            Err(()) if attempt == 0 => {}
            Err(()) => return status(502),
        }
        attempt += 1;
        tokio::time::sleep(Duration::from_millis(600)).await;
    };
    // Una redirección no puede llevar a la red local (SSRF): se comprueba el destino final.
    if is_private_host(resp.url()) {
        return status(400);
    }
    if let Err(c) = check_image(code, ct.as_deref(), len) {
        return status(c);
    }
    let bytes = match resp.bytes().await {
        Ok(b) if (b.len() as u64) <= MAX_IMAGE_BYTES => b,
        _ => return status(413),
    };
    let content_type = if is_image_type(ct.as_deref()) {
        ct.unwrap_or_default()
    } else {
        match sniff_image(&bytes) {
            Some(t) => t.to_string(),
            None => return status(415),
        }
    };
    Response::builder()
        .status(200)
        .header(CONTENT_TYPE, content_type)
        .header("Cache-Control", "max-age=3600")
        // El constructor de la edición sin conexión dibuja la imagen en un canvas para recomprimirla; sin CORS lo mancharía.
        .header("Access-Control-Allow-Origin", "*")
        .body(bytes.to_vec())
        .expect("response")
}

/// Registrado con `register_asynchronous_uri_scheme_protocol("npimg", npimg::handle)`.
/// Solo atiende a la webview `ui`: las páginas web no pueden usarlo como proxy.
pub fn handle(ctx: UriSchemeContext<'_, Wry>, request: Request<Vec<u8>>, responder: UriSchemeResponder) {
    if ctx.webview_label() != "ui" {
        responder.respond(status(403));
        return;
    }
    let app = ctx.app_handle().clone();
    let path = request.uri().path().to_string();
    let query = request.uri().query().map(str::to_string);
    tauri::async_runtime::spawn(async move {
        responder.respond(serve(app, path, query).await);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_percent_encoded_http_urls_only() {
        assert_eq!(
            decode_target("/https%3A%2F%2Fcdn.example%2Fa.jpg%3Fw%3D800").unwrap().as_str(),
            "https://cdn.example/a.jpg?w=800"
        );
        assert!(decode_target("/file%3A%2F%2F%2FC%3A%2Fx.png").is_none());
        assert!(decode_target("/http%3A%2F%2F127.0.0.1%2Fa.png").is_none());
        assert!(decode_target("/not-a-url").is_none());
    }

    #[test]
    fn sniffs_image_formats_and_rejects_the_rest() {
        assert_eq!(sniff_image(&[0xFF, 0xD8, 0xFF, 0xE0, 0, 0]), Some("image/jpeg"));
        assert_eq!(sniff_image(b"\x89PNG\r\n\x1a\n...."), Some("image/png"));
        assert_eq!(sniff_image(b"RIFF\0\0\0\0WEBPVP8 "), Some("image/webp"));
        assert_eq!(sniff_image(b"\0\0\0\x1cftypavif\0\0"), Some("image/avif"));
        assert_eq!(sniff_image(b"<!doctype html><html>"), None);
    }

    #[test]
    fn referer_is_the_page_origin_only() {
        assert_eq!(referer_origin("https://elpais.com/espana/a.html?x=1").as_deref(), Some("https://elpais.com/"));
        assert_eq!(referer_origin("http://127.0.0.1:4570/a").as_deref(), Some("http://127.0.0.1:4570/"));
        assert_eq!(referer_origin("file:///c:/x"), None);
    }

    #[test]
    fn accepts_only_reasonable_images() {
        assert_eq!(check_image(200, Some("image/jpeg"), Some(1000)), Ok(()));
        assert_eq!(check_image(200, Some("text/html"), Some(10)), Err(415));
        assert_eq!(check_image(200, Some("application/octet-stream"), None), Ok(()), "content is sniffed later");
        assert_eq!(check_image(200, None, None), Ok(()));
        assert_eq!(check_image(404, Some("image/png"), None), Err(502));
        assert_eq!(check_image(200, Some("image/png"), Some(MAX_IMAGE_BYTES + 1)), Err(413));
    }
}

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

fn is_private_host(u: &Url) -> bool {
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

pub fn check_image(status: u16, content_type: Option<&str>, len: Option<u64>) -> Result<(), u16> {
    if !(200..300).contains(&status) {
        return Err(502);
    }
    if !content_type.is_some_and(|c| c.trim().to_ascii_lowercase().starts_with("image/")) {
        return Err(415);
    }
    if len.is_some_and(|l| l > MAX_IMAGE_BYTES) {
        return Err(413);
    }
    Ok(())
}

fn status(code: u16) -> Response<Vec<u8>> {
    Response::builder().status(StatusCode::from_u16(code).unwrap_or(StatusCode::BAD_GATEWAY)).body(Vec::new()).expect("response")
}

async fn serve(app: AppHandle, path: String) -> Response<Vec<u8>> {
    let Some(target) = decode_target(&path) else { return status(400) };
    let ext = app.state::<Arc<ShellExtensions>>();
    let client = match ext.http_client(HttpPurpose::Content) {
        Ok(c) => c,
        Err(_) => return status(503), // p. ej. Tor no listo: nunca hay vuelta a directo
    };
    let resp = match client.get(target).timeout(Duration::from_secs(20)).send().await {
        Ok(r) => r,
        Err(_) => return status(502),
    };
    let ct = resp.headers().get(CONTENT_TYPE).and_then(|v| v.to_str().ok()).map(str::to_string);
    if let Err(code) = check_image(resp.status().as_u16(), ct.as_deref(), resp.content_length()) {
        return status(code);
    }
    match resp.bytes().await {
        Ok(b) if (b.len() as u64) <= MAX_IMAGE_BYTES => Response::builder()
            .status(200)
            .header(CONTENT_TYPE, ct.unwrap_or_default())
            .header("Cache-Control", "max-age=3600")
            .body(b.to_vec())
            .expect("response"),
        _ => status(413),
    }
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
    tauri::async_runtime::spawn(async move {
        responder.respond(serve(app, path).await);
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
    fn accepts_only_reasonable_images() {
        assert_eq!(check_image(200, Some("image/jpeg"), Some(1000)), Ok(()));
        assert_eq!(check_image(200, Some("text/html"), Some(10)), Err(415));
        assert_eq!(check_image(200, None, None), Err(415));
        assert_eq!(check_image(404, Some("image/png"), None), Err(502));
        assert_eq!(check_image(200, Some("image/png"), Some(MAX_IMAGE_BYTES + 1)), Err(413));
    }
}

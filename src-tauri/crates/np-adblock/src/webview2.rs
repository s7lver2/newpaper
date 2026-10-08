//! Intercepción de peticiones de las webviews de contenido (WebView2, Windows).

use std::sync::{Arc, Mutex};

use webview2_com::{
    take_pwstr, Microsoft::Web::WebView2::Win32::*, NavigationStartingEventHandler,
    WebResourceRequestedEventHandler,
};
use windows::core::{Interface, HSTRING, PWSTR};

use crate::{blocker::ResourceType, service::AdblockService};

pub fn map_context(ctx: COREWEBVIEW2_WEB_RESOURCE_CONTEXT) -> ResourceType {
    match ctx {
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT => ResourceType::Document,
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_STYLESHEET => ResourceType::Stylesheet,
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_IMAGE => ResourceType::Image,
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_MEDIA => ResourceType::Media,
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FONT => ResourceType::Font,
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_SCRIPT => ResourceType::Script,
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_XML_HTTP_REQUEST => ResourceType::Xhr,
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FETCH => ResourceType::Fetch,
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_WEBSOCKET => ResourceType::Websocket,
        COREWEBVIEW2_WEB_RESOURCE_CONTEXT_PING => ResourceType::Ping,
        _ => ResourceType::Other,
    }
}

/// Instala el filtro `*` y el manejador en la webview de contenido de `tab`.
/// Se llama desde `ContentWebviewHook::on_content_webview_created` (antes de navegar).
pub fn attach(webview: &tauri::Webview, tab: u64, svc: Arc<AdblockService>) -> tauri::Result<()> {
    webview.with_webview(move |pw| {
        // SAFETY: llamadas COM sobre objetos válidos, en el hilo de la UI (with_webview).
        if let Err(e) = unsafe { install(pw.controller(), pw.environment(), tab, svc) } {
            tracing::error!(tab, error = ?e, "failed to install WebResourceRequested filter");
        }
    })
}

unsafe fn install(
    controller: ICoreWebView2Controller,
    env: ICoreWebView2Environment,
    tab: u64,
    svc: Arc<AdblockService>,
) -> windows::core::Result<()> {
    let core = controller.CoreWebView2()?;
    let filter = HSTRING::from("*");
    match core.cast::<ICoreWebView2_22>() {
        // Runtime reciente: incluye iframes y workers.
        Ok(core22) => core22.AddWebResourceRequestedFilterWithRequestSourceKinds(
            &filter,
            COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL,
            COREWEBVIEW2_WEB_RESOURCE_REQUEST_SOURCE_KINDS_ALL,
        )?,
        Err(_) => core.AddWebResourceRequestedFilter(&filter, COREWEBVIEW2_WEB_RESOURCE_CONTEXT_ALL)?,
    }

    // URI de la navegación del marco principal en curso (incluye redirecciones).
    let main_nav = Arc::new(Mutex::new(String::new()));
    let nav_slot = main_nav.clone();
    let mut token = 0i64;
    core.add_NavigationStarting(
        &NavigationStartingEventHandler::create(Box::new(move |_, args| {
            if let Some(args) = args {
                let mut uri = PWSTR::null();
                args.Uri(&mut uri)?;
                *nav_slot.lock().expect("nav lock") = take_pwstr(uri);
            }
            Ok(())
        })),
        &mut token,
    )?;

    core.add_WebResourceRequested(
        &WebResourceRequestedEventHandler::create(Box::new(move |sender, args| {
            let Some(args) = args else { return Ok(()) };
            let request = args.Request()?;

            let mut uri = PWSTR::null();
            request.Uri(&mut uri)?;
            let uri = take_pwstr(uri);

            let mut method = PWSTR::null();
            request.Method(&mut method)?;
            let method = take_pwstr(method);

            let mut ctx = COREWEBVIEW2_WEB_RESOURCE_CONTEXT::default();
            args.ResourceContext(&mut ctx)?;
            let mut kind = map_context(ctx);
            if kind == ResourceType::Document {
                if *main_nav.lock().expect("nav lock") == uri {
                    return Ok(()); // marco principal: nunca se bloquea
                }
                kind = ResourceType::Subdocument; // iframe
            }

            let source = match sender {
                Some(wv) => {
                    let mut src = PWSTR::null();
                    wv.Source(&mut src)?;
                    take_pwstr(src)
                }
                None => String::new(),
            };

            if svc.check(tab, &uri, &source, kind, &method) {
                let response = env.CreateWebResourceResponse(
                    None,
                    403,
                    &HSTRING::from("Blocked"),
                    &HSTRING::from("Content-Type: text/plain"),
                )?;
                args.SetResponse(&response)?;
            }
            Ok(())
        })),
        &mut token,
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_webview2_contexts() {
        assert_eq!(map_context(COREWEBVIEW2_WEB_RESOURCE_CONTEXT_SCRIPT), ResourceType::Script);
        assert_eq!(map_context(COREWEBVIEW2_WEB_RESOURCE_CONTEXT_IMAGE), ResourceType::Image);
        assert_eq!(map_context(COREWEBVIEW2_WEB_RESOURCE_CONTEXT_XML_HTTP_REQUEST), ResourceType::Xhr);
        assert_eq!(map_context(COREWEBVIEW2_WEB_RESOURCE_CONTEXT_FETCH), ResourceType::Fetch);
        assert_eq!(map_context(COREWEBVIEW2_WEB_RESOURCE_CONTEXT_DOCUMENT), ResourceType::Document);
        assert_eq!(map_context(COREWEBVIEW2_WEB_RESOURCE_CONTEXT_PING), ResourceType::Ping);
        assert_eq!(map_context(COREWEBVIEW2_WEB_RESOURCE_CONTEXT_MANIFEST), ResourceType::Other);
    }
}

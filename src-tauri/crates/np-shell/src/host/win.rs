//! Eventos nativos de WebView2: WebMessageReceived, NavigationCompleted y ProcessFailed.
//! Patrón copiado de wry 0.57 (src/webview2/mod.rs). Si una ruta de tipo no compila con
//! webview2-com 0.39 / windows 0.62, usa la misma que wry; no cambies la lógica.
use std::sync::Arc;

use tauri::{AppHandle, Manager, Webview};
use webview2_com::{
    take_pwstr,
    Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2NavigationCompletedEventArgs2, COREWEBVIEW2_PROCESS_FAILED_KIND,
        COREWEBVIEW2_WEB_ERROR_STATUS,
    },
    NavigationCompletedEventHandler, ProcessFailedEventHandler, WebMessageReceivedEventHandler,
};
use windows::core::{Interface, BOOL, HSTRING, PWSTR};

use super::{NavOutcome, TabManager};
use crate::TabId;

pub(super) fn attach(app: &AppHandle, tab: TabId, webview: &Webview) -> tauri::Result<()> {
    let app = app.clone();
    webview.with_webview(move |pw| unsafe {
        let Ok(core) = pw.controller().CoreWebView2() else {
            tracing::error!(tab, "CoreWebView2 unavailable");
            return;
        };
        if let Err(e) = register(&core, app, tab) {
            tracing::error!(tab, error = ?e, "failed to register WebView2 handlers");
        }
    })
}

unsafe fn register(core: &ICoreWebView2, app: AppHandle, tab: TabId) -> windows::core::Result<()> {
    let mut token = 0i64;

    let a = app.clone();
    let on_message = WebMessageReceivedEventHandler::create(Box::new(move |sender, args| {
        let (Some(sender), Some(args)) = (sender, args) else { return Ok(()) };
        let mut src = PWSTR::null();
        args.Source(&mut src)?;
        let source = take_pwstr(src);
        let mut json = PWSTR::null();
        // El manejador IPC de wry corta la cadena de manejadores si el mensaje no es una cadena,
        // así que el script de contenido envía el JSON serializado como texto.
        args.TryGetWebMessageAsString(&mut json)?;
        let raw = take_pwstr(json);
        let reply = a.state::<Arc<TabManager>>().handle_raw_message(tab, &raw, &source);
        if let Some(v) = reply {
            let _ = sender.PostWebMessageAsJson(&HSTRING::from(v.to_string()));
        }
        Ok(())
    }));
    core.add_WebMessageReceived(&on_message, &mut token)?;

    let a = app.clone();
    let on_completed = NavigationCompletedEventHandler::create(Box::new(move |sender, args| {
        let (Some(sender), Some(args)) = (sender, args) else { return Ok(()) };
        let mut ok = BOOL::default();
        args.IsSuccess(&mut ok)?;
        let mut status = COREWEBVIEW2_WEB_ERROR_STATUS::default();
        args.WebErrorStatus(&mut status)?;
        let http = args.cast::<ICoreWebView2NavigationCompletedEventArgs2>().ok().and_then(|a2| {
            let mut code = 0i32;
            a2.HttpStatusCode(&mut code).ok().map(|_| code)
        });
        let mut back = BOOL::default();
        sender.CanGoBack(&mut back)?;
        let mut fwd = BOOL::default();
        sender.CanGoForward(&mut fwd)?;
        let mut uri = PWSTR::null();
        sender.Source(&mut uri)?;
        a.state::<Arc<TabManager>>().on_navigation_completed(
            tab,
            NavOutcome {
                url: take_pwstr(uri),
                success: ok.as_bool(),
                web_error_status: status.0,
                http_status: http.filter(|c| *c > 0).map(|c| c as u16),
                can_go_back: back.as_bool(),
                can_go_forward: fwd.as_bool(),
            },
        );
        Ok(())
    }));
    core.add_NavigationCompleted(&on_completed, &mut token)?;

    let a = app;
    let on_failed = ProcessFailedEventHandler::create(Box::new(move |_sender, args| {
        let Some(args) = args else { return Ok(()) };
        let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND::default();
        args.ProcessFailedKind(&mut kind)?;
        a.state::<Arc<TabManager>>().on_process_failed(tab, kind.0);
        Ok(())
    }));
    core.add_ProcessFailed(&on_failed, &mut token)?;
    Ok(())
}

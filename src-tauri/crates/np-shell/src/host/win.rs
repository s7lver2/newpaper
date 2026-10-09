//! Eventos nativos de WebView2: WebMessageReceived, NavigationCompleted y ProcessFailed.
//! Patrón copiado de wry 0.57 (src/webview2/mod.rs). Si una ruta de tipo no compila con
//! webview2-com 0.39 / windows 0.62, usa la misma que wry; no cambies la lógica.
use std::sync::Arc;

use tauri::{AppHandle, Manager, Webview};
use windows::Win32::System::Com::{StructuredStorage::CreateStreamOnHGlobal, IStream, STREAM_SEEK_SET};
use windows::Win32::Foundation::HGLOBAL;
use webview2_com::{
    take_pwstr,
    Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2NavigationCompletedEventArgs2, ICoreWebView2Settings2, ICoreWebView2Settings3,
        ICoreWebView2Settings4, ICoreWebView2Settings6, ICoreWebView2Settings8, ICoreWebView2_11, ICoreWebView2_13, ICoreWebView2_4, COREWEBVIEW2_CONTEXT_MENU_TARGET_KIND_AUDIO,
        COREWEBVIEW2_CONTEXT_MENU_TARGET_KIND_IMAGE, COREWEBVIEW2_CONTEXT_MENU_TARGET_KIND_SELECTED_TEXT,
        COREWEBVIEW2_CONTEXT_MENU_TARGET_KIND_VIDEO, COREWEBVIEW2_PREFERRED_COLOR_SCHEME_DARK, COREWEBVIEW2_PREFERRED_COLOR_SCHEME_LIGHT,
        COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG, COREWEBVIEW2_PERMISSION_STATE_DENY, COREWEBVIEW2_PROCESS_FAILED_KIND, COREWEBVIEW2_WEB_ERROR_STATUS,
    },
    CapturePreviewCompletedHandler, ContextMenuRequestedEventHandler, DownloadStartingEventHandler, NavigationCompletedEventHandler,
    NavigationStartingEventHandler, NewWindowRequestedEventHandler, PermissionRequestedEventHandler, ProcessFailedEventHandler,
    WebMessageReceivedEventHandler,
};
use windows::core::{Interface, BOOL, HSTRING, PWSTR};

use super::{events::ContextInfo, NavOutcome, TabManager};
use crate::TabId;

pub(super) fn attach(app: &AppHandle, tab: TabId, webview: &Webview) -> tauri::Result<()> {
    let app = app.clone();
    let label = webview.label().to_string();
    webview.with_webview(move |pw| unsafe {
        let Ok(core) = pw.controller().CoreWebView2() else {
            tracing::error!(tab, "CoreWebView2 unavailable");
            return;
        };
        if let Err(e) = register(&core, app, tab, label) {
            tracing::error!(tab, error = ?e, "failed to register WebView2 handlers");
        }
    })
}

/// Quita las marcas de Edge/WebView2 del user agent (`Edg/...`): la app se presenta como un Chromium genérico.
pub(super) fn sanitize_user_agent(ua: &str) -> String {
    ua.split(' ').filter(|t| !t.starts_with("Edg/") && !t.starts_with("EdgA/") && !t.contains("WebView2")).collect::<Vec<_>>().join(" ")
}

/// ¿Se dejan las teclas del navegador (F12, Ctrl+U...) y las herramientas de desarrollo?
/// Solo en desarrollo y si se pide con `NP_DEVTOOLS`.
fn dev_tools_allowed() -> bool {
    cfg!(debug_assertions) && std::env::var_os("NP_DEVTOOLS").is_some()
}

/// Ajustes de `ICoreWebView2Settings` para que no se note Edge: sin menú nativo, página de error,
/// barra de estado, autocompletado, contraseñas, gestos, SmartScreen ni teclas de navegador.
/// Se aplican a la UI y a las webviews de contenido.
pub(super) unsafe fn harden(core: &ICoreWebView2) -> windows::core::Result<()> {
    let s = core.Settings()?;
    let dev = dev_tools_allowed();
    s.SetAreDefaultContextMenusEnabled(false)?;
    s.SetIsStatusBarEnabled(false)?;
    s.SetIsBuiltInErrorPageEnabled(false)?;
    s.SetAreDevToolsEnabled(dev)?;
    if let Ok(s2) = s.cast::<ICoreWebView2Settings2>() {
        let mut ua = PWSTR::null();
        if s2.UserAgent(&mut ua).is_ok() {
            let clean = sanitize_user_agent(&take_pwstr(ua));
            let _ = s2.SetUserAgent(&HSTRING::from(clean));
        }
    }
    if let Ok(s3) = s.cast::<ICoreWebView2Settings3>() {
        s3.SetAreBrowserAcceleratorKeysEnabled(dev)?;
    }
    if let Ok(s4) = s.cast::<ICoreWebView2Settings4>() {
        s4.SetIsGeneralAutofillEnabled(false)?;
        s4.SetIsPasswordAutosaveEnabled(false)?;
    }
    if let Ok(s6) = s.cast::<ICoreWebView2Settings6>() {
        s6.SetIsSwipeNavigationEnabled(false)?;
    }
    if let Ok(s8) = s.cast::<ICoreWebView2Settings8>() {
        s8.SetIsReputationCheckingRequired(false)?;
    }
    Ok(())
}

/// `prefers-color-scheme` de las páginas sigue el tema de la app, no el del sistema:
/// una web con modo oscuro no debe pintarse negra dentro de la app en papel.
pub(super) fn set_color_scheme(webview: &Webview, dark: bool) {
    let _ = webview.with_webview(move |pw| unsafe {
        let Ok(core) = pw.controller().CoreWebView2() else { return };
        if let Ok(c13) = core.cast::<ICoreWebView2_13>() {
            if let Ok(profile) = c13.Profile() {
                let scheme = if dark { COREWEBVIEW2_PREFERRED_COLOR_SCHEME_DARK } else { COREWEBVIEW2_PREFERRED_COLOR_SCHEME_LIGHT };
                let _ = profile.SetPreferredColorScheme(scheme);
            }
        }
    });
}

unsafe fn read_stream(stream: &IStream) -> Option<Vec<u8>> {
    stream.Seek(0, STREAM_SEEK_SET, None).ok()?;
    let mut out = Vec::new();
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let mut read = 0u32;
        stream.Read(buf.as_mut_ptr().cast(), buf.len() as u32, Some(&mut read)).ok().ok()?;
        if read == 0 {
            break;
        }
        out.extend_from_slice(&buf[..read as usize]);
    }
    (!out.is_empty()).then_some(out)
}

/// PNG de lo que la webview tiene pintado (`CapturePreview`); `None` si falla.
pub(super) fn capture_png(webview: &Webview) -> tokio::sync::oneshot::Receiver<Option<Vec<u8>>> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let slot = Arc::new(std::sync::Mutex::new(Some(tx)));
    let finish = {
        let slot = slot.clone();
        move |v: Option<Vec<u8>>| {
            if let Some(t) = slot.lock().expect("capture slot").take() {
                let _ = t.send(v);
            }
        }
    };
    let f = finish.clone();
    let queued = webview.with_webview(move |pw| unsafe {
        let Ok(core) = pw.controller().CoreWebView2() else { return f(None) };
        let Ok(stream) = CreateStreamOnHGlobal(HGLOBAL::default(), true) else { return f(None) };
        let s2 = stream.clone();
        let f2 = f.clone();
        let handler = CapturePreviewCompletedHandler::create(Box::new(move |res| {
            f2(if res.is_ok() { read_stream(&s2) } else { None });
            Ok(())
        }));
        if core.CapturePreview(COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_PNG, &stream, &handler).is_err() {
            f(None);
        }
    });
    if queued.is_err() {
        finish(None);
    }
    rx
}

/// Texto del portapapeles de Windows (CF_UNICODETEXT), para pegar desde el menú propio sin
/// pedir el permiso de portapapeles del navegador.
pub fn clipboard_text() -> Option<String> {
    use windows::Win32::System::{
        DataExchange::{CloseClipboard, GetClipboardData, OpenClipboard},
        Memory::{GlobalLock, GlobalUnlock},
    };
    unsafe {
        OpenClipboard(None).ok()?;
        let text = (|| {
            let handle = GetClipboardData(13).ok()?; // CF_UNICODETEXT
            let mem = HGLOBAL(handle.0);
            let ptr = GlobalLock(mem) as *const u16;
            if ptr.is_null() {
                return None;
            }
            let mut len = 0usize;
            while *ptr.add(len) != 0 {
                len += 1;
            }
            let s = String::from_utf16_lossy(std::slice::from_raw_parts(ptr, len));
            let _ = GlobalUnlock(mem);
            Some(s)
        })();
        let _ = CloseClipboard();
        text
    }
}

/// Ajustes de la webview de interfaz (`ui`).
pub fn harden_ui(webview: &Webview) -> tauri::Result<()> {
    webview.with_webview(|pw| unsafe {
        match pw.controller().CoreWebView2() {
            Ok(core) => {
                if let Err(e) = harden(&core) {
                    tracing::error!(error = ?e, "failed to harden the UI webview");
                }
            }
            Err(e) => tracing::error!(error = ?e, "CoreWebView2 unavailable for the UI webview"),
        }
    })
}

unsafe fn register(core: &ICoreWebView2, app: AppHandle, tab: TabId, label: String) -> windows::core::Result<()> {
    let mut token = 0i64;
    harden(core)?;

    // Permisos del sitio (cámara, ubicación, notificaciones...): no hay UI propia todavía, así que se deniegan.
    core.add_PermissionRequested(
        &PermissionRequestedEventHandler::create(Box::new(|_, args| {
            if let Some(args) = args {
                args.SetState(COREWEBVIEW2_PERMISSION_STATE_DENY)?;
            }
            Ok(())
        })),
        &mut token,
    )?;

    // Descargas: sin gestor propio aún, se cancelan sin mostrar la burbuja de Edge.
    if let Ok(core4) = core.cast::<ICoreWebView2_4>() {
        core4.add_DownloadStarting(
            &DownloadStartingEventHandler::create(Box::new(|_, args| {
                if let Some(args) = args {
                    args.SetCancel(true)?;
                    args.SetHandled(true)?;
                }
                Ok(())
            })),
            &mut token,
        )?;
    }

    // `window.open` / `target=_blank`: nunca una ventana de Edge; se abre una pestaña propia.
    let a = app.clone();
    core.add_NewWindowRequested(
        &NewWindowRequestedEventHandler::create(Box::new(move |_, args| {
            let Some(args) = args else { return Ok(()) };
            args.SetHandled(true)?;
            let mut user = BOOL::default();
            args.IsUserInitiated(&mut user)?;
            let mut uri = PWSTR::null();
            args.Uri(&mut uri)?;
            let uri = take_pwstr(uri);
            if user.as_bool() {
                a.state::<Arc<TabManager>>().open_from_popup(tab, uri);
            }
            Ok(())
        })),
        &mut token,
    )?;

    // Menú contextual propio: el nativo está desactivado; se pasa el contexto a la UI.
    if let Ok(c11) = core.cast::<ICoreWebView2_11>() {
        let a = app.clone();
        let l = label.clone();
        c11.add_ContextMenuRequested(
            &ContextMenuRequestedEventHandler::create(Box::new(move |_, args| {
                let Some(args) = args else { return Ok(()) };
                args.SetHandled(true)?;
                let target = args.ContextMenuTarget()?;
                let mut kind = Default::default();
                target.Kind(&mut kind)?;
                let mut editable = BOOL::default();
                target.IsEditable(&mut editable)?;
                let text = |get: &dyn Fn(&mut PWSTR) -> windows::core::Result<()>| -> Option<String> {
                    let mut p = PWSTR::null();
                    get(&mut p).ok()?;
                    let s = take_pwstr(p);
                    (!s.is_empty()).then_some(s)
                };
                let mut has = BOOL::default();
                target.HasLinkUri(&mut has)?;
                let link = if has.as_bool() { text(&|p| unsafe { target.LinkUri(p) }) } else { None };
                target.HasSourceUri(&mut has)?;
                let source = if has.as_bool() { text(&|p| unsafe { target.SourceUri(p) }) } else { None };
                target.HasSelection(&mut has)?;
                let selection = if has.as_bool() { text(&|p| unsafe { target.SelectionText(p) }) } else { None };
                let page_url = text(&|p| unsafe { target.PageUri(p) }).unwrap_or_default();
                let mut pt = windows::Win32::Foundation::POINT::default();
                args.Location(&mut pt)?;
                let kind = if kind == COREWEBVIEW2_CONTEXT_MENU_TARGET_KIND_IMAGE {
                    "image"
                } else if kind == COREWEBVIEW2_CONTEXT_MENU_TARGET_KIND_SELECTED_TEXT {
                    "selection"
                } else if kind == COREWEBVIEW2_CONTEXT_MENU_TARGET_KIND_AUDIO {
                    "audio"
                } else if kind == COREWEBVIEW2_CONTEXT_MENU_TARGET_KIND_VIDEO {
                    "video"
                } else {
                    "page"
                };
                let info = ContextInfo { kind, link, source, selection, editable: editable.as_bool(), page_url, x: pt.x as f64, y: pt.y as f64 };
                a.state::<Arc<TabManager>>().on_context_menu(tab, &l, info);
                Ok(())
            })),
            &mut token,
        )?;
    }

    let a = app.clone();
    let l = label.clone();
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
        let reply = a.state::<Arc<TabManager>>().handle_raw_message(tab, &l, &raw, &source);
        if let Some(v) = reply {
            let _ = sender.PostWebMessageAsJson(&HSTRING::from(v.to_string()));
        }
        Ok(())
    }));
    core.add_WebMessageReceived(&on_message, &mut token)?;

    // Cada navegación lleva un id creciente: así se sabe qué eventos de fin son de una navegación ya superada
    // por otra (atrás, atrás, atrás...).
    let a = app.clone();
    let l = label.clone();
    let on_starting = NavigationStartingEventHandler::create(Box::new(move |_, args| {
        let Some(args) = args else { return Ok(()) };
        let mut nav_id = 0u64;
        args.NavigationId(&mut nav_id)?;
        a.state::<Arc<TabManager>>().on_navigation_starting(tab, &l, nav_id);
        Ok(())
    }));
    core.add_NavigationStarting(&on_starting, &mut token)?;

    let a = app.clone();
    let l = label.clone();
    let on_completed = NavigationCompletedEventHandler::create(Box::new(move |sender, args| {
        let (Some(sender), Some(args)) = (sender, args) else { return Ok(()) };
        let mut nav_id = 0u64;
        args.NavigationId(&mut nav_id)?;
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
            &l,
            NavOutcome {
                url: take_pwstr(uri),
                navigation_id: nav_id,
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
        a.state::<Arc<TabManager>>().on_process_failed(tab, &label, kind.0);
        Ok(())
    }));
    core.add_ProcessFailed(&on_failed, &mut token)?;
    Ok(())
}

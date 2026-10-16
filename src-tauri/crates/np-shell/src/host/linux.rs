//! Anfitrión de webviews en Linux (WebKitGTK 4.1 vía `with_webview`). Equivale a `win.rs` para WebView2.
//!
//! **Nada de este módulo se ha podido ejecutar todavía en una máquina Linux real** (se desarrolla en Windows; solo se
//! comprueba que compila). Ver `docs/superpowers/plans/2026-10-16-linux-auditoria.md` para la lista de pruebas.
//!
//! Qué resuelve, y por qué existe:
//! - **Disposición (`Stage`)**: Tauri 2.12 mete todas las webviews hijas en un `gtk::Box` vertical
//!   (`pack_start(expand)`), y `set_position`/`set_size` no hacen nada ahí (wry solo sabe posicionar dentro de un
//!   `gtk::Fixed`). Sin esto, la UI y cada pestaña se repartirían la ventana en vertical. Se reubican en un
//!   `gtk::Overlay`: la UI es el hijo principal (ocupa todo) y cada pestaña es un hijo superpuesto, colocado con
//!   márgenes y `size_request`.
//! - **Mensajes de contenido**: WebKitGTK no tiene `window.chrome.webview`; se instala un puente con el mismo nombre
//!   sobre `window.webkit.messageHandlers.npcontent` y las respuestas se entregan con `__np_deliver`.
//! - **Privacidad**: permisos y descargas denegados, `window.open` abre pestaña propia, WebRTC/medios fuera en Tor y
//!   el proxy SOCKS de Tor se (re)aplica y se **verifica**: si no se puede garantizar, la webview no se crea.
use std::{cell::Cell, cell::RefCell, rc::Rc, sync::Arc};

use gtk::prelude::*;
use javascriptcore::ValueExt;
use tauri::{AppHandle, Manager, Webview};
use webkit2gtk::{
    glib, gio, HitTestResultExt, LoadEvent, NetworkProxyMode, NetworkProxySettings, PermissionRequestExt,
    PolicyDecisionExt, PolicyDecisionType, ResponsePolicyDecision, ResponsePolicyDecisionExt, SettingsExt, SnapshotOptions, SnapshotRegion,
    URIRequestExt, URIResponseExt, UserContentManagerExt, WebContextExt, WebResourceExt, WebViewExt, WebsiteDataManagerExt,
};

use super::{events::ContextInfo, NavOutcome, TabManager};
use crate::TabId;

/// Nombre del manejador de mensajes de WebKit (`window.webkit.messageHandlers.npcontent`).
const MESSAGE_HANDLER: &str = "npcontent";

/// `COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED` (`navigation::judge` lo trata como "superada por otra").
const ERR_CANCELED: i32 = crate::navigation::WEB_ERROR_OPERATION_CANCELED;
/// Cualquier otro fallo de carga (`navigation::judge` lo muestra como error).
const ERR_FAILED: i32 = 6;

/// Puente `window.chrome.webview` para los scripts de contenido (`content.ts`, `cosmetic.js`, `READY_SCRIPT`).
/// Debe ir **antes** que ellos. En el `about:blank` inicial el manejador aún no existe: no define nada y vuelve a
/// ejecutarse en la primera navegación real.
pub const BRIDGE_SHIM: &str = r#"(() => {
  if (window.chrome && window.chrome.webview) return;
  const h = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.npcontent;
  if (!h) return;
  const listeners = new Set();
  const bridge = {
    postMessage(m) { h.postMessage(typeof m === 'string' ? m : JSON.stringify(m)); },
    addEventListener(t, f) { if (t === 'message' && typeof f === 'function') listeners.add(f); },
    removeEventListener(t, f) { listeners.delete(f); },
  };
  Object.defineProperty(bridge, '__np_deliver', { value(d) { for (const f of Array.from(listeners)) { try { f({ data: d }); } catch (e) {} } } });
  window.chrome = window.chrome || {};
  window.chrome.webview = bridge;
})();"#;

/// En Tor, el DNS lo resuelve el proxy; un `<link rel=dns-prefetch>` haría una consulta local. Se quitan (mejor esfuerzo:
/// WebKitGTK no tiene un ajuste para apagar el prefetch de DNS de las etiquetas `link`).
pub const NO_PREFETCH_SHIM: &str = r#"(() => {
  const bad = (n) => n && n.nodeType === 1 && n.tagName === 'LINK' && /(^|\s)(dns-prefetch|preconnect|prefetch|prerender)(\s|$)/i.test(n.getAttribute('rel') || '');
  const sweep = (root) => { try { root.querySelectorAll('link[rel]').forEach((n) => { if (bad(n)) n.remove(); }); } catch (e) {} };
  new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) { if (bad(n)) n.remove(); else if (n.querySelectorAll) sweep(n); } })
    .observe(document, { childList: true, subtree: true });
  sweep(document);
})();"#;

fn dev_tools_allowed() -> bool {
    cfg!(debug_assertions) && std::env::var_os("NP_DEVTOOLS").is_some()
}

// ---------------------------------------------------------------------------------------------------------
// Disposición: gtk::Overlay
// ---------------------------------------------------------------------------------------------------------

thread_local! {
    /// El `Overlay` de la ventana principal (solo se toca desde el hilo de GTK).
    static STAGE: RefCell<Option<gtk::Overlay>> = const { RefCell::new(None) };
}

/// Desplazamiento fuera de la vista (GTK no admite márgenes negativos).
const OFFSCREEN: i32 = 30_000;

fn clamp_i32(v: f64, min: i32) -> i32 {
    if v.is_finite() { (v.round() as i64).clamp(min as i64, 32_000) as i32 } else { min }
}

/// Coloca una webview (hija del `Overlay`) en un rectángulo lógico. Una `x`/`y` negativa significa "fuera de la vista"
/// (la transición entre páginas la aparta sin ocultarla para que siga pintando).
fn apply_bounds(wv: &webkit2gtk::WebView, x: f64, y: f64, w: f64, h: f64) {
    let off = x < 0.0 || y < 0.0;
    wv.set_halign(gtk::Align::Start);
    wv.set_valign(gtk::Align::Start);
    wv.set_margin_start(if off { OFFSCREEN } else { clamp_i32(x, 0) });
    wv.set_margin_top(if off { OFFSCREEN } else { clamp_i32(y, 0) });
    wv.set_size_request(clamp_i32(w, 1), clamp_i32(h, 1));
    wv.queue_resize();
}

/// Reubica la webview de interfaz como hijo principal de un `Overlay` que ocupa toda la ventana.
fn adopt_ui_inner(wv: &webkit2gtk::WebView) -> Result<(), String> {
    let parent = wv.parent().ok_or("the UI webview has no parent")?;
    let vbox = parent.downcast::<gtk::Box>().map_err(|_| "the UI webview parent is not a GtkBox".to_string())?;
    let overlay = gtk::Overlay::new();
    vbox.remove(wv);
    overlay.add(wv);
    vbox.pack_start(&overlay, true, true, 0);
    overlay.show_all();
    STAGE.with(|s| *s.borrow_mut() = Some(overlay));
    Ok(())
}

/// Reubica una webview de pestaña (recién añadida al `Box` por Tauri) como hijo superpuesto del `Overlay`.
fn adopt_tab_inner(wv: &webkit2gtk::WebView, rect: (f64, f64, f64, f64)) -> Result<(), String> {
    let overlay = STAGE.with(|s| s.borrow().clone()).ok_or("the window stage is not ready")?;
    if let Some(parent) = wv.parent() {
        if let Ok(container) = parent.downcast::<gtk::Container>() {
            container.remove(wv);
        }
    }
    apply_bounds(wv, rect.0, rect.1, rect.2, rect.3);
    overlay.add_overlay(wv);
    overlay.set_overlay_pass_through(wv, false);
    Ok(())
}

/// Mueve y redimensiona la webview de una pestaña. Sustituye a `Webview::set_bounds`, que en Linux no hace nada.
pub(super) fn set_bounds(webview: &Webview, x: f64, y: f64, w: f64, h: f64) {
    let _ = webview.with_webview(move |pw| apply_bounds(&pw.inner(), x, y, w, h));
}

// ---------------------------------------------------------------------------------------------------------
// Ajustes comunes
// ---------------------------------------------------------------------------------------------------------

/// Sin menús, autorrelleno ni herramientas de desarrollo (salvo `NP_DEVTOOLS` en depuración). En Tor, además, sin
/// WebRTC ni captura de medios (equivale a `--force-webrtc-ip-handling-policy`).
fn harden(wv: &webkit2gtk::WebView, tor: bool) {
    let Some(s) = WebViewExt::settings(wv) else { return };
    s.set_enable_developer_extras(dev_tools_allowed());
    s.set_enable_write_console_messages_to_stdout(false);
    s.set_enable_back_forward_navigation_gestures(false);
    if tor {
        s.set_enable_webrtc(false);
        s.set_enable_media_stream(false);
        s.set_enable_media_capabilities(false);
    }
}

/// Fija el proxy de la webview (`socks5://127.0.0.1:<puerto>`) en su `WebsiteDataManager` y falla si no se puede.
/// Con un proxy `Custom` WebKit no cae a conexión directa: si el SOCKS local está cerrado (kill switch), la carga falla.
fn enforce_proxy(wv: &webkit2gtk::WebView, proxy: &str) -> Result<(), String> {
    let manager = wv.website_data_manager().ok_or("the webview has no website data manager")?;
    let mut settings = NetworkProxySettings::new(Some(proxy), &[]);
    manager.set_network_proxy_settings(NetworkProxyMode::Custom, Some(&mut settings));
    Ok(())
}

// ---------------------------------------------------------------------------------------------------------
// Webview de interfaz
// ---------------------------------------------------------------------------------------------------------

/// Webview de interfaz: se reubica en el `Overlay` y se endurece. Equivale a `win::harden_ui`.
pub fn harden_ui(webview: &Webview) -> tauri::Result<()> {
    // Versión de WebKitGTK en ejecución: la app se prueba con >= 2.40 (`libwebkit2gtk-4.1`).
    let (major, minor, micro) = unsafe {
        (
            webkit2gtk::ffi::webkit_get_major_version(),
            webkit2gtk::ffi::webkit_get_minor_version(),
            webkit2gtk::ffi::webkit_get_micro_version(),
        )
    };
    if (major, minor) < (2, 40) {
        tracing::error!("WebKitGTK {major}.{minor}.{micro} is older than the supported 2.40: parts of newpaper will not work");
    } else {
        tracing::info!("WebKitGTK {major}.{minor}.{micro}");
    }
    webview.with_webview(|pw| {
        let wv = pw.inner();
        if let Err(e) = adopt_ui_inner(&wv) {
            tracing::error!(error = %e, "could not lay out the UI webview: tabs will not be positioned");
        }
        harden(&wv, false);
        // Sin el menú contextual nativo de WebKit en la interfaz.
        wv.connect_context_menu(|_, _, _, _| true);
    })
}

// ---------------------------------------------------------------------------------------------------------
// Webviews de contenido
// ---------------------------------------------------------------------------------------------------------

/// Respuesta del anfitrión a un script de contenido (`PostWebMessageAsJson` en WebView2).
fn deliver(app: &AppHandle, label: &str, value: &serde_json::Value) {
    let Some(webview) = app.get_webview(label) else { return };
    let js = format!("window.chrome&&window.chrome.webview&&window.chrome.webview.__np_deliver&&window.chrome.webview.__np_deliver({value});");
    let _ = webview.eval(&js);
}

/// Prepara la webview de una pestaña: la coloca en el `Overlay`, la endurece y conecta los eventos. Devuelve el
/// resultado por `done` para que el llamador pueda **fallar cerrado** (sin proxy en Tor no se carga nada).
/// `proxy`: URL SOCKS5 obligatoria si la pestaña va por Tor.
pub(super) fn attach(
    app: &AppHandle,
    tab: TabId,
    webview: &Webview,
    rect: (f64, f64, f64, f64),
    proxy: Option<String>,
    done: tokio::sync::oneshot::Sender<Result<(), String>>,
) {
    let app = app.clone();
    let label = webview.label().to_string();
    let queued = webview.with_webview(move |pw| {
        let wv = pw.inner();
        let result = (|| {
            adopt_tab_inner(&wv, rect)?;
            harden(&wv, proxy.is_some());
            if let Some(p) = &proxy {
                enforce_proxy(&wv, p)?;
            }
            register(&wv, app, tab, label);
            if let Some(ucm) = wv.user_content_manager() {
                track_manager(&ucm);
            }
            Ok(())
        })();
        let _ = done.send(result);
    });
    if let Err(e) = queued {
        tracing::error!(tab, error = %e, "could not queue the Linux webview setup");
    }
}

fn register(wv: &webkit2gtk::WebView, app: AppHandle, tab: TabId, label: String) {
    // Permisos del sitio (cámara, ubicación, notificaciones...): no hay UI propia todavía, así que se deniegan.
    wv.connect_permission_request(|_, req| {
        req.deny();
        true
    });

    // Descargas: sin gestor propio aún. Lo que el motor no sabe mostrar se ignora, y las descargas se cancelan.
    wv.connect_decide_policy(|_, decision, kind| {
        if kind == PolicyDecisionType::Response {
            if let Some(r) = decision.downcast_ref::<ResponsePolicyDecision>() {
                if !r.is_mime_type_supported() {
                    decision.ignore();
                    return true;
                }
            }
        }
        false
    });
    if let Some(ctx) = wv.context() {
        use std::collections::HashSet;
        thread_local! { static SEEN: RefCell<HashSet<usize>> = RefCell::new(HashSet::new()); }
        let key = glib::translate::ToGlibPtr::<*mut webkit2gtk::ffi::WebKitWebContext>::to_glib_none(&ctx).0 as usize;
        if SEEN.with(|s| s.borrow_mut().insert(key)) {
            ctx.connect_download_started(|_, download| {
                use webkit2gtk::DownloadExt;
                download.cancel();
            });
        }
    }

    // `window.open` / `target=_blank`: nunca una ventana del motor; se abre una pestaña propia si hubo gesto del usuario.
    let a = app.clone();
    wv.connect_create(move |_, action| {
        let action = action.clone();
        if action.is_user_gesture() {
            if let Some(uri) = action.request().and_then(|r| r.uri()) {
                a.state::<Arc<TabManager>>().open_from_popup(tab, uri.to_string());
            }
        }
        None
    });

    // Mensajes de los scripts de contenido (`chrome.webview.postMessage(JSON.stringify(..))`).
    if let Some(ucm) = wv.user_content_manager() {
        let a = app.clone();
        let l = label.clone();
        let w = wv.clone();
        ucm.connect_script_message_received(Some(MESSAGE_HANDLER), move |_, result| {
            let Some(js) = result.js_value() else { return };
            if !js.is_string() {
                return;
            }
            let raw = js.to_str().to_string();
            let source = w.uri().map(|u| u.to_string()).unwrap_or_default();
            if let Some(reply) = a.state::<Arc<TabManager>>().handle_raw_message(tab, &l, &raw, &source) {
                deliver(&a, &l, &reply);
            }
        });
        if !ucm.register_script_message_handler(MESSAGE_HANDLER) {
            tracing::error!(tab, "could not register the content message handler: the reader and cosmetic filters will not work");
        }
    }

    // Navegación: id creciente por pestaña, como el `NavigationId` de WebView2.
    let nav = Rc::new(Cell::new(0u64));
    let done = Rc::new(Cell::new(true));
    {
        let (a, l, nav, done) = (app.clone(), label.clone(), nav.clone(), done.clone());
        wv.connect_load_changed(move |w, event| {
            let uri = w.uri().map(|u| u.to_string()).unwrap_or_default();
            match event {
                LoadEvent::Started => {
                    nav.set(nav.get() + 1);
                    done.set(false);
                    a.state::<Arc<TabManager>>().on_navigation_starting(tab, &l, nav.get(), uri);
                }
                LoadEvent::Redirected => {
                    a.state::<Arc<TabManager>>().on_navigation_starting(tab, &l, nav.get(), uri);
                }
                LoadEvent::Finished if !done.get() => {
                    done.set(true);
                    let http = w.main_resource().and_then(|r| r.response()).map(|r| r.status_code()).filter(|c| *c > 0).map(|c| c as u16);
                    let outcome = outcome(w, uri, nav.get(), true, 0, http);
                    a.state::<Arc<TabManager>>().on_navigation_completed(tab, &l, outcome);
                }
                _ => {}
            }
        });
    }
    {
        let (a, l, nav, done) = (app.clone(), label.clone(), nav, done);
        wv.connect_load_failed(move |w, _event, uri, err| {
            if !done.get() {
                done.set(true);
                let cancelled = err.matches(webkit2gtk::NetworkError::Cancelled) || err.matches(webkit2gtk::PolicyError::FrameLoadInterruptedByPolicyChange);
                let outcome = outcome(w, uri.to_string(), nav.get(), false, if cancelled { ERR_CANCELED } else { ERR_FAILED }, None);
                a.state::<Arc<TabManager>>().on_navigation_completed(tab, &l, outcome);
            }
            true
        });
    }

    // Un proceso web caído: la UI ofrece recargar.
    {
        let (a, l) = (app.clone(), label.clone());
        wv.connect_web_process_terminated(move |_, reason| {
            use webkit2gtk::WebProcessTerminationReason as R;
            let kind = match reason {
                R::Crashed => 1,
                R::ExceededMemoryLimit => 2,
                _ => 0,
            };
            a.state::<Arc<TabManager>>().on_process_failed(tab, &l, kind);
        });
    }

    // Menú contextual propio: el nativo se suprime; se pasa el contexto a la UI.
    wv.connect_context_menu(move |w, _menu, event, hit| {
        let kind = if hit.context_is_image() {
            "image"
        } else if hit.context_is_media() {
            "video"
        } else if hit.context_is_selection() {
            "selection"
        } else {
            "page"
        };
        let link = hit.context_is_link().then(|| hit.link_uri().map(|u| u.to_string())).flatten();
        let source = if hit.context_is_image() { hit.image_uri() } else { hit.media_uri() }.map(|u| u.to_string());
        let (x, y) = event.coords().unwrap_or((0.0, 0.0));
        let mut info = ContextInfo {
            kind,
            link,
            source,
            selection: None,
            editable: hit.context_is_editable(),
            page_url: w.uri().map(|u| u.to_string()).unwrap_or_default(),
            x,
            y,
        };
        let (a, l) = (app.clone(), label.clone());
        let selected = hit.context_is_selection();
        if selected {
            // WebKitGTK no da el texto seleccionado en el evento: se pide a la página antes de enseñar el menú.
            w.evaluate_javascript("String(window.getSelection())", None, None, None::<&gio::Cancellable>, move |res| {
                info.selection = res.ok().filter(|v| v.is_string()).map(|v| v.to_str().to_string()).filter(|s| !s.is_empty());
                a.state::<Arc<TabManager>>().on_context_menu(tab, &l, info);
            });
        } else {
            a.state::<Arc<TabManager>>().on_context_menu(tab, &l, info);
        }
        true
    });
}

fn outcome(w: &webkit2gtk::WebView, url: String, nav_id: u64, success: bool, web_error_status: i32, http_status: Option<u16>) -> NavOutcome {
    NavOutcome {
        url,
        navigation_id: nav_id,
        success,
        web_error_status,
        http_status,
        can_go_back: w.can_go_back(),
        can_go_forward: w.can_go_forward(),
    }
}

// ---------------------------------------------------------------------------------------------------------
// Captura y portapapeles
// ---------------------------------------------------------------------------------------------------------

/// PNG de lo que la webview tiene pintado; `None` si falla (con la composición por GPU de algunos drivers puede
/// salir en blanco: la UI ya degrada a "sin captura").
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
    let queued = webview.with_webview(move |pw| {
        let wv = pw.inner();
        let f2 = f.clone();
        wv.snapshot(SnapshotRegion::Visible, SnapshotOptions::NONE, None::<&gio::Cancellable>, move |res| {
            f2(res.ok().and_then(|surface| {
                let image = cairo::ImageSurface::try_from(surface).ok()?;
                let mut out = Vec::new();
                image.write_to_png(&mut out).ok()?;
                (!out.is_empty()).then_some(out)
            }));
        });
    });
    if queued.is_err() {
        finish(None);
    }
    rx
}

/// Texto del portapapeles del sistema (para pegar desde el menú propio sin pedir permiso a la página).
pub fn clipboard_text(app: &AppHandle) -> Option<String> {
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let text = gtk::Clipboard::get(&gtk::gdk::SELECTION_CLIPBOARD).wait_for_text().map(|t| t.to_string());
        let _ = tx.send(text);
    })
    .ok()?;
    rx.recv_timeout(std::time::Duration::from_secs(2)).ok().flatten()
}

// ---------------------------------------------------------------------------------------------------------
// Bloqueo de contenido (WebKitUserContentFilter)
// ---------------------------------------------------------------------------------------------------------
//
// WebKitGTK no ofrece un gancho por petición (no hay `WebResourceRequested`). El bloqueo de red y el cosmético van como
// reglas de bloqueo de contenido que compila WebKit (`np_adblock::content_filter`). La envoltura segura de
// `webkit2gtk` 2.0.2 no incluye `UserContentFilter(Store)`, así que se usa la API C (`webkit2gtk::ffi`).

struct FilterState {
    /// Filtro compilado vigente (referencia propia; `webkit_user_content_filter_unref` al sustituirlo).
    filter: *mut webkit2gtk::ffi::WebKitUserContentFilter,
    /// Gestores de contenido de las webviews vivas, para sustituir el filtro cuando cambian las listas.
    managers: Vec<glib::WeakRef<webkit2gtk::UserContentManager>>,
    /// Número de la última petición: descarta compilaciones viejas que terminan tarde.
    generation: u64,
}

thread_local! {
    static FILTERS: RefCell<FilterState> = const { RefCell::new(FilterState { filter: std::ptr::null_mut(), managers: Vec::new(), generation: 0 }) };
}

/// Añade el filtro vigente (si hay) a un gestor de contenido y lo recuerda para futuras sustituciones.
fn track_manager(ucm: &webkit2gtk::UserContentManager) {
    FILTERS.with(|f| {
        let mut f = f.borrow_mut();
        f.managers.retain(|m| m.upgrade().is_some());
        f.managers.push(ucm.downgrade());
        if !f.filter.is_null() {
            unsafe { webkit2gtk::ffi::webkit_user_content_manager_add_filter(glib::translate::ToGlibPtr::to_glib_none(ucm).0, f.filter) };
        }
    });
}

/// Instala (`Some(json)`) o quita (`None`) el filtro de bloqueo en todas las webviews, presentes y futuras. Se puede
/// llamar desde cualquier hilo. La compilación es asíncrona (segundos con las listas completas): hasta entonces las
/// webviews nuevas cargan sin filtro.
pub fn set_content_filter(app: &AppHandle, storage_dir: std::path::PathBuf, json: Option<String>) {
    let _ = app.run_on_main_thread(move || unsafe { install_filter(storage_dir, json) });
}

unsafe fn install_filter(storage_dir: std::path::PathBuf, json: Option<String>) {
    use webkit2gtk::ffi;
    // Se quita lo anterior de inmediato (si las listas cambian, el filtro viejo no debe quedarse).
    let generation = FILTERS.with(|f| {
        let mut f = f.borrow_mut();
        f.generation += 1;
        for m in f.managers.iter().filter_map(|m| m.upgrade()) {
            m.remove_all_filters();
        }
        if !f.filter.is_null() {
            ffi::webkit_user_content_filter_unref(f.filter);
            f.filter = std::ptr::null_mut();
        }
        f.generation
    });
    let Some(json) = json else { return };
    if let Err(e) = std::fs::create_dir_all(&storage_dir) {
        tracing::error!(error = %e, "could not create the content filter store folder");
        return;
    }
    let (Some(path), Ok(id)) = (storage_dir.to_str().and_then(|p| std::ffi::CString::new(p).ok()), std::ffi::CString::new("np-adblock")) else { return };
    let store = ffi::webkit_user_content_filter_store_new(path.as_ptr());
    if store.is_null() {
        return;
    }
    let bytes = glib::Bytes::from_owned(json.into_bytes());
    ffi::webkit_user_content_filter_store_save(
        store,
        id.as_ptr(),
        glib::translate::ToGlibPtr::to_glib_none(&bytes).0,
        std::ptr::null_mut(),
        Some(on_filter_saved),
        generation as usize as glib::ffi::gpointer,
    );
}

unsafe extern "C" fn on_filter_saved(source: *mut glib::gobject_ffi::GObject, result: *mut gio::ffi::GAsyncResult, data: glib::ffi::gpointer) {
    use webkit2gtk::ffi;
    let store = source as *mut ffi::WebKitUserContentFilterStore;
    let mut error: *mut glib::ffi::GError = std::ptr::null_mut();
    let filter = ffi::webkit_user_content_filter_store_save_finish(store, result, &mut error);
    glib::gobject_ffi::g_object_unref(source);
    if filter.is_null() {
        let msg = if error.is_null() { String::new() } else { std::ffi::CStr::from_ptr((*error).message).to_string_lossy().into_owned() };
        if !error.is_null() {
            glib::ffi::g_error_free(error);
        }
        tracing::error!(error = %msg, "the content blocking rules were rejected by WebKit: network ad blocking is OFF");
        return;
    }
    FILTERS.with(|f| {
        let mut f = f.borrow_mut();
        if f.generation != data as usize as u64 {
            ffi::webkit_user_content_filter_unref(filter); // llegó tarde: ya hay otra petición
            return;
        }
        f.filter = filter;
        f.managers.retain(|m| m.upgrade().is_some());
        for m in f.managers.iter().filter_map(|m| m.upgrade()) {
            m.remove_all_filters();
            ffi::webkit_user_content_manager_add_filter(glib::translate::ToGlibPtr::to_glib_none(&m).0, filter);
        }
        tracing::info!("content blocking rules active");
    });
}

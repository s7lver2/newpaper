# newpaper · Portado a Linux (Pop!_OS 22.04 / 24.04) · Plan de portado

> **Estado:** investigación y plan. Escrito en una máquina Windows: **nada de lo que sigue se ha compilado ni ejecutado en Linux**. Lo verificado aquí se limita al grafo de dependencias (`cargo tree --target x86_64-unknown-linux-gnu`, ver "Verificado"). Todo lo demás es hipótesis a confirmar en los hitos (la columna "Cómo se comprueba" de cada hito lo dice).
> **Alcance:** escritorio Linux x86_64 con Tauri 2 + WebKitGTK 4.1, sesiones X11 y Wayland (COSMIC, GNOME). Móvil sigue en el plan 08.

## 1. Resumen ejecutivo y veredicto

**Veredicto: viable, con limitaciones reales y un riesgo que decide el proyecto.** El 80 % del código (crates `np-store`, `np-feeds`, `np-lexicon`, `np-wayback`, `np-net`, el motor de `np-adblock`, toda la UI React y los paquetes TS) no depende de Windows; el trabajo está en una capa fina: el anfitrión de webviews (`np-shell/host/win.rs`, ~350 líneas de COM) y el gancho de bloqueo (`np-adblock/webview2.rs`, ~140 líneas), más seis servicios del sistema pequeños (llavero, memoria, Wi‑Fi, alimentación, portapapeles, arranque con el sistema).

Lo que **sí** se puede igualar con WebKitGTK: pestañas como webviews hijas, un perfil/almacenamiento por pestaña (`WebsiteDataManager`), proxy SOCKS5 por perfil, inyección de scripts, mensajes JS→Rust, menú contextual propio, descargas/permisos denegados, protocolos `npimg`/`npoffline`, captura de página, cierre de WebRTC.

Lo que **no** se puede igualar tal cual (hay que degradar o rediseñar):

| # | Riesgo | Gravedad | Mitigación decidida |
|---|---|---|---|
| R1 | **No hay gancho por petición** en WebKitGTK (`WebResourceRequested` no existe; `resource-load-started` solo observa). El bloqueo de red del plan 02 no se puede portar 1:1. | **Alta** (decide el hito 3) | `WebKitUserContentFilter` (JSON estilo Safari) generado desde las mismas listas con `adblock` (feature `content-blocking`) + bloqueo por dominio en el SOCKS propio cuando va por Tor + cosméticos por script (ya existen). Sin contadores exactos por petición. Si el spike falla: CEF (§6). |
| R2 | **Multi‑webview** de Tauri 2 es `unstable`; en Linux se apoya en `gtk::Fixed` (X11 y Wayland) pero hay informes de errores de maquetación y de orden Z. La app depende de 1 webview UI + N de contenido en la misma ventana. | **Alta** | Spike del hito 0 antes de nada. Plan B: ventana GTK propia con `gtk::Overlay`/`Stack` gestionada desde `np-shell/host/linux.rs` con `with_webview`. |
| R3 | **Aislamiento Tor** (DNS remoto, sin fugas WebRTC, sin DNS prefetch) hay que demostrarlo con captura de paquetes; GLib/libsoup resuelven por el proxy de forma distinta a Chromium. | Alta (privacidad) | Prueba obligatoria (hito 2) con `tcpdump`/`ss`; modo Tor deshabilitado en Linux hasta que pase. |
| R4 | Captura de página (`webkit_web_view_get_snapshot`) puede devolver blanco con composición por GPU/DMABUF (conocido en WebKitGTK 2.4x con algunos drivers). | Media | Transición A1 y overlay de popovers degradan a "sin captura" (ya hay degradación: "cualquier fallo cancela y navega directo"); los popovers necesitan alternativa (ocultar webview, ver §3.5). |
| R5 | Menú contextual: WebKitGTK no entrega el texto seleccionado en el evento. | Baja | El content script ya conoce la selección (`selectionchange`); se envía antes del menú. |
| R6 | Contadores de bloqueo por pestaña (escudo) no existen con listas de contenido. | Media | El escudo muestra "N elementos ocultados" (cosmético) + dominios bloqueados en Tor; el contador de red se marca "aproximado" o se oculta en Linux. |

**Coste estimado:** 5 hitos; un hito 0 (spike, 1–2 días con una Pop!_OS real) decide si se sigue con WebKitGTK o se pasa a CEF. Sin hito 0 verde no se toca código de producción.

## 2. Inventario de lo específico de Windows

Rutas relativas a `E:\newpaper\src-tauri` salvo indicación. "Portabilidad" = qué hay que hacer.

### 2.1 Anfitrión de webviews (núcleo del trabajo)

| Qué | Dónde | Detalle Windows | Portabilidad |
|---|---|---|---|
| Módulo COM | `crates/np-shell/src/host/win.rs`, `host/mod.rs:3-6`, `lib.rs:9` (`sysmem`) | `webview2-com`, `windows` 0.62 | Crear `host/linux.rs` con la misma superficie (§4). |
| Endurecimiento | `win.rs::harden` | Menús nativos, barra de estado, página de error, devtools, teclas aceleradoras, autorrelleno, contraseñas, gestos, SmartScreen, UA sin `Edg/` | `WebKitSettings` (`enable-developer-extras`=false salvo `NP_DEVTOOLS`, `enable-write-console-messages-to-stdout`, `set_user_agent` sin `WebKit` raro, `enable-webgl`/`enable-webrtc` según política, `enable-site-specific-quirks`, `enable-back-forward-navigation-gestures`=false). El autorrelleno/contraseñas no existen en WebKitGTK. |
| Permisos | `win.rs::register` (`PermissionRequested`) | deniega todo | señal `permission-request` → `deny()`; también `user-media-permission-request`, `geolocation`, `notification`. |
| Descargas | `DownloadStarting` | cancela | `WebContext::download-started` → `cancel()`. |
| Ventanas nuevas | `NewWindowRequested` | abre pestaña propia | señal `create` → devolver `NULL` y llamar a `open_from_popup` (wry también ofrece `new_window_req_handler`). |
| Menú contextual | `ContextMenuRequested` (`win.rs:241`) | contexto → UI | señal `context-menu` (devolver `true` para anular el nativo) con `HitTestResult` (`context_is_link/image/selection/editable/media`, `link_uri`, `image_uri`, `media_uri`); posición desde el `GdkEvent` del menú. |
| Mensajes JS→Rust | `WebMessageReceived`, `window.chrome.webview.postMessage(JSON.stringify(..))` en `packages/extract/src/content.ts:3-8` y `READY_SCRIPT` (`host/mod.rs:39-72`) | cadena JSON | `UserContentManager::register_script_message_handler("npcontent")` + señal `script-message-received::npcontent`; los scripts siguen enviando una **cadena JSON**. Se inyecta un shim al inicio: `window.chrome ??= {}; window.chrome.webview = { postMessage: s => window.webkit.messageHandlers.npcontent.postMessage(s) }` para no tocar `content.ts`. Respuestas Rust→JS: `evaluate_javascript` que dispara el mismo evento `message` que escucha `content.ts`. |
| Navegación | `NavigationCompleted`, `ProcessFailed` | éxito, `web_error_status`, HTTP, `can_go_back/forward`, caída | `load-changed` (FINISHED), `load-failed` / `load-failed-with-tls-errors`, `WebResource::response().status_code()` del recurso principal, `can_go_back()`/`can_go_forward()`, `web-process-terminated` (motivo → `crashed`). |
| Captura | `win.rs::capture_png` (`CapturePreview`) | PNG de lo pintado | `WebView::snapshot(VISIBLE_REGION, NONE)` → superficie Cairo → PNG (`cairo-rs` con feature `png`). Riesgo R4. |
| Color de esquema | `win.rs::set_color_scheme` (`ICoreWebView2_13::Profile`) | `prefers-color-scheme` = tema de la app | Sin API pública estable: **inyectar** un `<meta name="color-scheme">`+ hoja que fuerza `color-scheme`, o `gtk-application-prefer-dark-theme` por proceso (afecta a todo). Decisión: init script que sobrescribe `matchMedia('(prefers-color-scheme: dark)')`. Limitación. |
| Portapapeles | `win.rs::clipboard_text` (Win32 `OLE`) | pegar sin permiso de web | `gtk::Clipboard::get(&SELECTION_CLIPBOARD).wait_for_text()` desde el hilo GTK (en Wayland requiere ventana con foco). |
| Medida de memoria | `np-shell/src/sysmem.rs` (`ToolHelp`, `GetProcessMemoryInfo`) | árbol de procesos | Leer `/proc/<pid>/status` (`VmRSS`) o `smaps_rollup` (`Pss`) recorriendo hijos por `/proc/<pid>/task/*/children`; total desde `/proc/meminfo`. Puro Rust sin dependencias (probable que sea comprobable en CI). |
| Fondo de webview | `set_background_color` en `TabManager` | API Tauri | Soportada por Tauri/wry en GTK (RGBA); confirmar que no hay destello blanco. |
| Fondo ventana/tema inicial | `setup.rs::initial_background` | `Window::theme()` | Tauri en Linux lee `gtk-application-prefer-dark-theme`; en COSMIC/GNOME 42+ usa el portal `color-scheme`. Confirmar `theme()` en Pop!_OS. |
| UI hardening | `harden_ui` (`setup.rs:103`) | idem sobre la webview UI | Mismos `WebKitSettings` sobre la UI. |

### 2.2 Privacidad y red

| Qué | Dónde | Windows | Linux |
|---|---|---|---|
| Intercepción | `crates/np-adblock/src/webview2.rs`, `lib.rs:8` (`cfg(windows)`), `Cargo.toml` target windows | `AddWebResourceRequestedFilter("*")`, 403 vacío, `NavigationStarting` | R1: ver §3.2. El motor (`blocker.rs`, `service.rs`, `lists.rs`) es portable. |
| Argumentos Chromium | `np-net/src/controller.rs:19` `tor_browser_args`, `np-shell/src/extensions.rs:13` `DEFAULT_BROWSER_ARGS`, `src/privacy/adapters.rs:20-35`, `WebviewProfile.additional_browser_args` | `--proxy-server`, `--host-resolver-rules`, `--force-webrtc-ip-handling-policy`, `--disable-features` | Sin equivalente en WebKitGTK: se sustituye por `WebviewProfile { proxy: Option<ProxySpec>, … }` (§4.2). `additional_browser_args` sigue existiendo solo en `cfg(windows)`. Los tests de `np-net/tests/http_routing.rs:80-82` se quedan (son del formato Chromium). |
| Datos por perfil | `host/mod.rs:343` `data_directory(webview_root/<perfil>)` | UDF de WebView2 (`direct`, `tor-<tab>`) | Tauri/wry en Linux crea un `WebContext` por directorio (`WebsiteDataManager` con `base_data_directory`/`base_cache_directory`): **confirmar en el spike** que dos directorios distintos dan procesos de red y cookies separados. |
| Incógnito | `.incognito(private)` | InPrivate | `WebContext::new_ephemeral()` (wry `incognito` ya lo mapea en Linux). Confirmar. |
| Proxy local | `np-net` (`SocksServer`, `arti-client` con `tokio` + `rustls`) | portable | Arti compila en Linux; sin cambios. |

### 2.3 Sistema y distribución

| Qué | Dónde | Windows | Linux |
|---|---|---|---|
| Llavero | `crates/np-store/Cargo.toml` (`keyring` solo windows), `secrets.rs:41-75`, `src/setup.rs:16-20` (otro SO → `MemorySecrets`) | Credential Manager | `keyring` 3.6 con `sync-secret-service` (D‑Bus `org.freedesktop.secrets`; GNOME Keyring en Pop!_OS; COSMIC usa el mismo servicio de GNOME Keyring) y `crypto-rust`. Alternativa: `linux-native` (keyutils, no persiste tras reiniciar) como respaldo. **Hoy en Linux las claves se guardarían en memoria (se pierden al cerrar):** cambiar `cfg(windows)`→`cfg(any(windows, target_os="linux"))` y falla con mensaje claro si no hay Secret Service. |
| Wi‑Fi / alimentación | `src/sources/offline_sched.rs:10-30` | `NetworkInformation`, `GetSystemPowerStatus` | `zbus`: `org.freedesktop.NetworkManager` (`PrimaryConnection`→`Type=="802-11-wireless"`) y `org.freedesktop.UPower` (`OnBattery`). Hoy devuelve `true` fuera de Windows (la edición del día se construye siempre: aceptable pero ignora los ajustes "solo Wi‑Fi/solo corriente"). |
| Rutas | `app.path().app_local_data_dir()` (`setup.rs:13`, `config.rs:31`) | `%LOCALAPPDATA%\org.newpaper.app` | `~/.local/share/org.newpaper.app` (`XDG_DATA_HOME`). Sin cambios; los nombres de fichero son portables. |
| Protocolos | `lib.rs:16-17` `register_asynchronous_uri_scheme_protocol("npimg"/"npoffline")` | `http://npimg.localhost/…` | Linux/macOS: `npimg://localhost/…` (`convertFileSrc` ya lo calcula). **Bug a corregir:** `apps/ui/src/shell/ReaderSurface.tsx:15` compara con `http://npoffline.localhost/` literal; usar `convertFileSrc('', 'npoffline')` como base. La CSP (`tauri.conf.json`) ya lista las dos formas (`npimg:` y `http://npimg.localhost`). `sanitize.ts:44` permite `npimg:`. |
| CSP / IPC | `tauri.conf.json` `security.csp` | `http://ipc.localhost` | En Linux el IPC va por `ipc://localhost`; añadir `ipc:` ya está (`connect-src 'self' ipc: …`). Confirmar en la UI real. |
| Instalador | `tauri.conf.json` `bundle.targets: ["nsis"]`, `icon.ico` | NSIS | `targets` por plataforma: `["deb","appimage"]` (+ `rpm` opcional). Iconos PNG ya existen. Sección `bundle.linux.deb.depends: ["libwebkit2gtk-4.1-0","libgtk-3-0","libayatana-appindicator3-1"]`. |
| Actualizaciones | plan 06 (`np-update` aún no existe en el repo) | `tauri-plugin-updater` + NSIS | Updater: AppImage sí (reemplazo del fichero), `.deb` **no** se autoactualiza (lo hace `apt`/Pop!_Shop); Flatpak lo hace Flathub. Contenido firmado (minisign) es portable. |
| Arranque con el sistema | plan 06 Tarea 8 (`tauri-plugin-autostart`) | clave `Run` | El plugin escribe `~/.config/autostart/<app>.desktop` (X11/Wayland, XDG). Sin trabajo extra. |
| Navegador por defecto / `StartMenuInternet` | plan 06 decisión 2 | registro | `.desktop` con `MimeType=x-scheme-handler/http;x-scheme-handler/https;` + `xdg-settings set default-web-browser newpaper.desktop`; el instalador `.deb` instala el `.desktop`. URL entrantes: `single-instance` (D‑Bus) funciona. |
| Bandeja | (no implementada) | — | `libayatana-appindicator3` (ya requerida por Tauri); en GNOME hace falta la extensión AppIndicator, en COSMIC hay applet de bandeja StatusNotifier. No es requisito. |
| Selector de archivos / impresión | nativo de WebView2 | — | GTK nativo (`webkit_print_operation`). Sin trabajo. |
| Fuentes | `packages/ui-kit` (fuentes empaquetadas) | — | Comprobar que `--np-font-*` empaquetan WOFF2 (no depender de Segoe). Pop!_OS trae Fira/Noto. |
| HiDPI | — | — | GTK3: escala entera + fraccional vía Xwayland/`GDK_SCALE`. Probar a 125 %/150 %. |

### 2.4 Pruebas y CI

| Qué | Dónde | Linux |
|---|---|---|
| CI | `.github/workflows/ci.yml` (solo `windows-latest`) | Job `linux-check` con `continue-on-error` (añadido en este commit): `cargo check`/`test` de crates portables y `cargo check -p np-shell -p np-adblock -p np-app` con las dependencias apt. |
| e2e | `e2e/wdio.conf.ts` (`np-app.exe`, `msedgedriver`) | `tauri-driver --native-driver /usr/bin/WebKitWebDriver`, binario `target/debug/np-app`, `xvfb-run`. **Limitación seria:** `WebKitWebDriver` solo ve la ventana principal y **no** las webviews hijas ni el CDP que usan hoy los specs (`@newpaper/e2e` mide con CDP); los specs que inspeccionan la webview de contenido no serán portables. Plan: specs de la UI sí; los de bloqueo/contenido se verifican a mano (§7). |
| Tests de crates | `cargo test --workspace` | Se ejecutan en Linux salvo `keyring_store_round_trip` (marcado `cfg(windows)`, `np-store/src/secrets.rs:105`) y `np-adblock::webview2` (cfg windows). |

## 3. Investigación técnica en Linux (WebKitGTK 4.1)

### 3.1 Paquetes y versiones

- Tauri 2.12 → `wry 0.57` → `webkit2gtk 2.0.2` / `gtk 0.18` (GTK3) con **WebKitGTK 4.1** (libsoup3). Verificado en `Cargo.lock` (`webkit2gtk 2.0.2`, `soup3 0.5.0`, `gtk-sys 0.18`).
- Paquetes de desarrollo en Pop!_OS 22.04 y 24.04 (Ubuntu 22.04/24.04): `build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev patchelf`; con `libsecret-1-dev` y `libdbus-1-dev` si se usa `keyring` con Secret Service. Para e2e: `webkit2gtk-driver xvfb`. Para AppImage: `libfuse2` y `patchelf`.
- Versiones de WebKitGTK: Ubuntu 22.04 trae **2.4x** (4.1 disponible vía actualizaciones de seguridad); 24.04, 2.4x/2.5x. Las APIs que usamos (`WebKitUserContentFilter` ≥ 2.32, `WebsiteDataManager.set_network_proxy_settings` ≥ 2.16, `permission-request`, `get_snapshot`) existen en ambas. Fijar **mínimo 2.40** como requisito de ejecución y comprobarlo al arrancar (`webkit_get_major/minor_version`).
- Pop!_OS 24.04 con **COSMIC** usa Wayland por defecto; GNOME de 22.04, X11 por defecto con Wayland opcional. El binario debe correr en ambos (`GDK_BACKEND` no se fuerza; si el spike demuestra fallos en Wayland, un envoltorio fija `GDK_BACKEND=x11` (XWayland) como solución provisional documentada).
- Variables habituales si hay pantallas en blanco: `WEBKIT_DISABLE_DMABUF_RENDERER=1` (WebKitGTK ≥ 2.42 con drivers NVIDIA) y `WEBKIT_DISABLE_COMPOSITING_MODE=1` (peor rendimiento y posible fallo de snapshots). Documentar en la ayuda y no activarlas por defecto.

### 3.2 Bloqueo de contenido (R1) — el punto crítico

WebKitGTK **no** ofrece un gancho para cancelar peticiones de subrecursos. Opciones evaluadas:

| Opción | Cubre | Contra | Decisión |
|---|---|---|---|
| **A. `WebKitUserContentFilter`** (reglas JSON de Safari compiladas por `WebKitUserContentFilterStore`; ≥ 2.32) | Red de todos los marcos (incluye iframes), `resource-type`, `load-type: third-party`, `if-domain`/`unless-domain`, `css-display-none` | No hay `$redirect`, `$removeparam`, `$badfilter` completo, ni regex ilimitadas; máx. ~150 000 reglas por lista (límite WebKit); compilación asíncrona de varios segundos; **sin contadores** | **Principal.** El crate `adblock` 0.13 tiene la feature `content-blocking` (`FilterSet::into_content_blocking`) que genera exactamente este JSON y devuelve las reglas no convertibles. |
| B. Proxy HTTP(S) local con MITM | Todo, con contadores | Instalar CA en el sistema/almacén de WebKit: rompe el modelo de confianza y la privacidad; descartado | No |
| C. Bloqueo por dominio en el SOCKS5 propio (`np-net::SocksServer`) | Todo el tráfico del perfil Tor/proxy, incluidos WebSockets, con contador exacto por dominio | Solo hostname (sin rutas ni tipos); solo cuando hay proxy | **Complemento**: en modo Tor y también en modo directo si se enruta por el SOCKS local (el plan lo permite como `privacy.routing`). |
| D. `WebKitURISchemeRequest` | Solo esquemas propios | No ve `https:` | No |
| E. Extensión web (WebProcessExtension en C/Rust) con `send-request` | Sí cancela peticiones (señal `WebKitWebPage::send-request`) | Obliga a una librería compartida cargada en el proceso web; frágil entre versiones; el soporte de WebKitGTK la considera estable (se usa en Epiphany) | **Plan B del bloqueo** si A no basta: crate `np-webext` `cdylib` con `webkit2gtk-webextension`, comunica con el proceso principal por socket Unix. Más coste; solo si el hito 3 lo exige. |

Decisión: **A + C + cosmético por script** (ya implementado en `cosmetic.rs`, `cosmetic_msg.rs`, independiente de WebView2). Traducción de listas: añadir `np-adblock/src/content_filter.rs` (portable, comprobable en Windows con tests) que expone `fn to_safari_json(&FilterSet) -> (String, Vec<Unconverted>)`; carga con `UserContentFilterStore::new(<data>/filters)` + `save(id, json)` + `add_filter` en cada webview. Los filtros se recompilan al cambiar listas/ajustes (ya existe la reconstrucción del motor en `AdblockService`).

Consecuencias que se anotan en la matriz: sin `$redirect` (pueden fallar scripts de "anti‑adblock"), sin contador exacto, `$important`/excepciones solo vía `ignore-previous-rules`.

### 3.3 Multi‑webview (R2)

- Tauri `unstable` ya está activo (`Cargo.toml`: `tauri = { features = ["unstable"] }`) y el código usa `Window::add_child`/`WebviewBuilder`. En Linux, Tauri crea una `gtk::Box` por ventana y cada hijo cuelga de un `gtk::Fixed` (por eso funciona en Wayland, a diferencia de `build_as_child`, solo X11).
- Riesgos conocidos: informes de hijos que solo se pintan en la mitad inferior, `set_position/set_size` con retraso, hijos que no reciben foco/teclado, orden Z = orden de inserción (la UI primero, las pestañas encima: **igual** que en Windows, donde también la nativa va encima; el truco actual de capturar y ocultar para los popovers sigue siendo necesario).
- `auto_resize()` en la UI y `tab_set_bounds` desde la UI para el hueco: se mantiene.
- Plan B si falla: construir el `gtk::Overlay`/`gtk::Stack` a mano (en `host/linux.rs`) con `webkit2gtk::WebView::new_with_context(...)` y no usar `add_child` para las pestañas (la UI sigue siendo la webview principal de Tauri).

### 3.4 Perfiles, proxy y fugas (R3)

- `wry` mapea `data_directory` a `WebContext::new(Some(dir))` (un `WebsiteDataManager` por directorio) y `incognito` a contexto efímero. `proxy_url` de `WebviewBuilder` → `WebsiteDataManager::set_network_proxy_settings(Custom, NetworkProxySettings::new(Some("socks5://127.0.0.1:<p>"), &[]))`. **A verificar en el spike:** que Tauri 2.12 expone `WebviewBuilder::proxy_url` en Linux y que se aplica al manager del perfil (si no, `with_webview` → `pw.inner()` es el `webkit2gtk::WebView` y se llama a `website_data_manager()` directamente).
- DNS: GLib trata `socks5://` como SOCKS5 con **nombre de host enviado al proxy** (resolución remota) cuando WebKit conecta por nombre; confirmar con `sudo tcpdump -ni any port 53` durante una navegación por Tor (no debe salir ni una consulta) y con `ss -tnp` (sólo conexiones a `127.0.0.1:<socks>`).
- Desactivar: `enable-webrtc=false` (y `enable-media-stream=false`) siempre que haya Tor; `enable-dns-prefetching` está deprecada (WebKitGTK ≥ 2.40 no hace prefetch por defecto, comprobar); `enable-hyperlink-auditing=false`; `enable-offline-web-application-cache` n/a; `WebKitCookieAcceptPolicy::NoThirdParty`; `webkit_website_data_manager_set_itp_enabled(true)` (Intelligent Tracking Prevention).
- Kill switch: si el SOCKS local cae, el proxy configurado falla cerrado (WebKit no cae a directo cuando el proxy es `Custom`); comprobarlo.
- User agent: WebKitGTK ya emite `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/… Safari/…`; no hay marca de "Edge". Sin trabajo; mantener el test `sanitize_user_agent` solo para Windows.

### 3.5 Captura y superposiciones (R4)

`webkit_web_view_get_snapshot(VISIBLE_REGION)` devuelve una superficie Cairo; en WebKitGTK ≥ 2.42 con compositing acelerado puede salir vacía en NVIDIA/Wayland. Estrategia: en el spike medir; si falla, para los popovers sobre una página se **oculta** la webview (`hide()`), sin captura, y la UI muestra el color de fondo (flash aceptable) o se usa una captura anterior en caché. La transición A1 se desactiva (`appearance.pageTransition` pasa a `false` por defecto en Linux si la captura falla).

### 3.6 Otros

- Ventanas: `WindowBuilder`/`tao` GTK; decoraciones del lado del cliente en GNOME/COSMIC (Tauri 2 usa `gtk_header_bar` opcional). Se mantiene la barra de la UI dentro del contenido; probar que `decorations: true` no duplica.
- Tray/D‑Bus: `single-instance` por D‑Bus; en Flatpak necesita permiso `--own-name`.
- Flatpak (opcional, fase final): `org.gnome.Platform//47`, permisos `--share=network --socket=wayland --socket=fallback-x11 --device=dri --talk-name=org.freedesktop.secrets`. El sandbox del web process de WebKitGTK usa bubblewrap: dentro de Flatpak se usa el sandbox del portal (`WEBKIT_FORCE_SANDBOX`/`--talk-name=org.freedesktop.Flatpak`).
- Impresión: `window.print()` abre el diálogo GTK; sin trabajo.

## 4. Diseño propuesto

### 4.1 Capas (sin reorganizar `win.rs` hasta que haya Linux para probar)

```
np-shell
├── host/mod.rs      TabManager (lógica, cfg-free salvo el pegamento)  ← hoy mezcla cfg(windows)
├── host/win.rs      (existente) webview2-com
├── host/linux.rs    (nuevo)     webkit2gtk via `with_webview`
└── platform/        (nuevo, hito 1)   servicios sin webview:
    ├── mod.rs       trait PlatformServices { clipboard_text, process_tree_bytes, total_ram, on_wifi, on_ac_power }
    ├── windows.rs   (mueve sysmem.rs y offline_sched)  
    └── linux.rs     (/proc, zbus, gtk::Clipboard)
```

`TabManager` hoy llama a `win::*` en cinco puntos (`set_background`, `create_webview`, `capture`, ámbito de menú, `clipboard`). Se define un trait **interno**:

```rust
/// Lo único que `TabManager` pide a la plataforma sobre una webview de contenido.
pub(crate) trait WebviewPlatform {
    fn attach(app: &AppHandle, id: TabId, wv: &Webview) -> Result<(), ShellError>;      // señales/eventos + endurecimiento
    fn set_color_scheme(wv: &Webview, dark: bool);
    fn capture_png(wv: &Webview) -> oneshot::Receiver<Option<Vec<u8>>>;
    fn harden_ui(wv: &Webview) -> tauri::Result<()>;
}
#[cfg(windows)] pub(crate) type Platform = win::Win;
#[cfg(target_os = "linux")] pub(crate) type Platform = linux::Linux;
#[cfg(not(any(windows, target_os = "linux")))] pub(crate) type Platform = noop::Noop;   // móvil/macOS
```

Los eventos de entrada (`on_context_menu`, `on_navigation_completed`, `on_process_failed`, `handle_raw_message`, `open_from_popup`) **ya** son métodos de `TabManager` independientes de COM: `linux.rs` solo traduce señales GTK a esas llamadas. Esto hace el portado aditivo.

### 4.2 Perfil de webview multiplataforma

`WebviewProfile` pasa de `{ data_dir_name, additional_browser_args }` a:

```rust
pub struct WebviewProfile {
    pub data_dir_name: String,
    pub additional_browser_args: String,   // solo Windows (se ignora en otros SO)
    pub proxy: Option<ProxySpec>,          // solo para Tor/enrutado; usado por Linux (y valdría en Windows)
    pub block_webrtc: bool,
}
pub struct ProxySpec { pub scheme: &'static str /* "socks5" */, pub host: String, pub port: u16 }
```

`np-net` expone `tor_proxy_spec(port)` junto a `tor_browser_args(port)`; `privacy/adapters.rs` rellena los dos (el campo de Windows no cambia ⇒ tests existentes intactos).

### 4.3 Bloqueo

`np-adblock`: `webview2.rs` (cfg windows) se queda; nuevo `content_filter.rs` portable + `linux.rs` (cfg linux) con `attach_filters(webview, store)`. `ContentWebviewHook::on_content_webview_created` ya es el punto de enganche multiplataforma (`privacy/adapters.rs:87-93`): bajo `cfg(target_os="linux")` llama a `np_adblock::linux::attach`.

### 4.4 Servicios

`np-store`: `keyring` con `sync-secret-service` + `crypto-rust` bajo `[target.'cfg(target_os = "linux")'.dependencies]`. `np-shell/sysmem`: `sysmem_linux.rs` con `/proc`. `offline_sched`: `zbus` (bloqueante, `zbus::blocking`) bajo `cfg(target_os="linux")`. Todo detrás de `cfg`, de modo que Windows no cambia.

## 5. Matriz de funciones (planes 01–08)

Leyenda: **S** soportado · **L** con limitación · **N** no viable (hoy).

| Función (plan) | Windows | Linux | Notas Linux |
|---|---|---|---|
| Pestañas, grupos, ancladas, lista (01, B1) | S | S | Lógica en `model.rs`, portable |
| Multi‑webview UI + contenido (01) | S | **L** | R2: unstable; spike hito 0 |
| Barra de direcciones, historial, ajustes, SQLite (01) | S | S | `rusqlite bundled` |
| Lector, `extract`, `npimg` (01, B3, B6) | S | S | URL del protocolo distinta (corregir `ReaderSurface.tsx:15`) |
| Llavero (01 T13) | S | S | Secret Service; falla clara sin él |
| Mensajes de contenido (01 T16) | S | S | shim `window.chrome.webview` |
| Menú contextual propio (B7) | S | S | `context-menu` + selección desde el content script |
| Pegar desde portapapeles del sistema | S | S | `gtk::Clipboard` |
| Transición suave de página (A1) | S | **L** | Depende de snapshot (R4) |
| Popovers sobre la web (captura+ocultar) | S | **L** | Ocultar si no hay captura |
| Fondo sin destello / tema (B4, B5) | S | S | probar `set_background_color` |
| `prefers-color-scheme` = tema de la app | S | **L** | Sin API; script que redefine `matchMedia` |
| Ocultar marca del motor (B8) | S | S | WebKit no muestra marca; devtools off |
| Permisos y descargas denegados (B8) | S | S | señales GTK |
| Aviso de recursos (B2) | S | S | `/proc` (PSS) |
| Adblock de red (02 T7) | S | **L** | `WebKitUserContentFilter` (R1): sin `$redirect`, sin contador exacto |
| Adblock cosmético (02 T2/T8) | S | S | por script, igual |
| Escudo con contador (02 T17) | S | **L** | contador cosmético + dominios en SOCKS |
| Listas de filtros y actualizador 24 h (02 T3/T4) | S | S | portable |
| Modo Tor (Arti) + SOCKS local (02 T9‑13) | S | S | crates portables |
| WebView por Tor sin fugas DNS/WebRTC (02) | S | **L** | R3: proxy WebKit + `enable-webrtc=false`; **bloqueado hasta pasar la prueba de fugas** |
| País de salida / nuevo circuito (02, A2) | S | S | recrear webviews: igual |
| Fuentes RSS, hechos, línea editorial (03) | S | S | portables |
| Hemeroteca Wayback (03, 05) | S | S | crate portable; UI igual |
| Lectura sin conexión + `npoffline` (03 T20) | S | S | construcción en la UI; programador usa `zbus` |
| Solo Wi‑Fi / solo corriente (03) | S | **L** | `zbus` (NetworkManager, UPower); si no hay D‑Bus → `true` |
| Pipeline de IA, proxy de IA, agente (04, 05) | S | S | HTTP; Ollama local igual |
| Experiencia de análisis (05) | S | S | UI |
| Actualizaciones de contenido firmadas (06 T3, T7) | S | S | minisign portable |
| Actualización de la app (06 T6) | S | **L** | AppImage sí; `.deb` vía apt; vuelta atrás con instalador guardado: solo AppImage |
| Iniciar con el sistema (06 T8) | S | S | `.desktop` en autostart |
| Navegador por defecto / abrir enlaces (06 T8) | S | S | `.desktop` + `xdg-settings` (el usuario lo confirma) |
| Importar marcadores de Edge/Chrome/Brave (06 T8) | S | S | rutas `~/.config/google-chrome/Default/Bookmarks`, `~/.config/BraveSoftware/…`, `~/.config/microsoft-edge/…`, flatpak/snap alternativos |
| Instalador (06 T9) | NSIS | **L** | `.deb` + AppImage (+ Flatpak opcional); sin opciones en instalador (están en el primer arranque, ya decidido) |
| Informe de cuelgue (06) | S | S | motivo de `web-process-terminated` |
| Sincronización PC↔móvil (07: mDNS, QR) | S | S | `mdns-sd` portable; abrir puerto en `ufw` (pregunta al usuario) |
| Móvil (08) | — | — | no afecta |
| e2e `tauri-driver` | msedgedriver | **L** | WebKitWebDriver no ve webviews hijas ni CDP |
| Medida de memoria por pestaña | N | N | igual en ambos (sin atribución) |

## 6. Alternativa: CEF/Chromium en Linux

Solo si el hito 0/3 demuestra que WebKitGTK no cumple R1 o R2.

| | WebKitGTK (Tauri/wry) | CEF (`cef-rs`/`tauri-runtime-cef`) |
|---|---|---|
| Bloqueo por petición | No (reglas Safari) | Sí (`CefRequestHandler`/`ResourceRequestHandler`; paridad con Windows) |
| Proxy/DNS/WebRTC | API de GLib; hay que demostrarlo | `--proxy-server`, `--host-resolver-rules`, `--force-webrtc-ip-handling-policy` **idénticos** a hoy |
| Multi‑contexto/perfiles | `WebsiteDataManager` | `CefRequestContext` con `cache_path` por perfil |
| Captura | Snapshot (frágil) | `CefBrowserHost::GetImage`/OSR (fiable) |
| Tamaño | +0 MB (usa el sistema) | **+200–300 MB** por distribución; actualizaciones de seguridad propias |
| Madurez en el repo | Tauri oficial (Linux = WebKitGTK) | Integración no oficial en Tauri 2 (a mantener); cambia todo `np-shell` (`tauri-runtime`) |
| Esfuerzo | bajo/medio | alto (nuevo runtime, empaquetado, CI) |

**Criterio de decisión (hito 0):** si en Pop!_OS real (X11 y Wayland) fallan R2 (hijos mal pintados/foco) y no hay Plan B de `gtk::Overlay`, **o** el filtro Safari deja pasar > 25 % de las peticiones que bloquea Windows en las fixtures (`e2e/fixtures/ads.html` + 3 sitios reales), se abre un plan nuevo para CEF. Si no, WebKitGTK es el camino (cero binarios extra y el motor del sistema se actualiza con apt).

## 7. Plan por hitos

Orden: **H0 spike → H1 compila y arranca → H2 navegar con privacidad → H3 bloqueo → H4 sistema/instaladores → H5 pulido y CI completo**. Cada hito termina con un criterio verificable en Pop!_OS real (VM válida salvo donde se indique GPU/Wayland).

### Hito 0 — Spike de viabilidad (1–2 días, Pop!_OS 24.04 COSMIC/Wayland + 22.04 GNOME/X11)

**Files:** `src-tauri/examples/linux_spike.rs` (nuevo, no se compila en Windows: `#![cfg(target_os = "linux")]`), sin tocar el resto.

- [ ] Instalar dependencias (§3.1) y compilar el esqueleto `cargo build -p np-app` (sin tocar nada): anotar los errores.
- [ ] Spike: ventana Tauri con 1 webview UI (`WebviewUrl::App`) + 3 webviews hijas con `data_directory` distinto, `proxy_url("socks5://127.0.0.1:<p>")` (servidor SOCKS de prueba), `incognito`, `auto_resize`, mover/ocultar/mostrar con `set_position`/`set_size`/`hide`/`show`.
- [ ] Medir: (a) pintado correcto en X11 y Wayland; (b) foco y teclado en la hija; (c) cookies aisladas entre dos directorios; (d) `tcpdump -ni any port 53` sin consultas con proxy; (e) `get_snapshot` devuelve imagen no vacía (con GPU y con `WEBKIT_DISABLE_DMABUF_RENDERER=1`); (f) `UserContentFilterStore` con 20 000 reglas generadas por `adblock` (feature `content-blocking`) compila en < 10 s y bloquea las fixtures; (g) `register_script_message_handler` recibe una cadena JSON; (h) `context-menu` suprime el nativo.
- [ ] **Entrega del hito:** tabla de resultados (pasa/falla) en `docs/superpowers/plans/2026-10-09-linux-popos-spike-resultado.md` y decisión WebKitGTK/CEF según §6.

**Aceptación:** (a)(b)(c)(d)(g) en verde en al menos una combinación X11 o Wayland; (e)(f) deciden R4/R1 pero no vetan WebKitGTK por sí solos.

### Hito 1 — Compila y arranca en Linux (UI + lector, sin pestañas web)

**Files:** `src-tauri/Cargo.toml`, `crates/np-store/Cargo.toml`+`src/secrets.rs`, `crates/np-shell/src/{lib.rs,sysmem_linux.rs,host/mod.rs,host/linux.rs}`, `src/setup.rs`, `src/resources.rs`, `src/sources/offline_sched.rs`, `src/commands/tabs.rs`, `tauri.conf.json`, `apps/ui/src/shell/ReaderSurface.tsx`.

- [ ] Sustituir los `cfg(windows)`/`cfg(not(windows))` de `setup.rs`, `resources.rs`, `commands/tabs.rs`, `host/mod.rs` por el trait `WebviewPlatform`/`PlatformServices` (§4.1) con `Platform = win::Win` en Windows y `linux::Linux` en Linux; el resultado en Windows es **idéntico** (comprobar con `cargo test --workspace` y los e2e existentes).
- [ ] `KeyringSecrets` en Linux (`sync-secret-service`); si no hay servicio, error visible en Ajustes y no `MemorySecrets` silencioso.
- [ ] `sysmem_linux.rs` (`/proc`, tests con `/proc` simulado en un `tempdir`), `on_wifi`/`on_ac_power` con `zbus`.
- [ ] `tauri.conf.json`: `bundle.targets` por SO (`tauri.linux.conf.json` con `["deb","appimage"]`, el resto igual).
- [ ] Corregir `ReaderSurface.tsx:15` con `convertFileSrc`.
- [ ] `pnpm tauri dev` en Pop!_OS: la UI carga, Ajustes guarda y recupera una clave de IA del llavero, historial y SQLite funcionan.

**Aceptación:** `cargo test --workspace` en Linux pasa (salvo los tests `cfg(windows)`); la UI abre en X11 y Wayland; `secret_set/secret_has` sobreviven a un reinicio; `resources_status` devuelve memoria > 0.

### Hito 2 — Pestañas web, perfiles, Tor y privacidad de red

**Files:** `crates/np-shell/src/host/linux.rs`, `extensions.rs` (campo `proxy`), `crates/np-net/src/controller.rs` (`tor_proxy_spec`), `src/privacy/adapters.rs`, `src/privacy/mod.rs`.

- [ ] `linux.rs::attach`: `harden` (WebKitSettings), `permission-request`/`user-media-permission-request` → deny, `download-started` → cancel, `create` → pestaña propia, `context-menu` → `ContextInfo`, `script-message-received` → `handle_raw_message`, `load-changed`/`load-failed` → `on_navigation_completed` (con HTTP del recurso principal), `web-process-terminated` → `on_process_failed`.
- [ ] Shim `window.chrome.webview` como `initialization_script` de contenido y de `READY_SCRIPT`; respuesta Rust→JS con `evaluate_javascript`.
- [ ] `WebviewProfile.proxy` y `block_webrtc`; aplicar `proxy_url` y `enable-webrtc=false` en modo Tor; **fallar cerrado** si el proxy no está.
- [ ] Prueba de fugas (plan 02 T23, adaptada): `tcpdump port 53`, `ss -tnp`, https://check.torproject.org y un test de WebRTC (`browserleaks.com/webrtc`).
- [ ] Captura (`capture_png`) y transición A1 con degradación; popovers con oculta/captura.

**Aceptación:** abrir elpais.com, bbc.com y theguardian.com en modo directo y Tor (con `NP_FAKE_TOR=1` y con Arti real); selector de artículos y lector funcionan; menú contextual propio; **cero** consultas DNS en el sistema durante la navegación por Tor; WebRTC no revela IP; nueva pestaña en Tor no comparte cookies con directa.

### Hito 3 — Bloqueo de contenido

**Files:** `crates/np-adblock/Cargo.toml` (feature `content-blocking`), `src/content_filter.rs` (portable, tests en Windows), `src/linux.rs`, `src/service.rs` (contador cosmético), `crates/np-net/src/server.rs` (lista de dominios bloqueados para el SOCKS).

- [ ] `content_filter.rs`: de `FilterSet` a JSON Safari con tope de reglas y registro de las no convertidas; tests con listas de ejemplo (corren en Windows).
- [ ] `linux.rs::attach_filters`: `UserContentFilterStore`, recompilación al cambiar listas, `UserContentManager::add_filter`.
- [ ] SOCKS: rechazar `CONNECT` a dominios de la lista de rastreadores (solo con proxy) y contarlo.
- [ ] Escudo: textos "ocultados/bloqueados" distintos (es/en/de) cuando el contador es aproximado (`blocked_stats` ya existe).

**Aceptación:** fixtures de `e2e/fixtures/ads.html` sin anuncios; en 3 portadas reales el bloqueo cubre ≥ 75 % de lo que Windows bloquea (comparar `blocked_counts` y peticiones en `WebKitWebInspector` de depuración); las páginas siguen siendo legibles (sin romperse).

### Hito 4 — Sistema, paquetes y actualizaciones

**Files:** `tauri.conf.json`/`tauri.linux.conf.json`, `src-tauri/linux/newpaper.desktop`, `.github/workflows/release-linux.yml` (nuevo), plan 06 (np-update) cuando exista.

- [ ] `.deb` y AppImage; probar instalación en 22.04 y 24.04 limpias (VM); dependencias correctas (`apt install ./newpaper_*.deb` sin romper).
- [ ] Autostart y navegador por defecto (`xdg-settings`); URLs entrantes con `single-instance`.
- [ ] Importar marcadores de Chrome/Brave/Edge (rutas Linux, también Flatpak/Snap).
- [ ] Actualizador: AppImage con `tauri-plugin-updater`; `.deb`: mostrar "actualiza con tu gestor" y comprobar versión por GitHub.
- [ ] Flatpak (opcional): manifiesto y permisos §3.6.

**Aceptación:** instalación, apertura desde el lanzador de Pop!_OS, icono correcto, desinstalación limpia; abrir un enlace `https://` del sistema (con newpaper por defecto) lo abre en pestaña nueva.

### Hito 5 — CI completa y pruebas

**Files:** `.github/workflows/ci.yml`, `e2e/wdio.linux.conf.ts`.

- [ ] Job `ubuntu-22.04`/`24.04`: `cargo check --workspace` y tests de crates sin GUI (el job `linux-check` ya está añadido en este plan con `continue-on-error`; quitar `continue-on-error` cuando sea verde 10 veces seguidas).
- [ ] e2e en Linux con `xvfb-run` + `tauri-driver` + `WebKitWebDriver`: solo specs de la UI; marcar `skip` en Linux los que usan CDP de la webview de contenido.
- [ ] Documentar variables (`WEBKIT_DISABLE_DMABUF_RENDERER`), fallback X11 y requisitos mínimos (WebKitGTK ≥ 2.40).

**Aceptación:** CI verde en Linux; lista manual (§8) sin fallos bloqueantes.

## 8. Pruebas manuales en Pop!_OS

Equipos: A) Pop!_OS 22.04 GNOME/X11 (VM vale); B) Pop!_OS 24.04 COSMIC/Wayland (preferible hardware con GPU Intel/AMD y otro con NVIDIA).

1. Arranque: `newpaper` desde el lanzador; ventana a 1280×820, sin parpadeo blanco con tema oscuro y claro.
2. Tres pestañas web (El País, BBC, Guardian); cambiar de pestaña, anclar, agrupar; redimensionar la ventana y maximizar: el contenido sigue el hueco (R2).
3. Lector, selector de artículos, imágenes por `npimg`; editor sin conexión: guardar un artículo, desconectar la red, abrirlo (`npoffline`).
4. Teclado en la web (formularios, `Ctrl+L`, `Ctrl+T`), foco al pasar de UI a contenido.
5. Menú contextual: en enlace, imagen, selección, campo editable. Pegar texto del portapapeles.
6. Popovers (lista de pestañas, escudo) sobre una web: sin hueco en blanco prolongado.
7. Tor: `NP_FAKE_TOR=1` y real. `sudo tcpdump -ni any port 53` durante la navegación (0 paquetes de la app); `ss -tnp | grep newpaper` (solo `127.0.0.1`); `browserleaks.com/webrtc` y `check.torproject.org`; cambiar país de salida y "nuevo circuito".
8. Bloqueo: `e2e/fixtures/ads.html`, una portada con anuncios; compare con Windows.
9. Llavero: guardar clave de IA, cerrar sesión de usuario y volver (GNOME Keyring desbloqueado), recuperar. Sin servicio (`systemctl --user stop gnome-keyring-daemon`): mensaje de error útil.
10. Edición del día con "solo Wi‑Fi": en Ethernet no se construye; en batería con "solo corriente" no se construye.
11. HiDPI 150 % y 200 %; 2 monitores con escalas distintas.
12. Rendimiento: 8 pestañas, RAM del aviso de recursos coincide con `htop` (±20 %).
13. Instalar `.deb` en 22.04 y 24.04 limpias; AppImage en 24.04 (`libfuse2`); autostart (`~/.config/autostart/`); navegador por defecto.
14. Suspender/reanudar el portátil con Tor activo: reconexión y sin fugas.
15. Wayland: arrastrar una pestaña no aplica; probar `GDK_BACKEND=x11` (XWayland) para comparar defectos.

## 9. Verificado en este commit (Windows)

- `cargo tree --target x86_64-unknown-linux-gnu -p <crate> -i windows` (y `-i webview2-com`): **vacío** para `np-store`, `np-feeds`, `np-lexicon`, `np-wayback`, `np-net`, `np-adblock`, `np-shell` y `np-app`: ningún crate arrastra `windows`/`webview2-com` en Linux; `keyring` tampoco entra en Linux hoy (Windows only). `np-app` en Linux sí trae `webkit2gtk 2.0.2` por `tauri`.
- Tests que fallarían o se saltarían solo en Linux: ninguno de los crates portables usa APIs de Windows fuera de `cfg(windows)`.

**No verificado** (necesita Linux): compilación de `np-shell`/`np-adblock`/`np-app` con `cfg(not(windows))`; que las rutas `cfg(not(windows))` de `host/mod.rs`, `setup.rs`, `resources.rs`, `commands/tabs.rs` compilen sin `win::*`; la compilación de `arti-client` y `rusqlite bundled` en Ubuntu; toda la parte de WebKitGTK (§3).

## 10. Decisiones y preguntas abiertas

1. **Sí** a Linux como objetivo de primera clase con degradaciones declaradas (matriz §5); **no** se promete paridad exacta del bloqueo.
2. **No** reorganizar `win.rs` hasta el hito 1 con una máquina Linux: el trait se introduce con Windows como única implementación verificable y Linux detrás.
3. Abierta: ¿se acepta publicar con modo Tor "experimental" en Linux hasta que la prueba de fugas pase? (Recomendación: modo Tor desactivado por defecto en Linux; activarlo solo tras el H2.)
4. Abierta: política de WebKitGTK mínimo (2.40) frente a Ubuntu 22.04 (2.4x vía `-security`); en caso de ser menor, Pop!_OS 22.04 queda fuera de soporte y solo 24.04.

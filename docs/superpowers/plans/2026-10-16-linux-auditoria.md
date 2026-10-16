# newpaper · Auditoría del cliente de escritorio en Linux · 2026-10-16

> **Alcance:** cliente de escritorio (Tauri 2.12, `np-app`, crates `np-*`, `apps/ui`, `packages/ui-kit`) en **Linux x86_64 con WebKitGTK 4.1**. No toca Android, `apps/mobile` ni el diseño.
> **Cómo se hizo:** lectura de código + comprobación cruzada. Se desarrolla en Windows; **no hay ninguna máquina Linux con pantalla**, así que **nada de lo que sigue se ha ejecutado en una sesión gráfica real**. Lo que sí se ha hecho:
> - Una distro Ubuntu 24.04 de WSL ya existente (`D:\WSL\Ubuntu`) con solo paquetes de compilación (`apt`) y `rustup` mínimo: `cargo check`/`cargo test` de `np-app` y sus crates **para Linux** (compila el anfitrión nuevo contra los encabezados reales de WebKitGTK/GTK).
> - Lectura del código fuente de `wry 0.57`, `tauri-runtime-wry 2.12`, `tauri-plugin-updater 2.13`, `webkit2gtk 2.0.2`, `adblock 0.13.3` (en el registro de cargo) para contrastar lo que hace Tauri en Linux.
> - Lo que figura como **needs-real-Linux-test** exige la lista manual de §4.
>
> Sustituye en lo práctico a las hipótesis del plan `2026-10-09-linux-popos-portado.md` (que seguía siendo un plan; aquí hay código).

## 1. Hallazgos

Gravedad: **bloqueante** (la app no funciona o falla la seguridad), **mayor** (función importante rota o degradada), **menor**. Estado: **fixed** (corregido en código), **documented** (limitación conocida, anotada), **needs-real-Linux-test** (corregido o implementado pero sin ejecutar en Linux).

| # | Gravedad | Hallazgo | Estado |
|---|---|---|---|
| L1 | **bloqueante** | **Disposición de webviews rota en Linux.** Tauri 2.12 mete *todas* las webviews hijas (la UI y cada pestaña) en un `gtk::Box` vertical con `pack_start(expand)`; wry solo sabe posicionar dentro de un `gtk::Fixed` y `Webview::set_position/set_size/set_bounds` no hacen nada en un `Box` (`wry/src/webkitgtk/mod.rs: add_to_container`, `set_bounds`; `tauri-runtime-wry` pasa `window.default_vbox()`). La UI y las pestañas se habrían repartido la ventana en vertical sin respetar el hueco que calcula la UI. | **fixed** · needs-real-Linux-test. `np-shell/src/host/linux.rs`: la UI pasa a ser el hijo principal de un `gtk::Overlay` y cada pestaña un hijo superpuesto colocado con `halign/valign=start`, márgenes y `size_request` (`set_webview_bounds`). Fuera de la vista (transición A1) = margen 30000 (GTK no admite márgenes negativos). |
| L2 | **bloqueante (seguridad)** | **El modo Tor no se aplicaba en Linux.** El enrutado por Tor de las webviews va en `additional_browser_args` (`--proxy-server=socks5://127.0.0.1:<p>`, `--host-resolver-rules`, `--force-webrtc-ip-handling-policy`), que es solo de WebView2. En Linux se ignora: **el contenido web habría cargado en directo (con tu IP) con el modo Tor activo**, sin ningún aviso. | **fixed** · needs-real-Linux-test. `WebviewProfile.proxy` (`socks5://127.0.0.1:<p>`) se rellena exactamente cuando la pestaña va por Tor (`privacy/adapters.rs`, con tests). En Linux se pasa a `WebviewBuilder::proxy_url` y se **reaplica y verifica** sobre el `WebsiteDataManager` (`NetworkProxyMode::Custom`, que no cae a conexión directa si el SOCKS local está cerrado: ese es el kill switch). **Falla cerrado:** si no se puede garantizar el proxy, la webview se cierra y no se carga nada (`create_webview` devuelve error). En Tor: WebRTC y captura de medios desactivados y un guion que elimina `<link rel=dns-prefetch/preconnect/prefetch>`. |
| L3 | **bloqueante (datos)** | **Llavero:** en Linux (`setup.rs`) se usaba `MemorySecrets`: las claves de IA se guardaban solo en memoria y se perdían al cerrar, sin avisar. | **fixed** · needs-real-Linux-test. `keyring 3.6` con `sync-secret-service` + `crypto-rust` (Secret Service por D-Bus: GNOME Keyring, KWallet ≥ 5.97, KeePassXC). Sin servicio, `secret_set/has/get` devuelven un error claro (*"no system keyring available…"*); **nunca** se cae a memoria ni a texto plano. |
| L4 | **bloqueante** | **Sin canal de mensajes de contenido.** Los scripts de contenido (`content.ts`, `cosmetic.js`, `READY_SCRIPT`) hablan por `window.chrome.webview.postMessage`, que no existe en WebKitGTK: no habría lector, ni selector de artículos, ni filtrado cosmético, ni atajos, ni `np-ready` (la webview solo se revelaba por el temporizador de 2,5 s). | **fixed** · needs-real-Linux-test. `BRIDGE_SHIM` define `window.chrome.webview` sobre `window.webkit.messageHandlers.npcontent` (registrado con `register_script_message_handler`); las respuestas Rust→JS se entregan con `__np_deliver` (equivale a `PostWebMessageAsJson`). El resto de scripts no cambia. |
| L5 | mayor | **Sin eventos de navegación en Linux:** `NavigationStarting/Completed`, `ProcessFailed`, permisos, descargas, ventanas nuevas y menú contextual solo estaban para WebView2 (`win.rs`). Sin ellos: sin pantalla de error, sin `can_go_back/forward`, sin recuperación de cuelgues, `target=_blank` ignorado, menú nativo del motor. | **fixed** · needs-real-Linux-test. `linux.rs`: `load-changed`/`load-failed` → `on_navigation_completed` (con `navigation::judge`), `web-process-terminated`, `permission-request` → deniega, descargas canceladas, `create` → pestaña propia (solo con gesto del usuario), `context-menu` → menú de la UI (el texto seleccionado se pide a la página). |
| L6 | mayor | **Sin bloqueo de red en Linux** (el gancho era `cfg(windows)`): cero bloqueo de anuncios/rastreadores (el cosmético sí funcionaba por el guion, tras L4). | **fixed (con límites)** · needs-real-Linux-test. WebKitGTK no tiene gancho por petición. Las mismas listas se traducen a reglas de bloqueo de contenido **de red** (`np-adblock/src/content_filter.rs`, `adblock` con `content-blocking`; con las 7 listas embebidas salen ≈113 000 reglas, ≈12 MB de JSON, 1,3 s de conversión) y se cargan como `WebKitUserContentFilter` (API C: la envoltura `webkit2gtk` 2.0.2 no la expone). El cosmético sigue siendo el guion `cosmetic.js` (no se pasa a WebKit: solo el cosmético son +27 000 reglas y rebasaría el tope de 140 000). Límites en §5. **Cuánto tarda y pesa la compilación de WebKit con 113 000 reglas no se ha medido**: comprobar en la prueba 7. |
| L7 | mayor | **Actualizaciones: nunca llegarían a "lista" en Linux.** `keep_rollback_installer` descargaba `newpaper_<v>_x64-setup.exe` (NSIS) y, si fallaba, posponía la actualización; el arranque con vuelta atrás también lanzaría un `.exe`. | **fixed.** `ROLLBACK_SUPPORTED = cfg!(windows)`: en Linux no hay instalador que guardar y la actualización sigue. Vuelta atrás automática: solo Windows (documented). |
| L8 | mayor | **Empaquetado:** `bundle.targets = ["nsis"]`: un `tauri build` en Linux fallaría; sin `.desktop` propio, sin categoría ni asociación de navegador. | **fixed.** `src-tauri/tauri.linux.conf.json` (se fusiona sobre `tauri.conf.json` solo en Linux): `deb`, `rpm`, `appimage`, iconos PNG (32/128/256/512), categoría, `libwebkit2gtk-4.1-0 (>= 2.40)`, plantilla `.desktop` (`src-tauri/linux/newpaper.desktop`) con `MimeType=x-scheme-handler/http;x-scheme-handler/https;` y `Exec=… %U`. No se declara `text/html` (la app no abre archivos locales). |
| L9 | mayor | **Permisos de la carpeta de datos:** con el umask típico (022) `~/.local/share/org.newpaper.app/newpaper.sqlite` (historial, claves de sincronización, Tor) era legible por otros usuarios de la máquina. | **fixed.** `setup.rs::private_dir`: carpeta de datos en `0700` (cubre SQLite `-wal/-shm`, `tor/`, `webview/`, `updates/`). |
| L10 | mayor | **Imágenes sin conexión rotas en Linux:** `ReaderSurface.rewriteImage` solo reconocía `http://npoffline.localhost/` (Windows/Android); en Linux `convertFileSrc` da `npoffline://localhost/…`, que se enviaba por el proxy `npimg` (fallo) y además `sanitize.ts` no permitía el esquema `npoffline:`. | **fixed** (con test). |
| L11 | menor | Portapapeles propio (`clipboard_text`) devolvía siempre `None`. | **fixed** (`gtk::Clipboard` en el hilo de GTK) · needs-real-Linux-test. En Wayland puede requerir foco de la ventana. |
| L12 | menor | Aviso de recursos: `measure()` devolvía `(0, 0)` (nunca avisaba). | **fixed.** `sysmem_linux.rs`: suma `RssAnon` del árbol de procesos (`/proc`) y `MemTotal`; con tests. Igual que en Windows no hay atribución por pestaña. |
| L13 | menor | Edición del día "solo Wi‑Fi / solo corriente": devolvía siempre `true`. | **fixed.** `/proc/net/route` + `/sys/class/net/<if>/wireless`; `/sys/class/power_supply` (sin batería = corriente). Sin D-Bus; con tests. |
| L14 | menor | Importar marcadores: solo `%LOCALAPPDATA%`; `open_default_apps` lanzaba `explorer.exe`. | **fixed.** `~/.config/{google-chrome,microsoft-edge,BraveSoftware/Brave-Browser}/Default/Bookmarks` (`$XDG_CONFIG_HOME`); en Linux se abre el panel de aplicaciones predeterminadas de GNOME/COSMIC/KDE o se explica `xdg-settings`. Flatpak/Snap de esos navegadores no se leen. |
| L15 | menor | `backdrop-filter` sin prefijo en la barra del lector: WebKitGTK < 2.46 solo entiende `-webkit-backdrop-filter`. | **fixed.** |
| L16 | menor | NVIDIA propietario + WebKitGTK ≥ 2.42: ventana en blanco con el renderizador DMABUF (y capturas vacías). | **fixed.** `lib.rs::linux_webkit_env` fija `WEBKIT_DISABLE_DMABUF_RENDERER=1` solo si existe `/proc/driver/nvidia` y el usuario no ha fijado la variable. needs-real-Linux-test. |
| L17 | menor | `scripts/release-manifest.mjs` solo producía `windows-x86_64`. | **fixed.** Genera `linux-x86_64` (AppImage), `linux-x86_64-deb` y `-rpm` si existen sus `.sig`, y **fusiona** con un `dist/latest.json` previo de la misma versión (una máquina por plataforma). |
| L18 | menor | `prefers-color-scheme` de las páginas sigue el tema del sistema/GTK, no el de la app (en Windows se fija por perfil). `set_color_scheme` no existe en WebKitGTK. | **documented.** Una web con modo oscuro puede pintarse oscura dentro de la app en papel. |
| L19 | menor | Captura de página (transición A1, popovers y menú contextual sobre una web): `webkit_web_view_get_snapshot` puede devolver blanco con composición por GPU. | **documented** · needs-real-Linux-test. La degradación ya existe ("cualquier fallo → navegación directa"; popovers con captura fallida dejan hueco en blanco). |
| L20 | menor | e2e (`e2e/wdio.conf.ts`): `msedgedriver` + CDP, solo Windows. WebKitWebDriver no ve webviews hijas ni CDP. | **documented.** Las pruebas de contenido son manuales (§4). |
| L21 | menor | `xdg-open` (`ai_login`) abriría newpaper si es el navegador predeterminado (igual pasa con `rundll32` en Windows). | **documented.** |
| L22 | info | **Sincronización PC↔móvil** (`np-sync`): TCP en `0.0.0.0:47100` (solo acepta LAN/Tailscale/loopback) y mDNS puro Rust (`mdns-sd`, UDP 5353 multicast; **no necesita avahi**). Portable. | **documented.** Con `ufw`/`firewalld` activos hay que abrir 47100/tcp y 5353/udp en la LAN. |
| L23 | info | **Ya portable** y sin cambios: rutas XDG vía `app_local_data_dir`, SQLite (`rusqlite bundled`), `single-instance` (D‑Bus de sesión), `autostart` (escribe `~/.config/autostart/*.desktop`; con AppImage usa la ruta del AppImage), verificación minisign (`np-update::sig`), `BootGuard`, nombres de archivo del contenido firmado (lista blanca por caracteres), Arti (modo Tor), crates `np-feeds/lexicon/wayback/ai-proxy`. | verificado por compilación/tests en Linux; el resto, lectura de código. |
| L24 | info | **Tipografías:** Newsreader, IBM Plex Sans y Plex Mono van **empaquetadas** (`@fontsource`, woff2 en `apps/ui/dist/assets`); no hay Google Fonts (sin fuga de privacidad). Fallbacks: Georgia/serif y `system-ui`. | verificado. |
| L25 | info | **WebKitGTK y CSS/JS:** `color-mix` (37 usos) → WebKitGTK ≥ 2.40; `:is()`, `mask-image`, `text-wrap: balance` (≥ 2.46, solo mejora progresiva) y `scrollbar-width` (≥ 2.48, con `::-webkit-scrollbar` de respaldo ya presente) son seguros. `crypto.subtle` (hash de caché del pipeline): wry registra los esquemas propios (`tauri`, `npimg`, `npoffline`) como **seguros** (`register_uri_scheme_as_secure`), así que está disponible. Vite compila a ES2022 (Safari 15.4+). **Mínimo soportado: WebKitGTK 2.40** (Ubuntu 22.04 con actualizaciones de seguridad, Debian 12, Fedora 38+, Pop!_OS 22.04/24.04); se registra la versión en ejecución y se avisa si es menor. | verificado por lectura. |

### Verificación realizada

- `cargo check -p np-app` en Ubuntu 24.04 (WSL): **sin errores ni avisos**. En Windows (`CARGO_TARGET_DIR=E:/newpaper/target/check-linux`): sin errores ni avisos.
- `cargo test -p np-shell -p np-store -p np-adblock -p np-net -p np-update -p np-sync -p np-app` en Ubuntu 24.04: todo en verde (np-shell 45, np-store 28, np-adblock 45 + 4 de `content_filter`, np-net 32, np-sync 33, np-update 8, np-app 24; los tests de `/proc` simulado, Wi‑Fi/corriente y perfiles de Tor incluidos).
- `pnpm --filter @newpaper/ui typecheck`, `@newpaper/ui-kit typecheck` y `vitest` del lector: en verde.

## 2. Qué NO se puede decir todavía

- Ningún hallazgo marcado *needs-real-Linux-test* se ha visto funcionar. El anfitrión (`linux.rs`) está escrito contra las firmas reales de `webkit2gtk 2.0.2` (compila), pero el comportamiento de GTK (reparentar la webview al `Overlay`, medidas, foco, Wayland) solo se confirma con la lista de §4.
- **Fugas de DNS en Tor** (L2): lo que garantiza el diseño es que el proxy sea `Custom` con `socks5://` (GLib envía el nombre al proxy) y que no haya WebRTC; lo que no se puede demostrar sin `tcpdump` es que WebKit no haga ninguna resolución local (p. ej. el *prefetch* de DNS interno). Prueba obligatoria #6 de §4 antes de dar el modo Tor por bueno en Linux.

## 3. Receta de compilación (Ubuntu 22.04/24.04, Pop!_OS, Debian 12)

Paquetes (los de `apt`; sirven también en Pop!_OS):

```bash
sudo apt update
sudo apt install -y build-essential curl wget file pkg-config git patchelf \
  libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev \
  libdbus-1-dev
# Para ejecutar: un servicio de llavero (Secret Service) y ca-certificates
sudo apt install -y gnome-keyring ca-certificates      # o KWallet >= 5.97 / KeePassXC
# Para empaquetar .rpm desde Debian/Ubuntu:   sudo apt install -y rpm
# Para ejecutar un AppImage en 22.04/24.04:   sudo apt install -y libfuse2
```

Notas: es el conjunto **mínimo verificado** (`cargo check`/`cargo test` de `np-app` en Ubuntu 24.04 con estos paquetes; los `-sys` del árbol de dependencias son solo gtk/gdk/cairo/pango/atk/gdk-pixbuf, webkit2gtk, javascriptcore, soup3, dbus y SQLite empaquetado: no hay `openssl-sys`, ni appindicator ni xdo). `libsecret-1-dev` **no** hace falta: el llavero habla D‑Bus directamente (`dbus-secret-service`; `libdbus-1-dev` al compilar, `libdbus-1-3` al ejecutar). Para **empaquetar** (`cargo tauri build`) la guía de Tauri añade `librsvg2-dev libayatana-appindicator3-dev libxdo-dev libssl-dev` (los usa el empaquetador de AppImage): instálalos en la máquina de releases. Fedora: `webkit2gtk4.1-devel gtk3-devel libsoup3-devel javascriptcoregtk4.1-devel openssl-devel dbus-devel librsvg2-devel patchelf`.

Herramientas: Rust ≥ 1.85 (`rustup`), Node ≥ 20 y `pnpm`, y la CLI de Tauri (`cargo install tauri-cli --version "^2" --locked`).

```bash
git clone <repo> newpaper && cd newpaper
pnpm install --frozen-lockfile
pnpm --filter @newpaper/extract build                # el script de contenido se incrusta en el binario
pnpm --filter @newpaper/ui build

# Comprobación rápida (sin GUI) y pruebas de los crates:
cargo check --manifest-path src-tauri/Cargo.toml -p np-app
cargo test  --manifest-path src-tauri/Cargo.toml -p np-shell -p np-store -p np-adblock -p np-net

# Desarrollo (necesita sesión gráfica):
cargo tauri dev --manifest-path src-tauri/Cargo.toml   # o: pnpm tauri dev

# Paquetes (solo el coordinador de versiones; necesitan la clave de firma del actualizador):
export TAURI_SIGNING_PRIVATE_KEY=...                  # y TAURI_SIGNING_PRIVATE_KEY_PASSWORD
cargo tauri build --manifest-path src-tauri/Cargo.toml  # usa tauri.linux.conf.json: deb + rpm + AppImage
node scripts/release-manifest.mjs <version> stable "<notas>"   # fusiona con dist/latest.json de Windows si se copia antes
```

Los artefactos quedan en `src-tauri/target/release/bundle/{deb,rpm,appimage}/`. Instalación de prueba: `sudo apt install ./newpaper_<v>_amd64.deb` (instala el `.desktop` con los manejadores http/https; para ser el navegador predeterminado: `xdg-settings set default-web-browser newpaper.desktop` o el panel de Aplicaciones predeterminadas).

Variables útiles al depurar: `RUST_LOG=np_shell=debug,np_app_lib=debug`; `NP_FAKE_TOR=1` (solo debug); `NP_DEVTOOLS=1` (solo debug: Inspector); `WEBKIT_DISABLE_DMABUF_RENDERER=1` y `WEBKIT_DISABLE_COMPOSITING_MODE=1` si hay ventanas en blanco; `GDK_BACKEND=x11` para forzar XWayland si Wayland da problemas.

## 4. Lista de pruebas manuales en una máquina Linux real

Equipos recomendados: A) Ubuntu/Pop!_OS 22.04 con GNOME en X11; B) 24.04 con Wayland (COSMIC o GNOME); si se puede, una con NVIDIA propietario. Resultado esperado entre paréntesis. Cada fallo, con el `RUST_LOG` anterior y la salida del terminal.

1. **Arranque.** `newpaper` desde el lanzador (la ventana abre a 1280×820 sin destello blanco; en el registro aparece `WebKitGTK 2.xx.x`; sin error `could not lay out the UI webview`).
2. **Disposición (L1).** Abrir 3 pestañas web (elpais.com, bbc.com, theguardian.com). *Esperado:* la UI ocupa toda la ventana y la página aparece **exactamente en el hueco** bajo la barra (ni a mitad de ventana ni apilada); redimensionar y maximizar: el contenido sigue el hueco; la ventana se puede **reducir** (no queda bloqueada a su tamaño máximo).
3. **Teclado y foco.** Escribir en un formulario web; `Ctrl+L`, `Ctrl+T`, `Ctrl+W`, `Ctrl+Tab` (los atajos de la UI siguen funcionando tras hacer clic en la página; llegan por el canal de mensajes).
4. **Lector (L4).** Abrir un artículo de un medio conocido: *esperado* piel de carga y luego el lector (sin ver la original); selector de artículos en una portada; "Ver original".
5. **Menú contextual (L5).** Clic derecho en página, enlace, imagen, texto seleccionado y campo editable: menú propio de newpaper (no el de WebKit); "Abrir en pestaña nueva"; pegar desde el portapapeles del sistema.
6. **Tor, sin fugas (L2).** `NP_FAKE_TOR=1` primero y luego Tor real. Con `sudo tcpdump -ni any port 53` durante la navegación: **cero** paquetes DNS de newpaper; `ss -tnp | grep -E 'newpaper|WebKitNetwork'`: solo conexiones a `127.0.0.1:<puerto SOCKS>`; https://check.torproject.org dice que se usa Tor; https://browserleaks.com/webrtc no muestra ninguna IP; **kill switch:** con Tor sin arrancar (o detenido), una pestaña nueva **no carga** (error) y no sale tráfico directo; pestaña "sin Tor" sí va directa; cambiar de país de salida recrea la pestaña activa.
7. **Bloqueo (L6).** Abrir `e2e/fixtures/ads.html` y una portada con anuncios: *esperado* sin `PUBLICIDAD` y con la mayoría de anuncios ocultos; en el registro `content blocking rules active` tras unos segundos del arranque; desactivar el bloqueo en Ajustes → las reglas se quitan (recargar: vuelven los anuncios). Si aparece `rules were rejected by WebKit`, el bloqueo de red está apagado: ver §5.
8. **Llavero (L3).** Guardar una clave de IA, cerrar la sesión y volver (GNOME Keyring desbloqueado): la clave sigue (`secret_has` verdadero). Detener el servicio (`systemctl --user stop gnome-keyring-daemon.service gnome-keyring-daemon.socket`): guardar una clave muestra un error claro y **no** la guarda en ninguna parte.
9. **Permisos de datos (L9).** `stat -c '%a' ~/.local/share/org.newpaper.app` → `700`.
10. **Imágenes sin conexión (L10).** Guardar la edición del día con fotos, quedarse sin red y abrir un artículo: las imágenes se ven (`npoffline://`).
11. **Capturas (L19).** Con una web abierta, abrir la lista de pestañas, el popover de Tor y el menú contextual: la página se queda congelada bajo el popover (sin hueco blanco prolongado). Si falla: probar `WEBKIT_DISABLE_DMABUF_RENDERER=1`; anotar GPU y sesión (X11/Wayland).
12. **Aviso de recursos (L12).** `NP_TEST_RESOURCE_LIMIT_MB=300` (debug): aparece el diálogo con una cifra de MiB parecida a `htop` (±25 %).
13. **Edición del día (L13).** Con "solo Wi‑Fi" en Ethernet no se construye; con "solo corriente" en batería no se construye.
14. **Marcadores (L14).** Primer arranque → importar de Chrome/Brave/Edge (si están instalados en `~/.config`).
15. **Paquetes (L8).** `.deb` en 22.04 y 24.04 limpias (`apt install ./…deb` sin dependencias rotas), icono y nombre en el lanzador, desinstalación limpia; AppImage en 24.04 (`libfuse2`); abrir un enlace `https://` desde otra aplicación con newpaper como predeterminado lo abre en una pestaña nueva (y, con la app ya abierta, no se lanza una segunda instancia).
16. **Actualizaciones (L7).** Con un `latest.json` de prueba más nuevo: el AppImage descarga y queda "lista" (sin error del instalador NSIS); al cerrar se aplica. `.deb`: el actualizador pide `pkexec`; o actualizar con `apt`.
17. **Sincronización (L22).** Emparejar con el móvil por QR en la misma LAN (con `ufw` activo, tras abrir 47100/tcp y 5353/udp).
18. **HiDPI.** 150 % y 200 %, y dos monitores con escalas distintas: el contenido sigue el hueco sin franjas.
19. **Suspender/reanudar** con Tor activo: reconecta y no hay tráfico directo en el intervalo.

## 5. Limitaciones conocidas en Linux

- **Bloqueo de red menos preciso que en Windows (L6).** WebKitGTK no deja interceptar peticiones: se usan reglas de bloqueo de contenido de WebKit. Sin `$redirect`/`$removeparam`/`$badfilter` completos (los scripts anti‑adblock pueden fallar), tope de 140 000 reglas (hoy no se descarta ninguna con las listas actuales; si se supera se descartan reglas de bloqueo, nunca las excepciones, y se registra cuántas), compilación asíncrona de varios segundos al arrancar o al cambiar listas (hasta entonces las pestañas nuevas cargan sin filtro) y **sin contador exacto por petición** (el escudo no cuenta bloqueos de red en Linux; el cosmético sí por guion). Si WebKit rechaza el JSON, el bloqueo de red queda apagado y solo se registra un error.
- **Tema de páginas (L18)** y **capturas (L19)** como arriba.
- **Una vuelta atrás automática tras un arranque fallido existe solo en Windows (L7).** En Linux, los `.deb`/`.rpm` se revierten con el gestor de paquetes.
- **Autoactualización:** AppImage (reemplaza el fichero) y `.deb`/`.rpm` (el plugin los instala con `pkexec`); Flatpak/Snap no están empaquetados. Los repositorios de distribución no se autoactualizan por esta vía.
- **Sin atribución de memoria por pestaña** (igual que Windows).
- **Wayland:** la webview de contenido es un widget GTK hijo (no una subventana X11), así que funciona igual en Wayland y X11; el portapapeles necesita que la ventana tenga el foco.
- **`e2e` (WebdriverIO)** solo en Windows (L20).
- **Sin bandeja del sistema** (no se usa); **sin Flatpak** todavía (si se hace: `--talk-name=org.freedesktop.secrets`, `--own-name` para single-instance, `--share=network`).
- **Distribuciones sin `ca-certificates`** (contenedores mínimos) no verifican TLS (rustls usa el almacén del sistema).

## 6. Cambios de código (resumen)

`np-shell`: `host/linux.rs` (nuevo), `sysmem_linux.rs` (nuevo), `extensions.rs` (`WebviewProfile.proxy`), `host/mod.rs` (cableado y `set_webview_bounds`), `Cargo.toml` (gtk, webkit2gtk, cairo). `np-store`: llavero Linux. `np-adblock`: `content_filter.rs` + feature `content-blocking`. `np-app`: `setup.rs` (llavero, 0700, harden_ui), `privacy/{mod,adapters,commands}.rs` (proxy de Tor, reglas de bloqueo), `system/{mod,updater,firstrun}.rs`, `sources/offline_sched.rs`, `resources.rs`, `commands/tabs.rs`, `lib.rs`. UI: `ReaderSurface.tsx`, `ui-kit/reader/sanitize.ts` (+test), `shell.css`. Empaquetado: `tauri.linux.conf.json`, `linux/newpaper.desktop`, `scripts/release-manifest.mjs`. Windows: comportamiento sin cambios (todo detrás de `cfg(target_os = "linux")`/`cfg(not(windows))`, salvo `WebviewProfile.proxy`, que en Windows se rellena pero no se usa).

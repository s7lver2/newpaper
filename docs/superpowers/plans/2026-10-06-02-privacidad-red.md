# newpaper · Subproyecto 2 — Privacidad y red · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bloquear anuncios, rastreadores, banners de cookies y modales de suscripción en las webviews de contenido, y navegar por Tor (Arti embebido) con país de salida, nuevo circuito y kill switch, con su interfaz: escudo con contador, popup compacto de Tor con selector de flechas y avión, aviso de "abrir sin Tor" y Ajustes › Privacidad y red / Bloqueo.

**Architecture:** Dos crates nuevos. `np-adblock` envuelve el motor `adblock` de Brave (listas con copia embebida y refresco cada 24 h, gancho `WebResourceRequested` de WebView2, cosméticos por script inyectado, contadores en SQLite). `np-net` sirve un proxy SOCKS5 propio en `127.0.0.1:<puerto aleatorio>` cuyo único conector es Arti: si Arti no está listo, el proxy responde error (kill switch); además decide qué cliente `reqwest` usa cada tipo de tráfico. El crate `np-app` cablea ambos a los puntos de extensión del subproyecto 1 (`ShellExtensions`: perfil de webview, gancho de creación, manejador de mensajes, script inicial y proveedor HTTP) en un único módulo `privacy`, y expone comandos y eventos. La UI añade el escudo, el chip y popup de Tor, el diálogo "abrir sin Tor" y dos secciones de Ajustes.

**Tech Stack:** Rust (Tauri 2.12.1, `adblock` =0.13.3, `arti-client` =0.47.0 con `tokio` + `rustls` + `geoip`, `tor-rtcompat` =0.47.0, `webview2-com` 0.39, `windows` 0.62, `tokio` 1.53, `reqwest` 0.13.5 con `socks`, `rusqlite` 0.40), React 19 + TypeScript + Vitest + Testing Library, WebdriverIO + `tauri-driver`.

## Decisiones tomadas

1. **Un solo proxy SOCKS5 durante toda la sesión**, levantado al arrancar aunque el modo sea Directo. Su puerto no cambia, así que el perfil de WebView2 "tor" (carpeta `webview/tor` y argumentos con ese puerto) es estable; cambiar de país no cambia argumentos, solo recrea las webviews para cortar conexiones abiertas por el circuito anterior.
2. **Dos perfiles de WebView2** (subproyecto 1, `WebviewProfile`): `direct` (argumentos por defecto de Tauri) y `tor` (`--proxy-server=socks5://127.0.0.1:<p>`, `--host-resolver-rules="MAP * ~NOTFOUND , EXCLUDE 127.0.0.1"` y `--force-webrtc-ip-handling-policy=disable_non_proxied_udp`). Una pestaña marcada "sin Tor" usa `direct` aunque el modo sea Tor.
3. **Nuevo circuito** = nuevo `arti_client::IsolationToken` aplicado con `StreamPrefs::set_isolation`; recrea la pestaña activa para que sus conexiones usen el circuito nuevo.
4. **Rutas de tráfico** (`np_net::Traffic`): web, imágenes del lector, hemeroteca, búsquedas y actualizaciones siguen el modo; RSS sigue el modo salvo `privacy.feedsViaTor = false`; IA va **directa** salvo `privacy.aiViaTor = true` (spec §4.2: "por defecto: RSS por Tor, IA directa"). `localhost`, `127.0.0.1` y `::1` nunca pasan por el proxy (Ollama/LM Studio locales).
5. **Arti simulado** para tests y e2e: `np_net::fake::FakeTor` (conecta directo pero obedece "listo/no listo"). En builds de depuración, `NP_FAKE_TOR=1` lo usa en lugar de Arti (spec §12: "cambiar país de Tor (con Arti simulado)").
6. **No se muestran** latencia por país, número de relés de salida ni país de guardia/medio: Arti no los expone de forma estable. El popup muestra "Tú → Guardia → Medio → Salida · <país>" sin país intermedio y sin latencia. El "ahorro en MB" del mockup tampoco se calcula en v1.
7. **Scriptlets de uBlock** (`##+js(...)`) y filtros procedimentales: fuera de alcance v1 (necesitan los recursos de uBO). Los cosméticos se aplican solo en el marco principal.
8. **Licencias**: EasyList/EasyPrivacy/Fanboy (GPLv3 o CC BY-SA 3.0) y uAssets (GPLv3) se embeben como datos con `SOURCES.txt` de atribución; revisar con quien decida la licencia del proyecto.
9. **WireGuard** aparece deshabilitado ("fase 2") en Ajustes, sin código.
10. Los nombres de las listas son nombres propios (no se traducen); las categorías sí (`privacy.blocking.category.*`).

## Global Constraints

- Plataforma: Windows primero, Tauri 2 + WebView2. Código específico de WebView2 bajo `#[cfg(windows)]`.
- Crates: `src-tauri/crates/np-adblock`, `src-tauri/crates/np-net`; app = crate `np-app` en `src-tauri/`.
- Motor: crate `adblock` fijado a `=0.13.3`, **sin** la feature `single-thread` (para que `Engine` sea `Send + Sync`).
- Tor: `arti-client` fijado a `=0.47.0` con `geoip` (`StreamPrefs::exit_country`); `geoip` es experimental en Arti: por eso versión exacta.
- Listas: EasyList, EasyPrivacy, filtros de uBlock Origin, banners de cookies y modales de suscripción; "descargadas al primer arranque y cada 24 h (por Tor si está activo); copia embebida de respaldo".
- Intercepción con `add_WebResourceRequested` (filtro `*`), "devolviendo 403 vacío a lo bloqueado". Cosméticos vía script inyectado con selectores del motor.
- "Contadores por pestaña y por día (UI: escudo con número)".
- Tor: "proxy SOCKS5 local en `127.0.0.1:<puerto aleatorio>` servido por np-net; WebView2 creado con `--proxy-server=socks5://127.0.0.1:<p>` (DNS resuelto en remoto) y `--force-webrtc-ip-handling-policy=disable_non_proxied_udp`".
- "**Kill switch:** si Arti no está listo o cae, el proxy rechaza conexiones; nunca hay vuelta silenciosa a directo. Abrir sin Tor es una acción explícita por pestaña con aviso."
- "Cambiar de país o de modo **recrea el entorno WebView2** (2 s aprox.) y recarga las pestañas." "Nuevo circuito: aislar flujos con un nuevo `IsolationToken`."
- "Las peticiones de IA y RSS siguen el modo de red salvo que el ajuste 'IA por Tor' esté desactivado (por defecto: RSS por Tor, IA directa)."
- WireGuard: fase 2.
- Seguridad: las webviews de contenido no tienen IPC; los WebMessage se validan en Rust.
- i18n: todo texto visible en `packages/i18n/locales/{es,en,de}.json`; el test de CI de la Tarea 3 del subproyecto 1 no admite textos escritos a mano.
- Estética y accesibilidad del subproyecto 1 (tokens `--np-*`, Tor `--np-tor`, objetivos ≥ 44 px, `aria-*`, teclado, `prefers-reduced-motion`).
- `rusqlite` del workspace en `>=0.36, <0.41` (lo exige `tor-dirmgr` 0.47): el subproyecto 1 fija `0.40`.
- Código, identificadores y mensajes de commit en inglés.

---

## Interfaces del subproyecto 1 que usa este plan

Nombres reales (plan `2026-10-06-01-nucleo.md`):

- `np_shell::extensions::{ShellExtensions, WebviewProfile, WebviewProfileProvider, ContentWebviewHook, ContentMessageHandler, HttpClientProvider, HttpPurpose, DEFAULT_BROWSER_ARGS}` y `ShellExtensions::{set_profile_provider, add_hook, add_message_handler, add_init_script, set_http_provider, http_client}`. Los mensajes `Other` llegan con `type` incluido en `payload`.
- `np_shell::TabManager::{recreate_all_content_webviews, recreate_tab, snapshot}` (async) y `np_shell::TabId = u64`.
- `np_store::Store::{get_setting, set_setting, with_conn}`, `np_store::migrations::{Migration, MIGRATIONS}` (ranura **2** reservada para `blocked_stats`).
- Estado gestionado por Tauri: `Arc<Store>`, `Arc<ShellExtensions>`, `Arc<TabManager>`.
- `src-tauri/src/features.rs::setup_all` (se añade `crate::privacy::setup(app)?;`), `src-tauri/build.rs::APP_COMMANDS`, `src-tauri/capabilities/ui.json`, `tauri::generate_handler!` en `src-tauri/src/lib.rs`.
- UI: `apps/ui/src/ipc/{commands,events,types}.ts` (se añaden entradas), `apps/ui/src/shell/registry.ts` (`registerToolbarItem`, `registerSettingsSection`, `registerOverlay`), `apps/ui/src/shell/navigate.ts::openInternal`, `apps/ui/src/state/browser.ts::{useActiveTab, useActiveTabId}`, `apps/ui/src/state/settings.ts::useSetting`, `apps/ui/src/test/renderWithI18n.tsx`, `@newpaper/ui-kit` (`IconButton`, `Button`, `Switch`, `SegmentedControl`, `useReducedMotion`), `apps/ui/src/features/index.ts`.
- e2e: `e2e/wdio.conf.ts`, `e2e/helpers.ts::{switchToUi, uiInvoke, FIXTURE_URL}`, `e2e/fixtures/server.ts`.

## Contratos que publica este plan

| Elemento | Lo usan |
|---|---|
| `np_net::{NetController, NetSettings, NetStatus, NetMode, TorState, Traffic}`, `NetController::{http_client(Traffic), status, subscribe, socks_port}` | 3, 4, 6, 7, 8 |
| `np_net::fake::FakeTor` | tests de 3, 4, 6 |
| Estado gestionado `Arc<np_net::NetController>`, `Arc<np_adblock::service::AdblockService>`, `Arc<privacy::adapters::NetProfiles>` | 6, 8 |
| Comando `tab_without_tor`, función UI `requestOpenWithoutTor(tabId)` (`apps/ui/src/features/privacy/withoutTor.ts`) | 6 (página "Tor bloqueado") |
| Eventos `net://status`, `adblock://blocked` | 5, 6 |
| Ajustes `privacy.mode`, `privacy.exitCountry`, `privacy.aiViaTor`, `privacy.feedsViaTor`, `adblock.settings` | 6 (instalador/recorrido), 7 (sincronización) |

## Mapa de archivos

```
src-tauri/
  Cargo.toml                                  (Modify: deps np-adblock, np-net)
  build.rs  capabilities/ui.json  src/lib.rs  src/features.rs   (Modify: comandos y setup)
  src/privacy/mod.rs                          setup, tareas de fondo, reconstrucción del motor
  src/privacy/settings.rs                     ajustes ↔ NetSettings/AdblockSettings
  src/privacy/adapters.rs                     perfiles, HTTP, gancho, mensajes, avisos
  src/privacy/commands.rs                     comandos Tauri
  crates/np-store/src/migrations.rs           (Modify: migración 2)
  crates/np-adblock/
    Cargo.toml  assets/lists/*.txt  assets/lists/SOURCES.txt  assets/cosmetic.js  sql/blocked_stats.sql
    src/lib.rs blocker.rs cosmetic.rs lists.rs updater.rs stats.rs service.rs cosmetic_msg.rs webview2.rs
  crates/np-net/
    Cargo.toml
    src/lib.rs error.rs mode.rs socks.rs server.rs tor.rs controller.rs fake.rs
    tests/socks_server.rs  tests/http_routing.rs  tests/tor_live.rs
scripts/fetch-filter-lists.ps1
apps/ui/src/ipc/{commands,events,types}.ts   (Modify)
apps/ui/src/features/privacy/
  usePrivacy.ts countries.ts withoutTor.ts
  ShieldBadge.tsx TorChip.tsx TorPopup.tsx OpenWithoutTorDialog.tsx DotMap.tsx
  PrivacySection.tsx BlockingSection.tsx register.ts privacy.css  *.test.ts(x)
packages/i18n/locales/{es,en,de}.json         (Modify: espacio `privacy`)
e2e/specs/privacy.e2e.ts  e2e/fixtures/ads.html  e2e/fixtures/ads/banner.js  (e2e/wdio.conf.ts Modify)
```

Todos los comandos se ejecutan desde `E:\newpaper` en PowerShell.

---
### Task 1: Crate `np-adblock` y bloqueo de red

**Files:**
- Create: `src-tauri/crates/np-adblock/Cargo.toml`
- Create: `src-tauri/crates/np-adblock/src/lib.rs`
- Create: `src-tauri/crates/np-adblock/src/blocker.rs`

**Interfaces:**
- Produces:
  - `np_adblock::blocker::ResourceType` (enum `Document | Subdocument | Stylesheet | Image | Media | Font | Script | Xhr | Fetch | Websocket | Ping | Other`, `as_adblock_str(self) -> &'static str`)
  - `np_adblock::blocker::Blocker` con `from_lists<I: IntoIterator<Item = S>, S: AsRef<str>>(lists: I) -> Blocker`, `empty() -> Blocker`, `should_block(&self, url: &str, source_url: &str, kind: ResourceType, method: &str) -> bool`, `pub(crate) fn engine(&self) -> &adblock::Engine`

- [ ] **Step 1: Crear el crate**

`src-tauri/crates/np-adblock/Cargo.toml`:
```toml
[package]
name = "np-adblock"
version = "0.1.0"
edition = "2021"
publish = false

[dependencies]
adblock = { version = "=0.13.3", default-features = false, features = ["embedded-domain-resolver", "full-regex-handling"] }
async-trait = { workspace = true }
chrono = { workspace = true }
rusqlite = { workspace = true }
serde = { workspace = true }
serde_json = { workspace = true }
tracing = { workspace = true }

[target.'cfg(windows)'.dependencies]
tauri = { workspace = true }
webview2-com = { workspace = true }
windows = { workspace = true }
windows-core = { workspace = true }

[dev-dependencies]
tempfile = { workspace = true }
tokio = { workspace = true }
```

`src-tauri/crates/np-adblock/src/lib.rs`:
```rust
//! Bloqueo de anuncios, rastreadores y molestias para las webviews de contenido.
pub mod blocker;
```

El workspace del subproyecto 1 usa `members = [".", "crates/*"]`: no hay que tocar `src-tauri/Cargo.toml`.

- [ ] **Step 2: Escribir los tests que fallan**

`src-tauri/crates/np-adblock/src/blocker.rs`:
```rust
//! Bloqueo de red sobre el motor `adblock` (adblock-rust de Brave).

#[cfg(test)]
mod tests {
    use super::*;

    const RULES: &str = "\
||ads.example.com^
||tracker.example.net^$third-party
@@||ads.example.com/allowed/
";

    fn blocker() -> Blocker {
        Blocker::from_lists([RULES])
    }

    #[test]
    fn blocks_listed_ad_domain() {
        assert!(blocker().should_block(
            "https://ads.example.com/banner.js",
            "https://news.example.org/",
            ResourceType::Script,
            "GET"
        ));
    }

    #[test]
    fn exception_rule_allows_request() {
        assert!(!blocker().should_block(
            "https://ads.example.com/allowed/pixel.gif",
            "https://news.example.org/",
            ResourceType::Image,
            "GET"
        ));
    }

    #[test]
    fn third_party_rule_only_blocks_cross_site() {
        let b = blocker();
        assert!(!b.should_block(
            "https://tracker.example.net/t.js",
            "https://www.example.net/",
            ResourceType::Script,
            "GET"
        ));
        assert!(b.should_block(
            "https://tracker.example.net/t.js",
            "https://news.example.org/",
            ResourceType::Script,
            "GET"
        ));
    }

    #[test]
    fn never_blocks_main_document() {
        assert!(!blocker().should_block(
            "https://ads.example.com/",
            "",
            ResourceType::Document,
            "GET"
        ));
    }

    #[test]
    fn unrelated_request_is_allowed() {
        assert!(!blocker().should_block(
            "https://cdn.example.org/app.js",
            "https://news.example.org/",
            ResourceType::Script,
            "GET"
        ));
    }

    #[test]
    fn empty_blocker_allows_everything() {
        assert!(!Blocker::empty().should_block(
            "https://ads.example.com/banner.js",
            "https://news.example.org/",
            ResourceType::Script,
            "GET"
        ));
    }

    #[test]
    fn blocker_is_send_and_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<Blocker>();
    }

    #[test]
    fn maps_resource_types_to_adblock_names() {
        assert_eq!(ResourceType::Xhr.as_adblock_str(), "xmlhttprequest");
        assert_eq!(ResourceType::Fetch.as_adblock_str(), "xmlhttprequest");
        assert_eq!(ResourceType::Subdocument.as_adblock_str(), "subdocument");
    }
}
```

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-adblock blocker`
Expected: FAIL de compilación (`cannot find type Blocker in this scope`).

- [ ] **Step 4: Implementación mínima**

Añadir **encima** del módulo de tests en `blocker.rs`:
```rust
use adblock::{
    lists::{FilterSet, ParseOptions},
    request::Request,
    Engine,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ResourceType {
    Document,
    Subdocument,
    Stylesheet,
    Image,
    Media,
    Font,
    Script,
    Xhr,
    Fetch,
    Websocket,
    Ping,
    Other,
}

impl ResourceType {
    /// Nombre de tipo que entiende `adblock::request::Request::new`.
    pub fn as_adblock_str(self) -> &'static str {
        match self {
            ResourceType::Document => "document",
            ResourceType::Subdocument => "subdocument",
            ResourceType::Stylesheet => "stylesheet",
            ResourceType::Image => "image",
            ResourceType::Media => "media",
            ResourceType::Font => "font",
            ResourceType::Script => "script",
            ResourceType::Xhr | ResourceType::Fetch => "xmlhttprequest",
            ResourceType::Websocket => "websocket",
            ResourceType::Ping => "ping",
            ResourceType::Other => "other",
        }
    }
}

pub struct Blocker {
    engine: Engine,
}

impl Blocker {
    /// Construye el motor con el texto completo de cada lista (formato ABP/uBO).
    pub fn from_lists<I, S>(lists: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        let mut set = FilterSet::new(false);
        for text in lists {
            set.add_filter_list(text.as_ref().to_owned(), ParseOptions::default());
        }
        Self {
            engine: Engine::new_with_filter_set(set),
        }
    }

    pub fn empty() -> Self {
        Self::from_lists(std::iter::empty::<&str>())
    }

    /// `true` si la petición debe recibir un 403 vacío. Nunca bloquea el documento principal.
    pub fn should_block(&self, url: &str, source_url: &str, kind: ResourceType, method: &str) -> bool {
        if kind == ResourceType::Document {
            return false;
        }
        let method = method.to_ascii_lowercase();
        match Request::new(url, source_url, kind.as_adblock_str(), &method) {
            Ok(request) => self.engine.check_network_request(&request).should_block(),
            Err(_) => false,
        }
    }

    pub(crate) fn engine(&self) -> &Engine {
        &self.engine
    }
}
```

> Si `add_filter_list` en 0.13.3 recibe `&str` en vez de `String`, quita el `.to_owned()`. Si `cargo` dice que `Engine` no es `Send`, revisa que no se haya colado la feature `single-thread` (`cargo tree -e features -i adblock --manifest-path src-tauri/Cargo.toml`).

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-adblock blocker`
Expected: `test result: ok. 8 passed`.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/crates/np-adblock
git commit -m "feat(np-adblock): network blocking engine on adblock-rust"
```

---

### Task 2: Filtrado cosmético (selectores)

**Files:**
- Create: `src-tauri/crates/np-adblock/src/cosmetic.rs`
- Modify: `src-tauri/crates/np-adblock/src/lib.rs`

**Interfaces:**
- Consumes: `Blocker::engine()` (Task 1).
- Produces:
  - `np_adblock::cosmetic::CosmeticResources { hide_selectors: Vec<String>, exceptions: Vec<String>, injected_script: String, generichide: bool }` (`Serialize`, `Default`, `Clone`, `PartialEq`, `Debug`)
  - `impl Blocker { pub fn cosmetic_for(&self, url: &str) -> CosmeticResources; pub fn generic_selectors(&self, classes: &[String], ids: &[String], exceptions: &[String]) -> Vec<String> }`
  - `np_adblock::cosmetic::css_for_selectors(selectors: &[String]) -> String`

- [ ] **Step 1: Test que falla**

Añade `pub mod cosmetic;` a `src/lib.rs`.

`src-tauri/crates/np-adblock/src/cosmetic.rs`:
```rust
//! Selectores cosméticos (ocultar banners) a partir del motor.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blocker::Blocker;

    const RULES: &str = "\
example.org##.cookie-banner
##.newsletter-modal
safe.example.com#@#.newsletter-modal
";

    #[test]
    fn hostname_specific_selectors_apply_only_to_that_site() {
        let b = Blocker::from_lists([RULES]);
        assert!(b
            .cosmetic_for("https://example.org/noticia")
            .hide_selectors
            .contains(&".cookie-banner".to_string()));
        assert!(!b
            .cosmetic_for("https://otro.example.net/")
            .hide_selectors
            .contains(&".cookie-banner".to_string()));
    }

    #[test]
    fn generic_class_selectors_are_returned_for_seen_classes() {
        let b = Blocker::from_lists([RULES]);
        let out = b.generic_selectors(
            &["newsletter-modal".to_string(), "articulo".to_string()],
            &[],
            &[],
        );
        assert_eq!(out, vec![".newsletter-modal".to_string()]);
    }

    #[test]
    fn exceptions_suppress_generic_selectors() {
        let b = Blocker::from_lists([RULES]);
        let res = b.cosmetic_for("https://safe.example.com/");
        let out = b.generic_selectors(&["newsletter-modal".to_string()], &[], &res.exceptions);
        assert!(out.is_empty());
    }

    #[test]
    fn css_has_one_rule_per_selector() {
        let css = css_for_selectors(&[".a".to_string(), "#b".to_string()]);
        assert_eq!(
            css,
            ".a { display: none !important; }\n#b { display: none !important; }\n"
        );
        assert_eq!(css_for_selectors(&[]), "");
    }
}
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-adblock cosmetic`
Expected: FAIL (`no method named cosmetic_for`).

- [ ] **Step 3: Implementación**

Añade encima de los tests en `cosmetic.rs`:
```rust
use std::collections::HashSet;

use serde::Serialize;

use crate::blocker::Blocker;

#[derive(Debug, Default, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CosmeticResources {
    pub hide_selectors: Vec<String>,
    pub exceptions: Vec<String>,
    pub injected_script: String,
    pub generichide: bool,
}

impl Blocker {
    /// Selectores específicos de la URL (y genéricos no de clase/id).
    pub fn cosmetic_for(&self, url: &str) -> CosmeticResources {
        let r = self.engine().url_cosmetic_resources(url);
        let mut hide: Vec<String> = r.hide_selectors.into_iter().collect();
        hide.sort();
        let mut exceptions: Vec<String> = r.exceptions.into_iter().collect();
        exceptions.sort();
        CosmeticResources {
            hide_selectors: hide,
            exceptions,
            injected_script: r.injected_script,
            generichide: r.generichide,
        }
    }

    /// Selectores genéricos `.clase` / `#id` que aplican a las clases e ids vistos en la página.
    pub fn generic_selectors(&self, classes: &[String], ids: &[String], exceptions: &[String]) -> Vec<String> {
        let exc: HashSet<String> = exceptions.iter().cloned().collect();
        let mut out = self.engine().hidden_class_id_selectors(classes, ids, &exc);
        out.sort();
        out
    }
}

/// Una regla por selector: un selector inválido no invalida a los demás.
pub fn css_for_selectors(selectors: &[String]) -> String {
    let mut css = String::new();
    for s in selectors {
        css.push_str(s);
        css.push_str(" { display: none !important; }\n");
    }
    css
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-adblock cosmetic`
Expected: `test result: ok. 4 passed`.

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/crates/np-adblock
git commit -m "feat(np-adblock): site-specific and generic cosmetic selectors"
```

---

### Task 3: Registro de listas, copia embebida y caché en disco

**Files:**
- Create: `scripts/fetch-filter-lists.ps1`
- Create: `src-tauri/crates/np-adblock/assets/lists/*.txt` (generados por el script)
- Create: `src-tauri/crates/np-adblock/assets/lists/SOURCES.txt`
- Create: `src-tauri/crates/np-adblock/src/lists.rs`
- Modify: `src-tauri/crates/np-adblock/src/lib.rs`

**Interfaces:**
- Produces:
  - `ListCategory` (`Ads | Privacy | Cookies | Newsletters`, `Serialize`, camelCase)
  - `FilterListSpec { id: &'static str, name: &'static str, url: &'static str, category: ListCategory, embedded: &'static str }`
  - `pub static FILTER_LISTS: &[FilterListSpec]`, `pub fn spec(id: &str) -> Option<&'static FilterListSpec>`
  - `CachedMeta { fetched_at: i64 }` (serde)
  - `ListCache::new(dir: impl Into<PathBuf>)`, `read(&self, id) -> Option<(String, CachedMeta)>`, `read_meta(&self, id) -> Option<CachedMeta>`, `write(&self, id, text: &str, meta: &CachedMeta) -> std::io::Result<()>`, `last_refresh(&self) -> Option<i64>`, `set_last_refresh(&self, ts: i64) -> std::io::Result<()>`
  - `ListSource { Downloaded { fetched_at: i64 }, Embedded }`, `LoadedList { id: &'static str, text: String, source: ListSource }`
  - `load_lists(cache: &ListCache, enabled: &[String]) -> Vec<LoadedList>`

- [ ] **Step 1: Script de descarga de las copias embebidas**

`scripts/fetch-filter-lists.ps1`:
```powershell
# Descarga las copias embebidas de las listas de filtros de np-adblock.
# Uso: pwsh scripts/fetch-filter-lists.ps1
$ErrorActionPreference = "Stop"
$dest = Join-Path $PSScriptRoot "..\src-tauri\crates\np-adblock\assets\lists"
New-Item -ItemType Directory -Force $dest | Out-Null
$lists = [ordered]@{
  "easylist"          = "https://easylist.to/easylist/easylist.txt"
  "easyprivacy"       = "https://easylist.to/easylist/easyprivacy.txt"
  "ubo-filters"       = "https://ublockorigin.github.io/uAssets/filters/filters.txt"
  "ubo-privacy"       = "https://ublockorigin.github.io/uAssets/filters/privacy.txt"
  "easylist-cookie"   = "https://secure.fanboy.co.nz/fanboy-cookiemonster.txt"
  "ubo-cookies"       = "https://ublockorigin.github.io/uAssets/filters/annoyances-cookies.txt"
  "fanboy-newsletter" = "https://secure.fanboy.co.nz/fanboy-newsletter.txt"
}
foreach ($id in $lists.Keys) {
  $out = Join-Path $dest "$id.txt"
  Invoke-WebRequest -Uri $lists[$id] -OutFile $out -UseBasicParsing
  $size = (Get-Item $out).Length
  if ($size -lt 10000) { throw "$id too small ($size bytes)" }
  Write-Host "$id OK ($size bytes)"
}
```

Run: `pwsh scripts/fetch-filter-lists.ps1`
Expected: 7 líneas `<id> OK (<n> bytes)`; tamaños aproximados (2026-10-06): easylist ≈2,1 MB, easyprivacy ≈1,5 MB, ubo-filters ≈0,47 MB, ubo-privacy ≈0,18 MB, easylist-cookie ≈0,9 MB, ubo-cookies ≈0,38 MB, fanboy-newsletter ≈0,3 MB.

`src-tauri/crates/np-adblock/assets/lists/SOURCES.txt`:
```text
Copias embebidas de respaldo de np-adblock. Se sustituyen en tiempo de ejecución por la última
descarga (cada 24 h). Regenerar con scripts/fetch-filter-lists.ps1.

easylist.txt          EasyList — https://easylist.to/ — GPLv3 / CC BY-SA 3.0
easyprivacy.txt       EasyPrivacy — https://easylist.to/ — GPLv3 / CC BY-SA 3.0
ubo-filters.txt       uBlock Origin filters — https://github.com/uBlockOrigin/uAssets — GPLv3
ubo-privacy.txt       uBlock Origin privacy — https://github.com/uBlockOrigin/uAssets — GPLv3
easylist-cookie.txt   EasyList Cookie List (Fanboy Cookiemonster) — https://secure.fanboy.co.nz/ — GPLv3 / CC BY-SA 3.0
ubo-cookies.txt       uBlock Origin annoyances-cookies — https://github.com/uBlockOrigin/uAssets — GPLv3
fanboy-newsletter.txt Fanboy Newsletter — https://secure.fanboy.co.nz/ — GPLv3 / CC BY-SA 3.0
```

- [ ] **Step 2: Tests que fallan**

Añade `pub mod lists;` a `src/lib.rs`.

`src-tauri/crates/np-adblock/src/lists.rs`:
```rust
//! Registro de listas de filtros, copia embebida y caché en disco.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_has_the_seven_lists_with_embedded_copies() {
        let ids: Vec<&str> = FILTER_LISTS.iter().map(|l| l.id).collect();
        assert_eq!(
            ids,
            vec![
                "easylist",
                "easyprivacy",
                "ubo-filters",
                "ubo-privacy",
                "easylist-cookie",
                "ubo-cookies",
                "fanboy-newsletter"
            ]
        );
        for l in FILTER_LISTS {
            assert!(l.embedded.len() > 10_000, "{} sin copia embebida", l.id);
            assert!(l.url.starts_with("https://"));
        }
        assert!(spec("easylist").is_some());
        assert!(spec("nope").is_none());
    }

    #[test]
    fn cache_round_trip_and_last_refresh() {
        let dir = tempfile::tempdir().unwrap();
        let cache = ListCache::new(dir.path());
        assert!(cache.read("easylist").is_none());
        assert_eq!(cache.last_refresh(), None);

        cache.write("easylist", "||a.com^\n", &CachedMeta { fetched_at: 42 }).unwrap();
        let (text, meta) = cache.read("easylist").unwrap();
        assert_eq!(text, "||a.com^\n");
        assert_eq!(meta.fetched_at, 42);
        assert_eq!(cache.read_meta("easylist").unwrap().fetched_at, 42);

        cache.write("easylist", "||b.com^\n", &CachedMeta { fetched_at: 43 }).unwrap();
        assert_eq!(cache.read("easylist").unwrap().0, "||b.com^\n");

        cache.set_last_refresh(100).unwrap();
        assert_eq!(cache.last_refresh(), Some(100));
    }

    #[test]
    fn load_prefers_downloaded_copy_and_falls_back_to_embedded() {
        let dir = tempfile::tempdir().unwrap();
        let cache = ListCache::new(dir.path());
        cache.write("easyprivacy", "||t.com^\n", &CachedMeta { fetched_at: 7 }).unwrap();

        let loaded = load_lists(&cache, &["easylist".into(), "easyprivacy".into(), "desconocida".into()]);
        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0].id, "easylist");
        assert_eq!(loaded[0].source, ListSource::Embedded);
        assert!(!loaded[0].text.is_empty());
        assert_eq!(loaded[1].id, "easyprivacy");
        assert_eq!(loaded[1].source, ListSource::Downloaded { fetched_at: 7 });
        assert_eq!(loaded[1].text, "||t.com^\n");
    }
}
```

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-adblock lists`
Expected: FAIL (`cannot find value FILTER_LISTS`).

- [ ] **Step 4: Implementación**

Añade encima de los tests en `lists.rs`:
```rust
use std::{
    fs,
    io,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ListCategory {
    Ads,
    Privacy,
    Cookies,
    Newsletters,
}

#[derive(Debug)]
pub struct FilterListSpec {
    pub id: &'static str,
    pub name: &'static str,
    pub url: &'static str,
    pub category: ListCategory,
    pub embedded: &'static str,
}

pub static FILTER_LISTS: &[FilterListSpec] = &[
    FilterListSpec {
        id: "easylist",
        name: "EasyList",
        url: "https://easylist.to/easylist/easylist.txt",
        category: ListCategory::Ads,
        embedded: include_str!("../assets/lists/easylist.txt"),
    },
    FilterListSpec {
        id: "easyprivacy",
        name: "EasyPrivacy",
        url: "https://easylist.to/easylist/easyprivacy.txt",
        category: ListCategory::Privacy,
        embedded: include_str!("../assets/lists/easyprivacy.txt"),
    },
    FilterListSpec {
        id: "ubo-filters",
        name: "uBlock Origin filters",
        url: "https://ublockorigin.github.io/uAssets/filters/filters.txt",
        category: ListCategory::Ads,
        embedded: include_str!("../assets/lists/ubo-filters.txt"),
    },
    FilterListSpec {
        id: "ubo-privacy",
        name: "uBlock Origin privacy",
        url: "https://ublockorigin.github.io/uAssets/filters/privacy.txt",
        category: ListCategory::Privacy,
        embedded: include_str!("../assets/lists/ubo-privacy.txt"),
    },
    FilterListSpec {
        id: "easylist-cookie",
        name: "EasyList Cookie",
        url: "https://secure.fanboy.co.nz/fanboy-cookiemonster.txt",
        category: ListCategory::Cookies,
        embedded: include_str!("../assets/lists/easylist-cookie.txt"),
    },
    FilterListSpec {
        id: "ubo-cookies",
        name: "uBlock Origin cookie notices",
        url: "https://ublockorigin.github.io/uAssets/filters/annoyances-cookies.txt",
        category: ListCategory::Cookies,
        embedded: include_str!("../assets/lists/ubo-cookies.txt"),
    },
    FilterListSpec {
        id: "fanboy-newsletter",
        name: "Fanboy Newsletter",
        url: "https://secure.fanboy.co.nz/fanboy-newsletter.txt",
        category: ListCategory::Newsletters,
        embedded: include_str!("../assets/lists/fanboy-newsletter.txt"),
    },
];

pub fn spec(id: &str) -> Option<&'static FilterListSpec> {
    FILTER_LISTS.iter().find(|l| l.id == id)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CachedMeta {
    pub fetched_at: i64,
}

#[derive(Debug, Clone)]
pub struct ListCache {
    dir: PathBuf,
}

impl ListCache {
    pub fn new(dir: impl Into<PathBuf>) -> Self {
        Self { dir: dir.into() }
    }

    fn text_path(&self, id: &str) -> PathBuf {
        self.dir.join(format!("{id}.txt"))
    }

    fn meta_path(&self, id: &str) -> PathBuf {
        self.dir.join(format!("{id}.meta.json"))
    }

    pub fn read_meta(&self, id: &str) -> Option<CachedMeta> {
        let raw = fs::read_to_string(self.meta_path(id)).ok()?;
        serde_json::from_str(&raw).ok()
    }

    pub fn read(&self, id: &str) -> Option<(String, CachedMeta)> {
        let meta = self.read_meta(id)?;
        let text = fs::read_to_string(self.text_path(id)).ok()?;
        Some((text, meta))
    }

    pub fn write(&self, id: &str, text: &str, meta: &CachedMeta) -> io::Result<()> {
        fs::create_dir_all(&self.dir)?;
        write_atomic(&self.text_path(id), text.as_bytes())?;
        let meta_json = serde_json::to_vec(meta).map_err(io::Error::other)?;
        write_atomic(&self.meta_path(id), &meta_json)
    }

    pub fn last_refresh(&self) -> Option<i64> {
        fs::read_to_string(self.dir.join("_last_refresh"))
            .ok()?
            .trim()
            .parse()
            .ok()
    }

    pub fn set_last_refresh(&self, ts: i64) -> io::Result<()> {
        fs::create_dir_all(&self.dir)?;
        write_atomic(&self.dir.join("_last_refresh"), ts.to_string().as_bytes())
    }
}

/// Escribe en `<path>.tmp` y renombra (en Windows `rename` reemplaza el destino).
fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes)?;
    fs::rename(&tmp, path)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ListSource {
    Downloaded { fetched_at: i64 },
    Embedded,
}

#[derive(Debug, Clone)]
pub struct LoadedList {
    pub id: &'static str,
    pub text: String,
    pub source: ListSource,
}

/// Para cada id habilitado y conocido: la copia descargada si existe; si no, la embebida.
pub fn load_lists(cache: &ListCache, enabled: &[String]) -> Vec<LoadedList> {
    enabled
        .iter()
        .filter_map(|id| spec(id))
        .map(|s| match cache.read(s.id) {
            Some((text, meta)) => LoadedList {
                id: s.id,
                text,
                source: ListSource::Downloaded { fetched_at: meta.fetched_at },
            },
            None => LoadedList {
                id: s.id,
                text: s.embedded.to_owned(),
                source: ListSource::Embedded,
            },
        })
        .collect()
}
```

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-adblock lists`
Expected: `test result: ok. 3 passed`.

- [ ] **Step 6: Commit**

```powershell
git add scripts/fetch-filter-lists.ps1 src-tauri/crates/np-adblock
git commit -m "feat(np-adblock): filter list registry with embedded copies and disk cache"
```

---

### Task 4: Actualizador de listas cada 24 h

**Files:**
- Create: `src-tauri/crates/np-adblock/src/updater.rs`
- Modify: `src-tauri/crates/np-adblock/src/lib.rs`

**Interfaces:**
- Consumes: `ListCache`, `CachedMeta`, `spec` (Task 3).
- Produces:
  - `#[async_trait] pub trait ListFetcher: Send + Sync { async fn fetch(&self, url: &str) -> Result<String, String>; }`
  - `pub const REFRESH_INTERVAL_SECS: i64 = 86_400;`
  - `pub fn is_due(last: Option<i64>, now: i64) -> bool`
  - `pub fn validate_list(text: &str) -> Result<(), String>`
  - `RefreshReport { updated: Vec<String>, failed: Vec<(String, String)>, skipped: bool }` (`Serialize`, camelCase)
  - `pub async fn refresh_lists(cache: &ListCache, fetcher: &dyn ListFetcher, enabled: &[String], now: i64, force: bool) -> RefreshReport`

- [ ] **Step 1: Tests que fallan**

Añade `pub mod updater;` a `src/lib.rs`.

`src-tauri/crates/np-adblock/src/updater.rs`:
```rust
//! Descarga periódica (24 h) de las listas de filtros.

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    struct FakeFetcher(HashMap<&'static str, Result<String, String>>);

    #[async_trait]
    impl ListFetcher for FakeFetcher {
        async fn fetch(&self, url: &str) -> Result<String, String> {
            self.0.get(url).cloned().unwrap_or(Err("404".into()))
        }
    }

    fn good_list() -> String {
        (0..20).map(|i| format!("||ad{i}.example^\n")).collect()
    }

    #[test]
    fn due_after_24h_or_when_never_refreshed() {
        assert!(is_due(None, 1_000));
        assert!(!is_due(Some(1_000), 1_000 + REFRESH_INTERVAL_SECS - 1));
        assert!(is_due(Some(1_000), 1_000 + REFRESH_INTERVAL_SECS));
    }

    #[test]
    fn validation_rejects_html_and_tiny_lists() {
        assert!(validate_list(&good_list()).is_ok());
        assert!(validate_list("<!doctype html><html>").is_err());
        assert!(validate_list("||a^\n||b^\n").is_err());
    }

    #[tokio::test]
    async fn downloads_valid_lists_and_keeps_old_copy_on_failure() {
        let dir = tempfile::tempdir().unwrap();
        let cache = ListCache::new(dir.path());
        cache.write("easyprivacy", "antigua", &CachedMeta { fetched_at: 1 }).unwrap();

        let fetcher = FakeFetcher(HashMap::from([
            ("https://easylist.to/easylist/easylist.txt", Ok(good_list())),
            ("https://easylist.to/easylist/easyprivacy.txt", Ok("<html>captcha</html>".to_string())),
        ]));
        let report = refresh_lists(
            &cache,
            &fetcher,
            &["easylist".into(), "easyprivacy".into()],
            5_000,
            false,
        )
        .await;

        assert_eq!(report.updated, vec!["easylist".to_string()]);
        assert_eq!(report.failed.len(), 1);
        assert_eq!(report.failed[0].0, "easyprivacy");
        assert!(!report.skipped);
        assert_eq!(cache.read("easylist").unwrap().1.fetched_at, 5_000);
        assert_eq!(cache.read("easyprivacy").unwrap().0, "antigua");
        assert_eq!(cache.last_refresh(), Some(5_000));
    }

    #[tokio::test]
    async fn skips_when_not_due_unless_forced() {
        let dir = tempfile::tempdir().unwrap();
        let cache = ListCache::new(dir.path());
        cache.set_last_refresh(10_000).unwrap();
        let fetcher = FakeFetcher(HashMap::from([(
            "https://easylist.to/easylist/easylist.txt",
            Ok(good_list()),
        )]));

        let r = refresh_lists(&cache, &fetcher, &["easylist".into()], 10_100, false).await;
        assert!(r.skipped);
        assert!(r.updated.is_empty());

        let r = refresh_lists(&cache, &fetcher, &["easylist".into()], 10_100, true).await;
        assert!(!r.skipped);
        assert_eq!(r.updated, vec!["easylist".to_string()]);
    }

    #[tokio::test]
    async fn total_failure_does_not_mark_refresh_so_it_retries() {
        let dir = tempfile::tempdir().unwrap();
        let cache = ListCache::new(dir.path());
        let fetcher = FakeFetcher(HashMap::new());
        let r = refresh_lists(&cache, &fetcher, &["easylist".into()], 9_000, false).await;
        assert_eq!(r.failed.len(), 1);
        assert_eq!(cache.last_refresh(), None);
    }
}
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-adblock updater`
Expected: FAIL (`cannot find trait ListFetcher`).

- [ ] **Step 3: Implementación**

Añade encima de los tests:
```rust
use async_trait::async_trait;
use serde::Serialize;

use crate::lists::{spec, CachedMeta, ListCache};

/// Descarga una URL como texto. En np-app se implementa con la fábrica de clientes de np-net,
/// así que sigue el modo de red (por Tor si está activo).
#[async_trait]
pub trait ListFetcher: Send + Sync {
    async fn fetch(&self, url: &str) -> Result<String, String>;
}

pub const REFRESH_INTERVAL_SECS: i64 = 86_400;

pub fn is_due(last: Option<i64>, now: i64) -> bool {
    last.map_or(true, |l| now - l >= REFRESH_INTERVAL_SECS)
}

/// Rechaza respuestas que no son listas (páginas HTML de error/CAPTCHA, cuerpos casi vacíos).
pub fn validate_list(text: &str) -> Result<(), String> {
    if text.trim_start().starts_with('<') {
        return Err("response looks like HTML, not a filter list".into());
    }
    let rules = text
        .lines()
        .filter(|l| {
            let t = l.trim();
            !t.is_empty() && !t.starts_with('!') && !t.starts_with('[')
        })
        .count();
    if rules < 10 {
        return Err(format!("filter list too short ({rules} rules)"));
    }
    Ok(())
}

#[derive(Debug, Default, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshReport {
    pub updated: Vec<String>,
    pub failed: Vec<(String, String)>,
    pub skipped: bool,
}

pub async fn refresh_lists(
    cache: &ListCache,
    fetcher: &dyn ListFetcher,
    enabled: &[String],
    now: i64,
    force: bool,
) -> RefreshReport {
    if !force && !is_due(cache.last_refresh(), now) {
        return RefreshReport { skipped: true, ..Default::default() };
    }
    let mut report = RefreshReport::default();
    for id in enabled {
        let Some(s) = spec(id) else { continue };
        let result = match fetcher.fetch(s.url).await {
            Ok(text) => validate_list(&text).and_then(|()| {
                cache
                    .write(s.id, &text, &CachedMeta { fetched_at: now })
                    .map_err(|e| e.to_string())
            }),
            Err(e) => Err(e),
        };
        match result {
            Ok(()) => report.updated.push(s.id.to_string()),
            Err(e) => {
                tracing::warn!(list = s.id, error = %e, "filter list update failed");
                report.failed.push((s.id.to_string(), e));
            }
        }
    }
    if !report.updated.is_empty() {
        if let Err(e) = cache.set_last_refresh(now) {
            tracing::warn!(error = %e, "could not store refresh time");
        }
    }
    report
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-adblock updater`
Expected: `test result: ok. 5 passed`.

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/crates/np-adblock
git commit -m "feat(np-adblock): validated 24h filter list refresh"
```

---

### Task 5: Contadores por pestaña y por día (`blocked_stats`)

**Files:**
- Create: `src-tauri/crates/np-adblock/sql/blocked_stats.sql`
- Create: `src-tauri/crates/np-adblock/src/stats.rs`
- Modify: `src-tauri/crates/np-adblock/src/lib.rs`
- Modify: `src-tauri/crates/np-store/src/migrations.rs`

**Interfaces:**
- Produces:
  - `pub const SCHEMA_SQL: &str`
  - `BlockedStats::new()`, `record(&self, tab: u64, day: &str) -> u64` (devuelve el total de la pestaña), `tab_count(&self, tab: u64) -> u64`, `remove_tab(&self, tab: u64)`, `flush(&self, conn: &rusqlite::Connection) -> rusqlite::Result<()>`, `day_total(&self, conn: &rusqlite::Connection, day: &str) -> rusqlite::Result<u64>`
  - `pub fn today_local() -> String` (`YYYY-MM-DD` hora local)

- [ ] **Step 1: Esquema**

`src-tauri/crates/np-adblock/sql/blocked_stats.sql`:
```sql
CREATE TABLE IF NOT EXISTS blocked_stats (
  day     TEXT    PRIMARY KEY NOT NULL,
  blocked INTEGER NOT NULL DEFAULT 0
);
```

- [ ] **Step 2: Tests que fallan**

Añade `pub mod stats;` a `src/lib.rs`.

`src-tauri/crates/np-adblock/src/stats.rs`:
```rust
//! Contadores de peticiones bloqueadas: por pestaña (memoria) y por día (SQLite).

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(SCHEMA_SQL).unwrap();
        c
    }

    #[test]
    fn counts_per_tab() {
        let s = BlockedStats::new();
        assert_eq!(s.record(1, "2026-10-06"), 1);
        assert_eq!(s.record(1, "2026-10-06"), 2);
        assert_eq!(s.record(2, "2026-10-06"), 1);
        assert_eq!(s.tab_count(1), 2);
        s.remove_tab(1);
        assert_eq!(s.tab_count(1), 0);
        assert_eq!(s.tab_count(2), 1);
    }

    #[test]
    fn flush_accumulates_per_day_and_day_total_includes_pending() {
        let conn = db();
        let s = BlockedStats::new();
        s.record(1, "2026-10-06");
        s.record(2, "2026-10-06");
        s.record(2, "2026-10-07");
        s.flush(&conn).unwrap();
        s.record(1, "2026-10-06");

        assert_eq!(s.day_total(&conn, "2026-10-06").unwrap(), 3);
        assert_eq!(s.day_total(&conn, "2026-10-07").unwrap(), 1);
        s.flush(&conn).unwrap();
        let stored: i64 = conn
            .query_row("SELECT blocked FROM blocked_stats WHERE day = '2026-10-06'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(stored, 3);
        assert_eq!(s.day_total(&conn, "2026-10-08").unwrap(), 0);
    }

    #[test]
    fn failed_flush_keeps_pending_counts() {
        let conn = Connection::open_in_memory().unwrap(); // sin tabla: el flush falla
        let s = BlockedStats::new();
        s.record(1, "2026-10-06");
        assert!(s.flush(&conn).is_err());
        conn.execute_batch(SCHEMA_SQL).unwrap();
        s.flush(&conn).unwrap();
        assert_eq!(s.day_total(&conn, "2026-10-06").unwrap(), 1);
    }

    #[test]
    fn today_has_iso_format() {
        let d = today_local();
        assert_eq!(d.len(), 10);
        assert_eq!(&d[4..5], "-");
    }
}
```

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-adblock stats`
Expected: FAIL (`cannot find value SCHEMA_SQL`).

- [ ] **Step 4: Implementación**

Añade encima de los tests:
```rust
use std::{collections::HashMap, sync::Mutex};

use rusqlite::{params, Connection, OptionalExtension};

pub const SCHEMA_SQL: &str = include_str!("../sql/blocked_stats.sql");

#[derive(Default)]
struct Inner {
    per_tab: HashMap<u64, u64>,
    pending: HashMap<String, u64>,
}

#[derive(Default)]
pub struct BlockedStats {
    inner: Mutex<Inner>,
}

impl BlockedStats {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record(&self, tab: u64, day: &str) -> u64 {
        let mut g = self.inner.lock().expect("stats lock");
        *g.pending.entry(day.to_owned()).or_default() += 1;
        let c = g.per_tab.entry(tab).or_default();
        *c += 1;
        *c
    }

    pub fn tab_count(&self, tab: u64) -> u64 {
        self.inner.lock().expect("stats lock").per_tab.get(&tab).copied().unwrap_or(0)
    }

    pub fn remove_tab(&self, tab: u64) {
        self.inner.lock().expect("stats lock").per_tab.remove(&tab);
    }

    /// Vuelca los pendientes con UPSERT. Si falla, los pendientes se conservan.
    pub fn flush(&self, conn: &Connection) -> rusqlite::Result<()> {
        let pending = std::mem::take(&mut self.inner.lock().expect("stats lock").pending);
        let result = (|| {
            for (day, n) in &pending {
                conn.execute(
                    "INSERT INTO blocked_stats (day, blocked) VALUES (?1, ?2)
                     ON CONFLICT(day) DO UPDATE SET blocked = blocked + excluded.blocked",
                    params![day, *n as i64],
                )?;
            }
            Ok(())
        })();
        if result.is_err() {
            let mut g = self.inner.lock().expect("stats lock");
            for (day, n) in pending {
                *g.pending.entry(day).or_default() += n;
            }
        }
        result
    }

    pub fn day_total(&self, conn: &Connection, day: &str) -> rusqlite::Result<u64> {
        let stored: Option<i64> = conn
            .query_row("SELECT blocked FROM blocked_stats WHERE day = ?1", [day], |r| r.get(0))
            .optional()?;
        let pending = self.inner.lock().expect("stats lock").pending.get(day).copied().unwrap_or(0);
        Ok(stored.unwrap_or(0) as u64 + pending)
    }
}

pub fn today_local() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}
```

> Nota: en una transacción fallida a medias (primer día escrito, segundo no) se re-sumaría el primero en el siguiente flush. Con un solo día por intervalo de 5 s es despreciable; si hiciera falta, envolver el bucle en `conn.unchecked_transaction()`.

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-adblock stats`
Expected: `test result: ok. 4 passed`.

- [ ] **Step 6: Registrar la migración en np-store**

En `src-tauri/crates/np-store/src/migrations.rs`, añade la entrada de la ranura 2 al array `MIGRATIONS` (no edites la 1):
```rust
    Migration {
        version: 2,
        name: "blocked_stats",
        sql: include_str!("../../np-adblock/sql/blocked_stats.sql"),
    },
```
El test `versions_are_unique_and_contiguous_from_one` del subproyecto 1 comprueba que la ranura es correcta.

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-store`
Expected: todos los tests existentes de np-store pasan.

- [ ] **Step 7: Commit**

```powershell
git add src-tauri/crates/np-adblock src-tauri/crates/np-store/src/migrations.rs
git commit -m "feat(np-adblock): per-tab and per-day blocked counters"
```

---

### Task 6: `AdblockService` (estado, ajustes y reconstrucción del motor)

**Files:**
- Create: `src-tauri/crates/np-adblock/src/service.rs`
- Modify: `src-tauri/crates/np-adblock/src/lib.rs`

**Interfaces:**
- Consumes: `Blocker`, `ResourceType` (T1), `ListCache`, `load_lists`, `FILTER_LISTS`, `ListCategory` (T3), `BlockedStats`, `today_local` (T5).
- Produces:
  - `AdblockSettings { enabled: bool, lists: Vec<String> }` (serde camelCase, `Default` = activado + las 7 listas)
  - `pub trait BlockedNotifier: Send + Sync { fn blocked(&self, tab: u64, tab_count: u64); }`
  - `AdblockService::new(settings: AdblockSettings, notifier: Arc<dyn BlockedNotifier>) -> Self`, `check(&self, tab: u64, url: &str, source_url: &str, kind: ResourceType, method: &str) -> bool`, `install_blocker(&self, b: Blocker)`, `blocker(&self) -> Arc<Blocker>`, `settings(&self) -> AdblockSettings`, `set_enabled(&self, enabled: bool)`, `set_list_enabled(&self, id: &str, enabled: bool) -> Result<bool, String>`, `stats(&self) -> &BlockedStats`
  - `build_blocker(cache: &ListCache, settings: &AdblockSettings, extra_rules: Option<&str>) -> Blocker`
  - `FilterListStatus { id, name, category, enabled, source: &'static str ("downloaded"|"embedded"), fetched_at: Option<i64> }`, `AdblockStatus { enabled, lists: Vec<FilterListStatus>, last_refresh: Option<i64> }` (Serialize camelCase), `adblock_status(cache: &ListCache, settings: &AdblockSettings) -> AdblockStatus`

- [ ] **Step 1: Tests que fallan**

Añade `pub mod service;` a `src/lib.rs`.

`src-tauri/crates/np-adblock/src/service.rs`:
```rust
//! Servicio de bloqueo compartido entre el gancho de WebView2, los comandos y las tareas de fondo.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lists::CachedMeta;
    use std::sync::Mutex;

    #[derive(Default)]
    struct Spy(Mutex<Vec<(u64, u64)>>);
    impl BlockedNotifier for Spy {
        fn blocked(&self, tab: u64, tab_count: u64) {
            self.0.lock().unwrap().push((tab, tab_count));
        }
    }

    fn service() -> (AdblockService, Arc<Spy>) {
        let spy = Arc::new(Spy::default());
        let svc = AdblockService::new(AdblockSettings::default(), spy.clone());
        svc.install_blocker(Blocker::from_lists(["||ads.example.com^"]));
        (svc, spy)
    }

    #[test]
    fn default_settings_enable_all_lists() {
        let s = AdblockSettings::default();
        assert!(s.enabled);
        assert_eq!(s.lists.len(), 7);
    }

    #[test]
    fn check_blocks_counts_and_notifies() {
        let (svc, spy) = service();
        assert!(svc.check(7, "https://ads.example.com/a.js", "https://n.es/", ResourceType::Script, "GET"));
        assert!(!svc.check(7, "https://cdn.n.es/a.js", "https://n.es/", ResourceType::Script, "GET"));
        assert_eq!(svc.stats().tab_count(7), 1);
        assert_eq!(*spy.0.lock().unwrap(), vec![(7, 1)]);
    }

    #[test]
    fn disabled_service_blocks_nothing() {
        let (svc, spy) = service();
        svc.set_enabled(false);
        assert!(!svc.check(7, "https://ads.example.com/a.js", "https://n.es/", ResourceType::Script, "GET"));
        assert!(spy.0.lock().unwrap().is_empty());
    }

    #[test]
    fn toggling_lists_validates_ids() {
        let (svc, _) = service();
        assert_eq!(svc.set_list_enabled("easylist", false), Ok(true));
        assert_eq!(svc.set_list_enabled("easylist", false), Ok(false));
        assert!(!svc.settings().lists.contains(&"easylist".to_string()));
        assert_eq!(svc.set_list_enabled("easylist", true), Ok(true));
        assert!(svc.set_list_enabled("inventada", true).is_err());
    }

    #[test]
    fn build_blocker_uses_cache_and_extra_rules() {
        let dir = tempfile::tempdir().unwrap();
        let cache = ListCache::new(dir.path());
        let rules: String = (0..20).map(|i| format!("||t{i}.example^\n")).collect();
        cache.write("easyprivacy", &rules, &CachedMeta { fetched_at: 9 }).unwrap();
        let settings = AdblockSettings { enabled: true, lists: vec!["easyprivacy".into()] };
        let b = build_blocker(&cache, &settings, Some("||extra.example^"));
        assert!(b.should_block("https://t3.example/x.js", "https://n.es/", ResourceType::Script, "GET"));
        assert!(b.should_block("https://extra.example/x.js", "https://n.es/", ResourceType::Script, "GET"));
    }

    #[test]
    fn status_reports_source_per_list() {
        let dir = tempfile::tempdir().unwrap();
        let cache = ListCache::new(dir.path());
        cache.write("easylist", "x", &CachedMeta { fetched_at: 11 }).unwrap();
        cache.set_last_refresh(11).unwrap();
        let st = adblock_status(&cache, &AdblockSettings { enabled: true, lists: vec!["easylist".into()] });
        assert_eq!(st.lists.len(), 7);
        let easylist = st.lists.iter().find(|l| l.id == "easylist").unwrap();
        assert!(easylist.enabled);
        assert_eq!(easylist.source, "downloaded");
        assert_eq!(easylist.fetched_at, Some(11));
        let privacy = st.lists.iter().find(|l| l.id == "easyprivacy").unwrap();
        assert!(!privacy.enabled);
        assert_eq!(privacy.source, "embedded");
        assert_eq!(st.last_refresh, Some(11));
        let json = serde_json::to_value(&st).unwrap();
        assert!(json.get("lastRefresh").is_some());
        assert!(json["lists"][0].get("fetchedAt").is_some());
    }
}
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-adblock service`
Expected: FAIL (`cannot find struct AdblockService`).

- [ ] **Step 3: Implementación**

Añade encima de los tests:
```rust
use std::sync::{Arc, RwLock};

use serde::{Deserialize, Serialize};

use crate::{
    blocker::{Blocker, ResourceType},
    lists::{load_lists, ListCache, ListCategory, FILTER_LISTS},
    stats::{today_local, BlockedStats},
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AdblockSettings {
    pub enabled: bool,
    pub lists: Vec<String>,
}

impl Default for AdblockSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            lists: FILTER_LISTS.iter().map(|l| l.id.to_string()).collect(),
        }
    }
}

pub trait BlockedNotifier: Send + Sync {
    fn blocked(&self, tab: u64, tab_count: u64);
}

pub struct AdblockService {
    blocker: RwLock<Arc<Blocker>>,
    settings: RwLock<AdblockSettings>,
    stats: BlockedStats,
    notifier: Arc<dyn BlockedNotifier>,
}

impl AdblockService {
    /// Arranca con un motor vacío; `install_blocker` lo sustituye cuando termina de construirse.
    pub fn new(settings: AdblockSettings, notifier: Arc<dyn BlockedNotifier>) -> Self {
        Self {
            blocker: RwLock::new(Arc::new(Blocker::empty())),
            settings: RwLock::new(settings),
            stats: BlockedStats::new(),
            notifier,
        }
    }

    pub fn check(&self, tab: u64, url: &str, source_url: &str, kind: ResourceType, method: &str) -> bool {
        if !self.settings.read().expect("settings lock").enabled {
            return false;
        }
        let blocker = self.blocker();
        let block = blocker.should_block(url, source_url, kind, method);
        if block {
            let n = self.stats.record(tab, &today_local());
            self.notifier.blocked(tab, n);
        }
        block
    }

    pub fn install_blocker(&self, b: Blocker) {
        *self.blocker.write().expect("blocker lock") = Arc::new(b);
    }

    pub fn blocker(&self) -> Arc<Blocker> {
        self.blocker.read().expect("blocker lock").clone()
    }

    pub fn settings(&self) -> AdblockSettings {
        self.settings.read().expect("settings lock").clone()
    }

    pub fn set_enabled(&self, enabled: bool) {
        self.settings.write().expect("settings lock").enabled = enabled;
    }

    /// Devuelve `Ok(true)` si cambió algo (hay que reconstruir el motor).
    pub fn set_list_enabled(&self, id: &str, enabled: bool) -> Result<bool, String> {
        if !FILTER_LISTS.iter().any(|l| l.id == id) {
            return Err(format!("unknown filter list: {id}"));
        }
        let mut s = self.settings.write().expect("settings lock");
        let present = s.lists.iter().any(|l| l == id);
        match (enabled, present) {
            (true, false) => {
                s.lists.push(id.to_string());
                Ok(true)
            }
            (false, true) => {
                s.lists.retain(|l| l != id);
                Ok(true)
            }
            _ => Ok(false),
        }
    }

    pub fn stats(&self) -> &BlockedStats {
        &self.stats
    }
}

/// Construcción costosa (≈1 s con las 7 listas): llamar desde un hilo bloqueante.
pub fn build_blocker(cache: &ListCache, settings: &AdblockSettings, extra_rules: Option<&str>) -> Blocker {
    let loaded = load_lists(cache, &settings.lists);
    let texts = loaded
        .iter()
        .map(|l| l.text.as_str())
        .chain(extra_rules.into_iter());
    Blocker::from_lists(texts)
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterListStatus {
    pub id: String,
    pub name: String,
    pub category: ListCategory,
    pub enabled: bool,
    pub source: &'static str,
    pub fetched_at: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdblockStatus {
    pub enabled: bool,
    pub lists: Vec<FilterListStatus>,
    pub last_refresh: Option<i64>,
}

pub fn adblock_status(cache: &ListCache, settings: &AdblockSettings) -> AdblockStatus {
    let lists = FILTER_LISTS
        .iter()
        .map(|s| {
            let meta = cache.read_meta(s.id);
            FilterListStatus {
                id: s.id.to_string(),
                name: s.name.to_string(),
                category: s.category,
                enabled: settings.lists.iter().any(|l| l == s.id),
                source: if meta.is_some() { "downloaded" } else { "embedded" },
                fetched_at: meta.map(|m| m.fetched_at),
            }
        })
        .collect();
    AdblockStatus {
        enabled: settings.enabled,
        lists,
        last_refresh: cache.last_refresh(),
    }
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-adblock service`
Expected: `test result: ok. 6 passed`.

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/crates/np-adblock
git commit -m "feat(np-adblock): adblock service with settings, status and engine rebuild"
```

---

### Task 7: Gancho `WebResourceRequested` de WebView2 (Windows)

**Files:**
- Create: `src-tauri/crates/np-adblock/src/webview2.rs`
- Modify: `src-tauri/crates/np-adblock/src/lib.rs`

**Interfaces:**
- Consumes: `AdblockService::check` (T6), `ResourceType` (T1).
- Produces (solo Windows):
  - `pub fn map_context(ctx: COREWEBVIEW2_WEB_RESOURCE_CONTEXT) -> ResourceType`
  - `pub fn attach(webview: &tauri::Webview, tab: u64, svc: Arc<AdblockService>) -> tauri::Result<()>`

- [ ] **Step 1: Test que falla (mapeo de contextos; parte pura)**

Añade a `src/lib.rs`:
```rust
#[cfg(windows)]
pub mod webview2;
```

`src-tauri/crates/np-adblock/src/webview2.rs`:
```rust
//! Intercepción de peticiones de las webviews de contenido (WebView2, Windows).

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
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-adblock webview2`
Expected: FAIL (`cannot find function map_context`).

- [ ] **Step 3: Implementación**

Añade encima de los tests:
```rust
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
```

> Si `args.ResourceContext` no acepta `&mut` (firma `*mut`), usa `args.ResourceContext(&mut ctx as *mut _)`. Si `webview2-com`/`windows` no compilan por versiones duplicadas, alinea con las de Tauri: `cargo tree --manifest-path src-tauri/Cargo.toml -i webview2-com` debe mostrar **una** versión.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-adblock webview2`
Expected: `test result: ok. 1 passed`.

Run: `cargo clippy --manifest-path src-tauri/Cargo.toml -p np-adblock -- -D warnings`
Expected: sin avisos.

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/crates/np-adblock
git commit -m "feat(np-adblock): WebResourceRequested hook answering 403 to blocked requests"
```

La verificación de extremo a extremo (petición realmente bloqueada en una webview) está en la Tarea 22.

---

### Task 8: Script cosmético y manejador de WebMessage

**Files:**
- Create: `src-tauri/crates/np-adblock/assets/cosmetic.js`
- Create: `src-tauri/crates/np-adblock/src/cosmetic_msg.rs`
- Modify: `src-tauri/crates/np-adblock/src/lib.rs`

**Interfaces:**
- Consumes: `AdblockService::{blocker, settings}` (T6), `Blocker::{cosmetic_for, generic_selectors}`, `css_for_selectors` (T2).
- Produces:
  - `pub const COSMETIC_SCRIPT: &str`
  - `pub const KIND_INIT: &str = "np-cosmetic-init"; pub const KIND_GENERIC: &str = "np-cosmetic-generic"; pub const KIND_CSS: &str = "np-cosmetic-css";`
  - `CosmeticRequest { Init { url: String }, Generic { url: String, classes: Vec<String>, ids: Vec<String> } }`
  - `parse_cosmetic_message(v: &serde_json::Value) -> Option<CosmeticRequest>`
  - `handle_cosmetic(svc: &AdblockService, req: CosmeticRequest) -> Option<serde_json::Value>`

- [ ] **Step 1: El script inyectado**

`src-tauri/crates/np-adblock/assets/cosmetic.js`:
```js
// newpaper · filtrado cosmético (marco principal). Se comunica con Rust por chrome.webview.
(() => {
  const wv = window.chrome && window.chrome.webview;
  if (!wv || window.top !== window) return;
  const styleId = "np-cosmetic-" + Math.random().toString(36).slice(2);
  const seenClasses = new Set();
  const seenIds = new Set();
  let newClasses = [];
  let newIds = [];
  let timer = 0;

  function applyCss(css) {
    let el = document.getElementById(styleId);
    if (!el) {
      el = document.createElement("style");
      el.id = styleId;
      (document.head || document.documentElement).appendChild(el);
    }
    el.textContent += css;
  }

  function noteElement(el) {
    if (el.id && !seenIds.has(el.id)) {
      seenIds.add(el.id);
      newIds.push(el.id);
    }
    if (el.classList) {
      for (const c of el.classList) {
        if (!seenClasses.has(c)) {
          seenClasses.add(c);
          newClasses.push(c);
        }
      }
    }
  }

  function scan(root) {
    if (root.nodeType !== 1) return;
    noteElement(root);
    for (const el of root.querySelectorAll("[id],[class]")) noteElement(el);
    schedule();
  }

  function schedule() {
    if (timer) return;
    timer = setTimeout(() => {
      timer = 0;
      if (!newClasses.length && !newIds.length) return;
      wv.postMessage({
        type: "np-cosmetic-generic",
        url: location.href,
        classes: newClasses.splice(0, 1000),
        ids: newIds.splice(0, 1000),
      });
      if (newClasses.length || newIds.length) schedule();
    }, 300);
  }

  wv.addEventListener("message", (ev) => {
    const d = ev.data;
    if (d && d.type === "np-cosmetic-css" && typeof d.css === "string") applyCss(d.css);
  });

  wv.postMessage({ type: "np-cosmetic-init", url: location.href });

  const start = () => {
    scan(document.documentElement);
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "attributes") noteElement(m.target);
        else for (const n of m.addedNodes) scan(n);
      }
      schedule();
    }).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "id"],
    });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
```

- [ ] **Step 2: Tests que fallan**

Añade `pub mod cosmetic_msg;` a `src/lib.rs`.

`src-tauri/crates/np-adblock/src/cosmetic_msg.rs`:
```rust
//! Protocolo WebMessage del filtrado cosmético. La página puede falsificar mensajes:
//! todo se valida y la respuesta solo contiene CSS de ocultación.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{blocker::Blocker, service::{AdblockSettings, BlockedNotifier}};
    use serde_json::json;
    use std::sync::Arc;

    struct Nop;
    impl BlockedNotifier for Nop {
        fn blocked(&self, _: u64, _: u64) {}
    }

    fn svc() -> AdblockService {
        let s = AdblockService::new(AdblockSettings::default(), Arc::new(Nop));
        s.install_blocker(Blocker::from_lists(["example.org##.cookie-banner\n##.newsletter-modal\n"]));
        s
    }

    #[test]
    fn parses_valid_messages() {
        assert_eq!(
            parse_cosmetic_message(&json!({"type": "np-cosmetic-init", "url": "https://example.org/a"})),
            Some(CosmeticRequest::Init { url: "https://example.org/a".into() })
        );
        assert_eq!(
            parse_cosmetic_message(&json!({
                "type": "np-cosmetic-generic", "url": "https://example.org/a",
                "classes": ["newsletter-modal", "con espacio", ""], "ids": ["x"]
            })),
            Some(CosmeticRequest::Generic {
                url: "https://example.org/a".into(),
                classes: vec!["newsletter-modal".into()],
                ids: vec!["x".into()],
            })
        );
    }

    #[test]
    fn rejects_bad_urls_and_unknown_types() {
        assert_eq!(parse_cosmetic_message(&json!({"type": "np-cosmetic-init", "url": "file:///c:/x"})), None);
        assert_eq!(parse_cosmetic_message(&json!({"type": "otro", "url": "https://a.es"})), None);
        let long = format!("https://a.es/{}", "x".repeat(5000));
        assert_eq!(parse_cosmetic_message(&json!({"type": "np-cosmetic-init", "url": long})), None);
    }

    #[test]
    fn truncates_huge_class_lists() {
        let classes: Vec<String> = (0..5000).map(|i| format!("c{i}")).collect();
        let msg = json!({"type": "np-cosmetic-generic", "url": "https://a.es", "classes": classes, "ids": []});
        match parse_cosmetic_message(&msg) {
            Some(CosmeticRequest::Generic { classes, .. }) => assert_eq!(classes.len(), MAX_ITEMS),
            other => panic!("unexpected: {other:?}"),
        }
    }

    #[test]
    fn init_returns_site_specific_css() {
        let out = handle_cosmetic(&svc(), CosmeticRequest::Init { url: "https://example.org/a".into() }).unwrap();
        assert_eq!(out["type"], "np-cosmetic-css");
        assert!(out["css"].as_str().unwrap().contains(".cookie-banner { display: none !important; }"));
    }

    #[test]
    fn generic_returns_css_for_seen_classes_and_none_when_empty() {
        let s = svc();
        let out = handle_cosmetic(
            &s,
            CosmeticRequest::Generic { url: "https://a.es/".into(), classes: vec!["newsletter-modal".into()], ids: vec![] },
        )
        .unwrap();
        assert!(out["css"].as_str().unwrap().contains(".newsletter-modal"));
        assert!(handle_cosmetic(
            &s,
            CosmeticRequest::Generic { url: "https://a.es/".into(), classes: vec!["nada".into()], ids: vec![] },
        )
        .is_none());
    }

    #[test]
    fn disabled_service_returns_nothing() {
        let s = svc();
        s.set_enabled(false);
        assert!(handle_cosmetic(&s, CosmeticRequest::Init { url: "https://example.org/a".into() }).is_none());
    }
}
```

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-adblock cosmetic_msg`
Expected: FAIL (`cannot find function parse_cosmetic_message`).

- [ ] **Step 4: Implementación**

Añade encima de los tests:
```rust
use serde_json::{json, Value};

use crate::{cosmetic::css_for_selectors, service::AdblockService};

pub const COSMETIC_SCRIPT: &str = include_str!("../assets/cosmetic.js");
pub const KIND_INIT: &str = "np-cosmetic-init";
pub const KIND_GENERIC: &str = "np-cosmetic-generic";
pub const KIND_CSS: &str = "np-cosmetic-css";

pub const MAX_URL_LEN: usize = 4096;
pub const MAX_ITEMS: usize = 1000;
pub const MAX_ITEM_LEN: usize = 200;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CosmeticRequest {
    Init { url: String },
    Generic { url: String, classes: Vec<String>, ids: Vec<String> },
}

fn valid_url(v: &Value) -> Option<String> {
    let url = v.get("url")?.as_str()?;
    let ok = url.len() <= MAX_URL_LEN && (url.starts_with("https://") || url.starts_with("http://"));
    ok.then(|| url.to_owned())
}

fn names(v: &Value, key: &str) -> Vec<String> {
    v.get(key)
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_str)
                .filter(|s| !s.is_empty() && s.len() <= MAX_ITEM_LEN && !s.chars().any(char::is_whitespace))
                .take(MAX_ITEMS)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

pub fn parse_cosmetic_message(v: &Value) -> Option<CosmeticRequest> {
    match v.get("type")?.as_str()? {
        KIND_INIT => Some(CosmeticRequest::Init { url: valid_url(v)? }),
        KIND_GENERIC => Some(CosmeticRequest::Generic {
            url: valid_url(v)?,
            classes: names(v, "classes"),
            ids: names(v, "ids"),
        }),
        _ => None,
    }
}

pub fn handle_cosmetic(svc: &AdblockService, req: CosmeticRequest) -> Option<Value> {
    if !svc.settings().enabled {
        return None;
    }
    let blocker = svc.blocker();
    let css = match req {
        CosmeticRequest::Init { url } => css_for_selectors(&blocker.cosmetic_for(&url).hide_selectors),
        CosmeticRequest::Generic { url, classes, ids } => {
            let res = blocker.cosmetic_for(&url);
            if res.generichide {
                String::new()
            } else {
                css_for_selectors(&blocker.generic_selectors(&classes, &ids, &res.exceptions))
            }
        }
    };
    (!css.is_empty()).then(|| json!({ "type": KIND_CSS, "css": css }))
}
```

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-adblock`
Expected: todos los tests de np-adblock pasan (`test result: ok. 31 passed` en Windows; 30 en otras plataformas).

> El subproyecto 1 entrega los mensajes `Other` con su `type` dentro de `payload`, que es justo lo que espera `parse_cosmetic_message`.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/crates/np-adblock
git commit -m "feat(np-adblock): cosmetic filtering via injected script and validated WebMessage"
```

---
### Task 9: Crate `np-net` — modos, estado y rutas de tráfico

**Files:**
- Create: `src-tauri/crates/np-net/Cargo.toml`
- Create: `src-tauri/crates/np-net/src/lib.rs`, `error.rs`, `mode.rs`

**Interfaces:**
- Produces:
  - `NetError` (`thiserror`: `Io`, `Http`, `InvalidCountry(String)`, `Tor(String)`)
  - `NetMode { Direct, Tor }` (serde `"direct"`/`"tor"`)
  - `NetSettings { mode: NetMode, exit_country: Option<String>, ai_via_tor: bool, feeds_via_tor: bool }` (serde camelCase; `Default` = Directo, sin país, IA directa, RSS por Tor)
  - `TorState { Off, Bootstrapping { percent: u8 }, Ready, Failed { message: String } }` (serde `tag = "state"`, camelCase)
  - `NetStatus { mode, tor: TorState, socks_port: u16, exit_country: Option<String>, circuit: u64, ai_via_tor, feeds_via_tor, kill_switch_active: bool }` (serde camelCase)
  - `Traffic { Web, Feeds, Ai, Updates }`, `Route { Direct, Tor }`, `route(&NetSettings, Traffic) -> Route`
  - `normalize_country(cc: &str) -> Result<String, NetError>` (dos letras ASCII → mayúsculas)
  - `compose_status(&NetSettings, &TorState, socks_port, circuit) -> NetStatus`

- [ ] **Step 1: Crate**

`src-tauri/crates/np-net/Cargo.toml`:
```toml
[package]
name = "np-net"
version = "0.1.0"
edition = "2021"
publish = false

[dependencies]
arti-client = { version = "=0.47.0", default-features = false, features = ["tokio", "rustls", "geoip"] }
tor-rtcompat = { version = "=0.47.0", default-features = false, features = ["tokio", "rustls"] }
async-trait = { workspace = true }
futures = { workspace = true }
reqwest = { workspace = true }
serde = { workspace = true }
serde_json = { workspace = true }
thiserror = { workspace = true }
tokio = { workspace = true, features = ["net", "io-util"] }
tracing = { workspace = true }

[dev-dependencies]
tempfile = { workspace = true }
```

`src-tauri/crates/np-net/src/lib.rs`:
```rust
//! Red de newpaper: proxy SOCKS5 local servido por Arti (Tor) con kill switch y rutas de tráfico.
pub mod error;
pub mod mode;

pub use error::NetError;
pub use mode::{compose_status, normalize_country, route, NetMode, NetSettings, NetStatus, Route, TorState, Traffic};
```

`src-tauri/crates/np-net/src/error.rs`:
```rust
#[derive(Debug, thiserror::Error)]
pub enum NetError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("http client: {0}")]
    Http(#[from] reqwest::Error),
    #[error("invalid exit country: {0}")]
    InvalidCountry(String),
    #[error("tor: {0}")]
    Tor(String),
}
```

- [ ] **Step 2: Escribir los tests que fallan**

`src-tauri/crates/np-net/src/mode.rs`:
```rust
//! Modos de red, estado de Tor y reglas de enrutado (spec §4.2).

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_follow_the_spec() {
        let s = NetSettings::default();
        assert_eq!(s.mode, NetMode::Direct);
        assert!(s.feeds_via_tor, "RSS por Tor por defecto");
        assert!(!s.ai_via_tor, "IA directa por defecto");
    }

    #[test]
    fn routing_table() {
        let mut s = NetSettings::default();
        for t in [Traffic::Web, Traffic::Feeds, Traffic::Ai, Traffic::Updates] {
            assert_eq!(route(&s, t), Route::Direct);
        }
        s.mode = NetMode::Tor;
        assert_eq!(route(&s, Traffic::Web), Route::Tor);
        assert_eq!(route(&s, Traffic::Updates), Route::Tor);
        assert_eq!(route(&s, Traffic::Feeds), Route::Tor);
        assert_eq!(route(&s, Traffic::Ai), Route::Direct);
        s.ai_via_tor = true;
        s.feeds_via_tor = false;
        assert_eq!(route(&s, Traffic::Ai), Route::Tor);
        assert_eq!(route(&s, Traffic::Feeds), Route::Direct);
    }

    #[test]
    fn countries_are_two_ascii_letters() {
        assert_eq!(normalize_country("de").unwrap(), "DE");
        assert!(normalize_country("DEU").is_err());
        assert!(normalize_country("d3").is_err());
        assert!(normalize_country("").is_err());
    }

    #[test]
    fn kill_switch_is_active_in_tor_mode_until_ready() {
        let mut s = NetSettings::default();
        assert!(!compose_status(&s, &TorState::Off, 9050, 0).kill_switch_active);
        s.mode = NetMode::Tor;
        assert!(compose_status(&s, &TorState::Bootstrapping { percent: 40 }, 9050, 0).kill_switch_active);
        assert!(compose_status(&s, &TorState::Failed { message: "x".into() }, 9050, 0).kill_switch_active);
        assert!(!compose_status(&s, &TorState::Ready, 9050, 0).kill_switch_active);
    }

    #[test]
    fn status_serializes_for_the_ui() {
        let s = NetSettings { mode: NetMode::Tor, exit_country: Some("DE".into()), ..Default::default() };
        let v = serde_json::to_value(compose_status(&s, &TorState::Bootstrapping { percent: 12 }, 50123, 3)).unwrap();
        assert_eq!(v["mode"], "tor");
        assert_eq!(v["tor"]["state"], "bootstrapping");
        assert_eq!(v["tor"]["percent"], 12);
        assert_eq!(v["socksPort"], 50123);
        assert_eq!(v["exitCountry"], "DE");
        assert_eq!(v["killSwitchActive"], true);
    }
}
```

Añade a `lib.rs` (ya está): `pub mod mode;`

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-net mode`
Expected: FAIL de compilación (`cannot find struct NetSettings`). La primera compilación de `arti-client` tarda varios minutos.

- [ ] **Step 4: Implementación**

Añade encima de los tests en `mode.rs`:
```rust
use serde::{Deserialize, Serialize};

use crate::NetError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NetMode {
    Direct,
    Tor,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NetSettings {
    pub mode: NetMode,
    pub exit_country: Option<String>,
    pub ai_via_tor: bool,
    pub feeds_via_tor: bool,
}

impl Default for NetSettings {
    fn default() -> Self {
        Self { mode: NetMode::Direct, exit_country: None, ai_via_tor: false, feeds_via_tor: true }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum TorState {
    Off,
    Bootstrapping { percent: u8 },
    Ready,
    Failed { message: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetStatus {
    pub mode: NetMode,
    pub tor: TorState,
    pub socks_port: u16,
    pub exit_country: Option<String>,
    pub circuit: u64,
    pub ai_via_tor: bool,
    pub feeds_via_tor: bool,
    pub kill_switch_active: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Traffic {
    /// Páginas, imágenes del lector, hemeroteca, búsquedas de respaldo.
    Web,
    Feeds,
    Ai,
    Updates,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Route {
    Direct,
    Tor,
}

pub fn route(s: &NetSettings, t: Traffic) -> Route {
    if s.mode == NetMode::Direct {
        return Route::Direct;
    }
    match t {
        Traffic::Web | Traffic::Updates => Route::Tor,
        Traffic::Feeds if s.feeds_via_tor => Route::Tor,
        Traffic::Ai if s.ai_via_tor => Route::Tor,
        _ => Route::Direct,
    }
}

pub fn normalize_country(cc: &str) -> Result<String, NetError> {
    let c = cc.trim();
    if c.len() == 2 && c.chars().all(|ch| ch.is_ascii_alphabetic()) {
        Ok(c.to_ascii_uppercase())
    } else {
        Err(NetError::InvalidCountry(cc.to_string()))
    }
}

pub fn compose_status(s: &NetSettings, tor: &TorState, socks_port: u16, circuit: u64) -> NetStatus {
    NetStatus {
        mode: s.mode,
        tor: tor.clone(),
        socks_port,
        exit_country: s.exit_country.clone(),
        circuit,
        ai_via_tor: s.ai_via_tor,
        feeds_via_tor: s.feeds_via_tor,
        kill_switch_active: s.mode == NetMode::Tor && *tor != TorState::Ready,
    }
}
```

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-net mode`
Expected: `test result: ok. 5 passed`.

- [ ] **Step 6: Comprobar una sola `libsqlite3-sys`**

Run: `cargo tree --manifest-path src-tauri/Cargo.toml -i libsqlite3-sys`
Expected: una sola versión, usada por `rusqlite 0.40.x` (y a través de él por `tor-dirmgr`). Si aparecen dos, alinea `rusqlite` del workspace con el rango de `tor-dirmgr` (`>=0.36,<0.41`).

- [ ] **Step 7: Commit**

```powershell
git add src-tauri/crates/np-net
git commit -m "feat(np-net): network modes, tor state and traffic routing rules"
```

---

### Task 10: `np-net` — protocolo SOCKS5 (servidor, solo CONNECT)

**Files:**
- Create: `src-tauri/crates/np-net/src/socks.rs`
- Modify: `src-tauri/crates/np-net/src/lib.rs`

**Interfaces:**
- Produces:
  - `TargetAddr { Domain(String, u16), Ip(std::net::SocketAddr) }` con `host() -> String`, `port() -> u16`, `Display` (`host:port`)
  - `SocksError` (`Version(u8)`, `NoAcceptableAuth`, `Command(u8)`, `AddrType(u8)`, `Domain`, `Io(String)`)
  - `reply::{SUCCEEDED, GENERAL_FAILURE, NOT_ALLOWED, NETWORK_UNREACHABLE, HOST_UNREACHABLE, CONNECTION_REFUSED, COMMAND_NOT_SUPPORTED, ADDRESS_NOT_SUPPORTED}`
  - `async fn negotiate<S>(s: &mut S) -> Result<(), SocksError>` (solo "sin autenticación")
  - `async fn read_request<S>(s: &mut S) -> Result<TargetAddr, SocksError>` (responde ella misma con 0x07/0x08 cuando procede)
  - `async fn write_reply<S>(s: &mut S, code: u8) -> std::io::Result<()>`

- [ ] **Step 1: Escribir los tests que fallan**

`src-tauri/crates/np-net/src/socks.rs`:
```rust
//! SOCKS5 (RFC 1928), lado servidor, solo CONNECT y sin autenticación.

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::io::{duplex, AsyncReadExt, AsyncWriteExt};

    async fn server_side(client_bytes: Vec<u8>) -> (Result<TargetAddr, SocksError>, Vec<u8>) {
        let (mut client, mut server) = duplex(1024);
        client.write_all(&client_bytes).await.unwrap();
        let res = async {
            negotiate(&mut server).await?;
            read_request(&mut server).await
        }
        .await;
        drop(server);
        let mut out = Vec::new();
        client.read_to_end(&mut out).await.unwrap();
        (res, out)
    }

    #[tokio::test]
    async fn parses_domain_connect_without_resolving() {
        let mut req = vec![5, 1, 0, 5, 1, 0, 3, 10];
        req.extend_from_slice(b"elpais.com");
        req.extend_from_slice(&443u16.to_be_bytes());
        let (res, out) = server_side(req).await;
        assert_eq!(res.unwrap(), TargetAddr::Domain("elpais.com".into(), 443));
        assert_eq!(out, vec![5, 0]);
    }

    #[tokio::test]
    async fn parses_ipv4_and_ipv6() {
        let mut v4 = vec![5, 1, 0, 5, 1, 0, 1, 93, 184, 216, 34];
        v4.extend_from_slice(&80u16.to_be_bytes());
        assert_eq!(server_side(v4).await.0.unwrap().to_string(), "93.184.216.34:80");
        let mut v6 = vec![5, 1, 0, 5, 1, 0, 4];
        v6.extend_from_slice(&std::net::Ipv6Addr::LOCALHOST.octets());
        v6.extend_from_slice(&8080u16.to_be_bytes());
        assert_eq!(server_side(v6).await.0.unwrap().to_string(), "[::1]:8080");
    }

    #[tokio::test]
    async fn rejects_auth_only_clients() {
        let (res, out) = server_side(vec![5, 1, 2]).await;
        assert_eq!(res.unwrap_err(), SocksError::NoAcceptableAuth);
        assert_eq!(out, vec![5, 0xFF]);
    }

    #[tokio::test]
    async fn rejects_bind_and_udp_commands() {
        let mut req = vec![5, 1, 0, 5, 2, 0, 1, 1, 2, 3, 4];
        req.extend_from_slice(&80u16.to_be_bytes());
        let (res, out) = server_side(req).await;
        assert_eq!(res.unwrap_err(), SocksError::Command(2));
        assert_eq!(&out[2..4], &[5, reply::COMMAND_NOT_SUPPORTED]);
    }

    #[tokio::test]
    async fn rejects_socks4_and_empty_domains() {
        assert_eq!(server_side(vec![4, 1, 0]).await.0.unwrap_err(), SocksError::Version(4));
        let mut req = vec![5, 1, 0, 5, 1, 0, 3, 0];
        req.extend_from_slice(&80u16.to_be_bytes());
        assert_eq!(server_side(req).await.0.unwrap_err(), SocksError::Domain);
    }
}
```

Añade a `lib.rs`: `pub mod socks;` y `pub use socks::TargetAddr;`

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-net socks`
Expected: FAIL de compilación (`cannot find function negotiate`).

- [ ] **Step 3: Implementación**

Añade encima de los tests:
```rust
use std::{
    fmt,
    io,
    net::{Ipv4Addr, Ipv6Addr, SocketAddr},
};

use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

pub mod reply {
    pub const SUCCEEDED: u8 = 0x00;
    pub const GENERAL_FAILURE: u8 = 0x01;
    pub const NOT_ALLOWED: u8 = 0x02;
    pub const NETWORK_UNREACHABLE: u8 = 0x03;
    pub const HOST_UNREACHABLE: u8 = 0x04;
    pub const CONNECTION_REFUSED: u8 = 0x05;
    pub const COMMAND_NOT_SUPPORTED: u8 = 0x07;
    pub const ADDRESS_NOT_SUPPORTED: u8 = 0x08;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TargetAddr {
    Domain(String, u16),
    Ip(SocketAddr),
}

impl TargetAddr {
    pub fn host(&self) -> String {
        match self {
            TargetAddr::Domain(h, _) => h.clone(),
            TargetAddr::Ip(sa) => sa.ip().to_string(),
        }
    }
    pub fn port(&self) -> u16 {
        match self {
            TargetAddr::Domain(_, p) => *p,
            TargetAddr::Ip(sa) => sa.port(),
        }
    }
}

impl fmt::Display for TargetAddr {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            TargetAddr::Domain(h, p) => write!(f, "{h}:{p}"),
            TargetAddr::Ip(sa) => write!(f, "{sa}"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum SocksError {
    #[error("unsupported SOCKS version {0}")]
    Version(u8),
    #[error("no acceptable authentication method")]
    NoAcceptableAuth,
    #[error("unsupported command {0}")]
    Command(u8),
    #[error("unsupported address type {0}")]
    AddrType(u8),
    #[error("invalid domain name")]
    Domain,
    #[error("io: {0}")]
    Io(String),
}

impl From<io::Error> for SocksError {
    fn from(e: io::Error) -> Self {
        SocksError::Io(e.to_string())
    }
}

pub async fn negotiate<S: AsyncRead + AsyncWrite + Unpin>(s: &mut S) -> Result<(), SocksError> {
    let ver = s.read_u8().await?;
    if ver != 5 {
        return Err(SocksError::Version(ver));
    }
    let n = s.read_u8().await? as usize;
    let mut methods = vec![0u8; n];
    s.read_exact(&mut methods).await?;
    if methods.contains(&0x00) {
        s.write_all(&[5, 0x00]).await?;
        Ok(())
    } else {
        s.write_all(&[5, 0xFF]).await?;
        Err(SocksError::NoAcceptableAuth)
    }
}

pub async fn write_reply<S: AsyncWrite + Unpin>(s: &mut S, code: u8) -> io::Result<()> {
    s.write_all(&[5, code, 0, 1, 0, 0, 0, 0, 0, 0]).await
}

pub async fn read_request<S: AsyncRead + AsyncWrite + Unpin>(s: &mut S) -> Result<TargetAddr, SocksError> {
    let mut head = [0u8; 4];
    s.read_exact(&mut head).await?;
    if head[0] != 5 {
        return Err(SocksError::Version(head[0]));
    }
    if head[1] != 0x01 {
        write_reply(s, reply::COMMAND_NOT_SUPPORTED).await?;
        return Err(SocksError::Command(head[1]));
    }
    let target = match head[3] {
        0x01 => {
            let mut ip = [0u8; 4];
            s.read_exact(&mut ip).await?;
            let port = s.read_u16().await?;
            TargetAddr::Ip(SocketAddr::from((Ipv4Addr::from(ip), port)))
        }
        0x03 => {
            let len = s.read_u8().await? as usize;
            let mut name = vec![0u8; len];
            s.read_exact(&mut name).await?;
            let port = s.read_u16().await?;
            let name = String::from_utf8(name).map_err(|_| SocksError::Domain)?;
            if name.is_empty() || name.contains(['\0', '/', ' ']) {
                write_reply(s, reply::GENERAL_FAILURE).await?;
                return Err(SocksError::Domain);
            }
            TargetAddr::Domain(name, port)
        }
        0x04 => {
            let mut ip = [0u8; 16];
            s.read_exact(&mut ip).await?;
            let port = s.read_u16().await?;
            TargetAddr::Ip(SocketAddr::from((Ipv6Addr::from(ip), port)))
        }
        other => {
            write_reply(s, reply::ADDRESS_NOT_SUPPORTED).await?;
            return Err(SocksError::AddrType(other));
        }
    };
    Ok(target)
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-net socks`
Expected: `test result: ok. 5 passed`.

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/crates/np-net
git commit -m "feat(np-net): SOCKS5 server-side protocol (CONNECT, no auth, remote DNS)"
```

---

### Task 11: `np-net` — servidor SOCKS con conector y kill switch; Tor simulado

**Files:**
- Create: `src-tauri/crates/np-net/src/server.rs`, `src-tauri/crates/np-net/src/fake.rs`
- Modify: `src-tauri/crates/np-net/src/lib.rs`
- Test: `src-tauri/crates/np-net/tests/socks_server.rs`

**Interfaces:**
- Consumes: `negotiate`, `read_request`, `write_reply`, `TargetAddr` (T10), `TorState` (T9).
- Produces:
  - `pub trait AsyncStream: AsyncRead + AsyncWrite + Unpin + Send {}` (impl genérica), `pub type BoxStream = Box<dyn AsyncStream>`
  - `ConnectError { NotReady, Unreachable(String), Refused(String) }` con `reply_code() -> u8`
  - `#[async_trait] pub trait Connector: Send + Sync { async fn connect(&self, target: &TargetAddr) -> Result<BoxStream, ConnectError>; }`
  - `pub trait TorBackend: Send + Sync { fn start(&self); fn stop(&self); fn subscribe(&self) -> watch::Receiver<TorState>; fn set_exit_country(&self, cc: Option<&str>) -> Result<(), NetError>; fn new_circuit(&self) -> u64; fn circuit(&self) -> u64; fn connector(self: Arc<Self>) -> Arc<dyn Connector>; }`
  - `SocksServer::bind(connector: Arc<dyn Connector>) -> io::Result<SocksServer>`, `SocksServer::port() -> u16` (aborta su tarea al soltarse)
  - `fake::FakeTor::new(ready: bool) -> Arc<FakeTor>`, `set_ready(bool)`, `with_host(name, SocketAddr)` (resolución simulada), `seen_targets() -> Vec<String>`, `starts() -> usize`, `stops() -> usize`, `exit_country() -> Option<String>`

- [ ] **Step 1: Escribir el test que falla**

`src-tauri/crates/np-net/tests/socks_server.rs`:
```rust
use std::sync::Arc;

use np_net::{fake::FakeTor, server::{SocksServer, TorBackend}};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
};

async fn echo_server() -> std::net::SocketAddr {
    let l = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = l.local_addr().unwrap();
    tokio::spawn(async move {
        while let Ok((mut s, _)) = l.accept().await {
            tokio::spawn(async move {
                let mut buf = [0u8; 64];
                let n = s.read(&mut buf).await.unwrap();
                s.write_all(&buf[..n]).await.unwrap();
            });
        }
    });
    addr
}

async fn socks_connect(port: u16, host: &str, target_port: u16) -> (TcpStream, u8) {
    let mut s = TcpStream::connect(("127.0.0.1", port)).await.unwrap();
    s.write_all(&[5, 1, 0]).await.unwrap();
    let mut hello = [0u8; 2];
    s.read_exact(&mut hello).await.unwrap();
    let mut req = vec![5, 1, 0, 3, host.len() as u8];
    req.extend_from_slice(host.as_bytes());
    req.extend_from_slice(&target_port.to_be_bytes());
    s.write_all(&req).await.unwrap();
    let mut rep = [0u8; 10];
    s.read_exact(&mut rep).await.unwrap();
    (s, rep[1])
}

#[tokio::test]
async fn relays_traffic_through_the_connector_with_remote_names() {
    let echo = echo_server().await;
    let tor = FakeTor::new(true).with_host("news.test", echo);
    let server = SocksServer::bind(tor.clone().connector()).await.unwrap();
    let (mut s, code) = socks_connect(server.port(), "news.test", echo.port()).await;
    assert_eq!(code, 0);
    s.write_all(b"hola").await.unwrap();
    let mut buf = [0u8; 4];
    s.read_exact(&mut buf).await.unwrap();
    assert_eq!(&buf, b"hola");
    assert_eq!(tor.seen_targets(), vec![format!("news.test:{}", echo.port())]);
}

#[tokio::test]
async fn kill_switch_refuses_when_tor_is_not_ready() {
    let echo = echo_server().await;
    let tor = FakeTor::new(false).with_host("news.test", echo);
    let server = SocksServer::bind(tor.clone().connector()).await.unwrap();
    let (_s, code) = socks_connect(server.port(), "news.test", echo.port()).await;
    assert_eq!(code, np_net::socks::reply::GENERAL_FAILURE);
    assert!(tor.seen_targets().is_empty(), "nothing leaves when not ready");
}

#[tokio::test]
async fn unreachable_targets_report_host_unreachable() {
    let tor = FakeTor::new(true);
    let server = SocksServer::bind(tor.clone().connector()).await.unwrap();
    let (_s, code) = socks_connect(server.port(), "no-such-host.test", 9).await;
    assert_eq!(code, np_net::socks::reply::HOST_UNREACHABLE);
}

#[tokio::test]
async fn binds_only_on_loopback_with_a_random_port() {
    let tor = FakeTor::new(true);
    let a = SocksServer::bind(tor.clone().connector()).await.unwrap();
    let b = SocksServer::bind(tor.connector()).await.unwrap();
    assert_ne!(a.port(), 0);
    assert_ne!(a.port(), b.port());
    assert!(TcpStream::connect(("127.0.0.1", a.port())).await.is_ok());
    let _ = Arc::new(a);
}
```

Añade a `lib.rs`:
```rust
pub mod fake;
pub mod server;
pub use server::{BoxStream, ConnectError, Connector, SocksServer, TorBackend};
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-net --test socks_server`
Expected: FAIL de compilación (`could not find server in np_net`).

- [ ] **Step 3: Servidor**

`src-tauri/crates/np-net/src/server.rs`:
```rust
//! Servidor SOCKS5 en 127.0.0.1:<aleatorio>. Su único conector es Tor: si no está listo, responde error.
use std::{
    io,
    net::{Ipv4Addr, SocketAddr},
    sync::Arc,
    time::Duration,
};

use async_trait::async_trait;
use tokio::{
    io::{AsyncRead, AsyncWrite},
    net::{TcpListener, TcpStream},
    sync::watch,
    task::JoinHandle,
};

use crate::{
    socks::{negotiate, read_request, reply, write_reply, SocksError, TargetAddr},
    NetError, TorState,
};

pub trait AsyncStream: AsyncRead + AsyncWrite + Unpin + Send {}
impl<T: AsyncRead + AsyncWrite + Unpin + Send> AsyncStream for T {}
pub type BoxStream = Box<dyn AsyncStream>;

#[derive(Debug, thiserror::Error)]
pub enum ConnectError {
    #[error("tor is not ready")]
    NotReady,
    #[error("unreachable: {0}")]
    Unreachable(String),
    #[error("refused: {0}")]
    Refused(String),
}

impl ConnectError {
    pub fn reply_code(&self) -> u8 {
        match self {
            ConnectError::NotReady => reply::GENERAL_FAILURE,
            ConnectError::Unreachable(_) => reply::HOST_UNREACHABLE,
            ConnectError::Refused(_) => reply::CONNECTION_REFUSED,
        }
    }
}

#[async_trait]
pub trait Connector: Send + Sync {
    async fn connect(&self, target: &TargetAddr) -> Result<BoxStream, ConnectError>;
}

/// Motor Tor intercambiable (Arti real o `FakeTor`).
pub trait TorBackend: Send + Sync {
    fn start(&self);
    fn stop(&self);
    fn subscribe(&self) -> watch::Receiver<TorState>;
    fn set_exit_country(&self, cc: Option<&str>) -> Result<(), NetError>;
    /// Nuevo `IsolationToken`; devuelve el número de circuito nuevo.
    fn new_circuit(&self) -> u64;
    fn circuit(&self) -> u64;
    fn connector(self: Arc<Self>) -> Arc<dyn Connector>;
}

pub struct SocksServer {
    port: u16,
    task: JoinHandle<()>,
}

impl SocksServer {
    pub async fn bind(connector: Arc<dyn Connector>) -> io::Result<Self> {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await?;
        let port = listener.local_addr()?.port();
        let task = tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((sock, peer)) => {
                        if !peer.ip().is_loopback() {
                            continue;
                        }
                        let c = connector.clone();
                        tokio::spawn(async move {
                            if let Err(e) = handle(sock, peer, c).await {
                                tracing::debug!(error = %e, "socks session ended with error");
                            }
                        });
                    }
                    Err(e) => {
                        tracing::warn!(error = %e, "socks accept failed");
                        tokio::time::sleep(Duration::from_millis(100)).await;
                    }
                }
            }
        });
        Ok(Self { port, task })
    }

    pub fn port(&self) -> u16 {
        self.port
    }
}

impl Drop for SocksServer {
    fn drop(&mut self) {
        self.task.abort();
    }
}

async fn handle(mut sock: TcpStream, _peer: SocketAddr, connector: Arc<dyn Connector>) -> Result<(), SocksError> {
    negotiate(&mut sock).await?;
    let target = read_request(&mut sock).await?;
    match connector.connect(&target).await {
        Ok(mut upstream) => {
            write_reply(&mut sock, reply::SUCCEEDED).await?;
            let _ = tokio::io::copy_bidirectional(&mut sock, &mut upstream).await;
            Ok(())
        }
        Err(e) => {
            tracing::debug!(target = %target, error = %e, "connect refused by kill switch or tor");
            write_reply(&mut sock, e.reply_code()).await?;
            Ok(())
        }
    }
}
```

- [ ] **Step 4: Tor simulado**

`src-tauri/crates/np-net/src/fake.rs`:
```rust
//! Tor simulado para tests y e2e (spec §12): conecta directo, pero obedece "listo / no listo".
use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{
        atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
        Arc, Mutex,
    },
};

use async_trait::async_trait;
use tokio::{net::TcpStream, sync::watch};

use crate::{
    mode::normalize_country,
    server::{BoxStream, ConnectError, Connector, TorBackend},
    socks::TargetAddr,
    NetError, TorState,
};

pub struct FakeTor {
    ready: AtomicBool,
    state: watch::Sender<TorState>,
    hosts: Mutex<HashMap<String, SocketAddr>>,
    seen: Mutex<Vec<String>>,
    country: Mutex<Option<String>>,
    circuit: AtomicU64,
    starts: AtomicUsize,
    stops: AtomicUsize,
}

impl FakeTor {
    pub fn new(ready: bool) -> Arc<Self> {
        let (state, _) = watch::channel(if ready { TorState::Ready } else { TorState::Off });
        Arc::new(Self {
            ready: AtomicBool::new(ready),
            state,
            hosts: Mutex::default(),
            seen: Mutex::default(),
            country: Mutex::default(),
            circuit: AtomicU64::new(1),
            starts: AtomicUsize::new(0),
            stops: AtomicUsize::new(0),
        })
    }

    pub fn with_host(self: Arc<Self>, name: &str, addr: SocketAddr) -> Arc<Self> {
        self.hosts.lock().unwrap().insert(name.to_string(), addr);
        self
    }

    pub fn set_ready(&self, ready: bool) {
        self.ready.store(ready, Ordering::SeqCst);
        self.state.send_replace(if ready { TorState::Ready } else { TorState::Bootstrapping { percent: 50 } });
    }

    pub fn seen_targets(&self) -> Vec<String> {
        self.seen.lock().unwrap().clone()
    }
    pub fn starts(&self) -> usize {
        self.starts.load(Ordering::SeqCst)
    }
    pub fn stops(&self) -> usize {
        self.stops.load(Ordering::SeqCst)
    }
    pub fn exit_country(&self) -> Option<String> {
        self.country.lock().unwrap().clone()
    }
}

#[async_trait]
impl Connector for FakeTor {
    async fn connect(&self, target: &TargetAddr) -> Result<BoxStream, ConnectError> {
        if !self.ready.load(Ordering::SeqCst) {
            return Err(ConnectError::NotReady);
        }
        self.seen.lock().unwrap().push(target.to_string());
        let mapped = self.hosts.lock().unwrap().get(&target.host()).copied();
        let stream = match (mapped, target) {
            (Some(addr), _) => TcpStream::connect(addr).await,
            (None, TargetAddr::Ip(sa)) => TcpStream::connect(*sa).await,
            (None, TargetAddr::Domain(h, p)) if !h.ends_with(".test") => TcpStream::connect((h.as_str(), *p)).await,
            (None, _) => return Err(ConnectError::Unreachable(target.to_string())),
        };
        stream.map(|s| Box::new(s) as BoxStream).map_err(|e| ConnectError::Unreachable(e.to_string()))
    }
}

impl TorBackend for FakeTor {
    fn start(&self) {
        self.starts.fetch_add(1, Ordering::SeqCst);
        if self.ready.load(Ordering::SeqCst) {
            self.state.send_replace(TorState::Ready);
        }
    }
    fn stop(&self) {
        self.stops.fetch_add(1, Ordering::SeqCst);
        self.state.send_replace(TorState::Off);
    }
    fn subscribe(&self) -> watch::Receiver<TorState> {
        self.state.subscribe()
    }
    fn set_exit_country(&self, cc: Option<&str>) -> Result<(), NetError> {
        let v = cc.map(normalize_country).transpose()?;
        *self.country.lock().unwrap() = v;
        Ok(())
    }
    fn new_circuit(&self) -> u64 {
        self.circuit.fetch_add(1, Ordering::SeqCst) + 1
    }
    fn circuit(&self) -> u64 {
        self.circuit.load(Ordering::SeqCst)
    }
    fn connector(self: Arc<Self>) -> Arc<dyn Connector> {
        self
    }
}
```

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-net`
Expected: unitarios de `mode` y `socks` (10) + `socks_server` (4) en verde.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/crates/np-net
git commit -m "feat(np-net): loopback SOCKS5 server with connector-level kill switch and fake tor"
```

---

### Task 12: `np-net` — Arti (Tor real) como `TorBackend`

**Files:**
- Create: `src-tauri/crates/np-net/src/tor.rs`
- Modify: `src-tauri/crates/np-net/src/lib.rs`
- Test: `src-tauri/crates/np-net/tests/tor_live.rs` (ignorado por defecto)

**Interfaces:**
- Consumes: `TorBackend`, `Connector`, `ConnectError`, `BoxStream` (T11), `TorState`, `normalize_country` (T9).
- Produces: `tor::ArtiTor::new(state_dir: PathBuf, cache_dir: PathBuf) -> Arc<ArtiTor>` (implementa `TorBackend`); `tor::country_code(cc: &str) -> Result<arti_client::CountryCode, NetError>`.

APIs de `arti-client` 0.47 usadas (verificadas en docs.rs; si alguna difiere, ajusta solo `tor.rs`):
`TorClientConfigBuilder::from_directories(state, cache).build()`, `TorClient::builder().config(c).bootstrap_behavior(BootstrapBehavior::Manual).create_unbootstrapped()`, `TorClient::bootstrap()`, `TorClient::bootstrap_events()` (stream de `BootstrapStatus` con `as_frac()`), `TorClient::connect_with_prefs(addr, &StreamPrefs)`, `StreamPrefs::{new, exit_country(CountryCode), any_exit_country, set_isolation}`, `IsolationToken::new()`, `CountryCode: FromStr`.

- [ ] **Step 1: Escribir los tests que fallan**

`src-tauri/crates/np-net/src/tor.rs`:
```rust
//! Tor embebido con Arti. Arranque manual, estado observable, país de salida y aislamiento por circuito.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_country_codes() {
        assert_eq!(country_code("de").unwrap().to_string(), "DE");
        assert!(country_code("zz9").is_err());
    }

    #[tokio::test]
    async fn not_ready_until_bootstrapped() {
        let dir = tempfile::tempdir().unwrap();
        let tor = ArtiTor::new(dir.path().join("state"), dir.path().join("cache"));
        assert_eq!(*tor.subscribe().borrow(), TorState::Off);
        let c = tor.clone().connector();
        let err = c.connect(&crate::TargetAddr::Domain("example.com".into(), 80)).await.unwrap_err();
        assert!(matches!(err, ConnectError::NotReady));
    }

    #[test]
    fn new_circuit_increments() {
        let dir = tempfile::tempdir().unwrap();
        let tor = ArtiTor::new(dir.path().join("state"), dir.path().join("cache"));
        let a = tor.circuit();
        assert_eq!(tor.new_circuit(), a + 1);
        assert!(tor.set_exit_country(Some("nl")).is_ok());
        assert!(tor.set_exit_country(Some("nope")).is_err());
        assert!(tor.set_exit_country(None).is_ok());
    }
}
```

`src-tauri/crates/np-net/tests/tor_live.rs`:
```rust
//! Prueba real contra la red Tor. Ejecutar a mano: cargo test -p np-net --test tor_live -- --ignored
use std::time::Duration;

use np_net::{controller::NetController, tor::ArtiTor, NetMode, NetSettings, TorState, Traffic};

#[tokio::test]
#[ignore = "requires internet access and bootstraps the real Tor network"]
async fn browses_through_tor_and_reports_istor() {
    let dir = tempfile::tempdir().unwrap();
    let tor = ArtiTor::new(dir.path().join("state"), dir.path().join("cache"));
    let net = NetController::start(NetSettings { mode: NetMode::Tor, ..Default::default() }, tor).await.unwrap();
    let mut rx = net.subscribe();
    tokio::time::timeout(Duration::from_secs(180), async {
        while rx.borrow().tor != TorState::Ready {
            rx.changed().await.unwrap();
        }
    })
    .await
    .expect("bootstrap within 3 minutes");
    let body: serde_json::Value = net
        .http_client(Traffic::Web)
        .get("https://check.torproject.org/api/ip")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(body["IsTor"], true);
}
```

Añade a `lib.rs`: `pub mod tor;`

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-net tor::`
Expected: FAIL de compilación (`cannot find struct ArtiTor`).

- [ ] **Step 3: Implementación**

Añade encima de los tests en `tor.rs`:
```rust
use std::{
    path::PathBuf,
    str::FromStr,
    sync::{Arc, Mutex, Weak},
};

use arti_client::{
    config::TorClientConfigBuilder, BootstrapBehavior, CountryCode, IsolationToken, StreamPrefs, TorClient,
};
use async_trait::async_trait;
use futures::StreamExt;
use tokio::{sync::watch, task::JoinHandle};
use tor_rtcompat::PreferredRuntime;

use crate::{
    mode::normalize_country,
    server::{BoxStream, ConnectError, Connector, TorBackend},
    socks::TargetAddr,
    NetError, TorState,
};

pub fn country_code(cc: &str) -> Result<CountryCode, NetError> {
    let n = normalize_country(cc)?;
    CountryCode::from_str(&n).map_err(|_| NetError::InvalidCountry(cc.to_string()))
}

struct Prefs {
    country: Option<CountryCode>,
    token: IsolationToken,
    circuit: u64,
}

pub struct ArtiTor {
    me: Weak<ArtiTor>,
    state_dir: PathBuf,
    cache_dir: PathBuf,
    client: Mutex<Option<Arc<TorClient<PreferredRuntime>>>>,
    state: watch::Sender<TorState>,
    prefs: Mutex<Prefs>,
    task: Mutex<Option<JoinHandle<()>>>,
}

impl ArtiTor {
    pub fn new(state_dir: PathBuf, cache_dir: PathBuf) -> Arc<Self> {
        let (state, _) = watch::channel(TorState::Off);
        // `new_cyclic` guarda un Weak propio: `start(&self)` necesita un Arc para lanzar la tarea.
        Arc::new_cyclic(|me| Self {
            me: me.clone(),
            state_dir,
            cache_dir,
            client: Mutex::new(None),
            state,
            prefs: Mutex::new(Prefs { country: None, token: IsolationToken::new(), circuit: 1 }),
            task: Mutex::new(None),
        })
    }

    fn stream_prefs(&self) -> StreamPrefs {
        let p = self.prefs.lock().expect("prefs lock");
        let mut sp = StreamPrefs::new();
        sp.set_isolation(p.token);
        match p.country {
            Some(cc) => sp.exit_country(cc),
            None => sp.any_exit_country(),
        };
        sp
    }

    async fn run(self: Arc<Self>) {
        let config = match TorClientConfigBuilder::from_directories(&self.state_dir, &self.cache_dir).build() {
            Ok(c) => c,
            Err(e) => return self.fail(e.to_string()),
        };
        let client = match TorClient::builder()
            .config(config)
            .bootstrap_behavior(BootstrapBehavior::Manual)
            .create_unbootstrapped()
        {
            Ok(c) => c,
            Err(e) => return self.fail(e.to_string()),
        };
        let mut events = client.bootstrap_events();
        let state = self.state.clone();
        tokio::spawn(async move {
            while let Some(s) = events.next().await {
                let percent = (s.as_frac() * 100.0).clamp(0.0, 99.0) as u8;
                state.send_if_modified(|cur| {
                    if matches!(cur, TorState::Bootstrapping { .. }) {
                        *cur = TorState::Bootstrapping { percent };
                        true
                    } else {
                        false
                    }
                });
            }
        });
        *self.client.lock().expect("client lock") = Some(client.clone());
        match client.bootstrap().await {
            Ok(()) => {
                self.state.send_replace(TorState::Ready);
            }
            Err(e) => self.fail(e.to_string()),
        }
    }

    fn fail(&self, message: String) {
        tracing::error!(%message, "tor bootstrap failed");
        *self.client.lock().expect("client lock") = None;
        self.state.send_replace(TorState::Failed { message });
    }
}

impl TorBackend for ArtiTor {
    fn start(&self) {
        let mut task = self.task.lock().expect("task lock");
        if task.as_ref().is_some_and(|t| !t.is_finished()) || *self.state.borrow() == TorState::Ready {
            return;
        }
        let Some(me) = self.me.upgrade() else { return };
        self.state.send_replace(TorState::Bootstrapping { percent: 0 });
        *task = Some(tokio::spawn(me.run()));
    }

    fn stop(&self) {
        if let Some(t) = self.task.lock().expect("task lock").take() {
            t.abort();
        }
        *self.client.lock().expect("client lock") = None;
        self.state.send_replace(TorState::Off);
    }

    fn subscribe(&self) -> watch::Receiver<TorState> {
        self.state.subscribe()
    }

    fn set_exit_country(&self, cc: Option<&str>) -> Result<(), NetError> {
        let parsed = cc.map(country_code).transpose()?;
        self.prefs.lock().expect("prefs lock").country = parsed;
        Ok(())
    }

    fn new_circuit(&self) -> u64 {
        let mut p = self.prefs.lock().expect("prefs lock");
        p.token = IsolationToken::new();
        p.circuit += 1;
        p.circuit
    }

    fn circuit(&self) -> u64 {
        self.prefs.lock().expect("prefs lock").circuit
    }

    fn connector(self: Arc<Self>) -> Arc<dyn Connector> {
        self
    }
}

#[async_trait]
impl Connector for ArtiTor {
    async fn connect(&self, target: &TargetAddr) -> Result<BoxStream, ConnectError> {
        if *self.state.borrow() != TorState::Ready {
            return Err(ConnectError::NotReady);
        }
        let Some(client) = self.client.lock().expect("client lock").clone() else {
            return Err(ConnectError::NotReady);
        };
        let prefs = self.stream_prefs();
        let stream = client
            .connect_with_prefs((target.host(), target.port()), &prefs)
            .await
            .map_err(|e| ConnectError::Unreachable(e.to_string()))?;
        Ok(Box::new(stream))
    }
}
```

> `StreamPrefs::exit_country` y `any_exit_country` devuelven `&mut Self`; el `match` las usa como sentencias. Si `set_isolation` no existe con ese nombre en 0.47, usa `sp.new_isolation_group()` **una vez por circuito** guardando el `StreamPrefs` resultante en `Prefs` en lugar del token (mismo efecto: un `IsolationToken` nuevo por circuito).
> `connect_with_prefs((String, u16), …)`: si el host es una IP literal, Arti la acepta como dirección; Chromium con `socks5://` y `--host-resolver-rules` envía nombres, así que es raro.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-net tor::`
Expected: `test result: ok. 3 passed`.

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/crates/np-net
git commit -m "feat(np-net): embedded arti tor backend with exit country and isolation tokens"
```

---

### Task 13: `np-net` — `NetController`: modo, estado, clientes HTTP y kill switch

**Files:**
- Create: `src-tauri/crates/np-net/src/controller.rs`
- Modify: `src-tauri/crates/np-net/src/lib.rs`
- Test: `src-tauri/crates/np-net/tests/http_routing.rs`

**Interfaces:**
- Consumes: `SocksServer`, `TorBackend` (T11), `route`, `compose_status`, `NetSettings`, `Traffic` (T9).
- Produces:
  - `NetController::start(settings: NetSettings, tor: Arc<dyn TorBackend>) -> Result<Arc<NetController>, NetError>`
  - `status() -> NetStatus`, `subscribe() -> watch::Receiver<NetStatus>`, `settings() -> NetSettings`, `socks_port() -> u16`
  - `set_mode(NetMode) -> bool` (cambió), `set_exit_country(Option<String>) -> Result<bool, NetError>`, `new_circuit() -> u64`, `set_routing(ai_via_tor: Option<bool>, feeds_via_tor: Option<bool>) -> bool`
  - `http_client(Traffic) -> reqwest::Client` (Tor → `socks5h://127.0.0.1:<p>` con `no_proxy` para `localhost,127.0.0.1,::1`; nunca hay respaldo a directo)
  - `tor_browser_args(port: u16) -> String`

- [ ] **Step 1: Escribir los tests que fallan**

`src-tauri/crates/np-net/tests/http_routing.rs`:
```rust
use np_net::{controller::NetController, fake::FakeTor, server::TorBackend, NetMode, NetSettings, TorState, Traffic};
use tokio::{io::{AsyncReadExt, AsyncWriteExt}, net::TcpListener};

async fn http_ok() -> std::net::SocketAddr {
    let l = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = l.local_addr().unwrap();
    tokio::spawn(async move {
        while let Ok((mut s, _)) = l.accept().await {
            tokio::spawn(async move {
                let mut buf = [0u8; 1024];
                let _ = s.read(&mut buf).await;
                let _ = s.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok").await;
            });
        }
    });
    addr
}

fn tor_mode() -> NetSettings {
    NetSettings { mode: NetMode::Tor, ..Default::default() }
}

#[tokio::test]
async fn web_traffic_goes_through_tor_with_remote_dns() {
    let site = http_ok().await;
    let tor = FakeTor::new(true).with_host("news.test", site);
    let net = NetController::start(tor_mode(), tor.clone()).await.unwrap();
    let url = format!("http://news.test:{}/", site.port());
    let body = net.http_client(Traffic::Web).get(&url).send().await.unwrap().text().await.unwrap();
    assert_eq!(body, "ok");
    assert_eq!(tor.seen_targets(), vec![format!("news.test:{}", site.port())]);
}

#[tokio::test]
async fn kill_switch_fails_requests_instead_of_going_direct() {
    let site = http_ok().await;
    let tor = FakeTor::new(false).with_host("news.test", site);
    let net = NetController::start(tor_mode(), tor.clone()).await.unwrap();
    assert!(net.status().kill_switch_active);
    let url = format!("http://news.test:{}/", site.port());
    assert!(net.http_client(Traffic::Web).get(&url).send().await.is_err());
    assert!(net.http_client(Traffic::Feeds).get(&url).send().await.is_err());
}

#[tokio::test]
async fn loopback_is_never_proxied() {
    let site = http_ok().await;
    let tor = FakeTor::new(false);
    let net = NetController::start(tor_mode(), tor.clone()).await.unwrap();
    let body = net.http_client(Traffic::Web).get(format!("http://127.0.0.1:{}/", site.port())).send().await.unwrap().text().await.unwrap();
    assert_eq!(body, "ok");
    assert!(tor.seen_targets().is_empty());
}

#[tokio::test]
async fn mode_country_and_circuit_changes_update_status() {
    let tor = FakeTor::new(true);
    let net = NetController::start(NetSettings::default(), tor.clone()).await.unwrap();
    assert_eq!(tor.starts(), 0);
    assert!(net.set_mode(NetMode::Tor));
    assert!(!net.set_mode(NetMode::Tor));
    assert_eq!(tor.starts(), 1);
    assert!(net.set_exit_country(Some("de".into())).unwrap());
    assert_eq!(tor.exit_country().as_deref(), Some("DE"));
    assert!(net.set_exit_country(Some("xyz".into())).is_err());
    let before = net.status().circuit;
    assert_eq!(net.new_circuit(), before + 1);
    tokio::task::yield_now().await;
    let s = net.status();
    assert_eq!(s.exit_country.as_deref(), Some("DE"));
    assert_eq!(s.tor, TorState::Ready);
    assert_eq!(s.circuit, before + 1);
    assert!(net.set_mode(NetMode::Direct));
    assert_eq!(tor.stops(), 1);
}

#[test]
fn tor_browser_args_force_remote_dns_and_block_webrtc_leaks() {
    let a = np_net::controller::tor_browser_args(50123);
    assert!(a.contains("--proxy-server=socks5://127.0.0.1:50123"));
    assert!(a.contains("--host-resolver-rules=\"MAP * ~NOTFOUND , EXCLUDE 127.0.0.1\""));
    assert!(a.contains("--force-webrtc-ip-handling-policy=disable_non_proxied_udp"));
}
```

Añade a `lib.rs`: `pub mod controller;` y `pub use controller::NetController;`

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-net --test http_routing`
Expected: FAIL de compilación (`could not find controller`).

- [ ] **Step 3: Implementación**

`src-tauri/crates/np-net/src/controller.rs`:
```rust
//! Orquesta modo de red, Tor, proxy SOCKS y clientes HTTP por tipo de tráfico.
use std::{
    sync::{Arc, RwLock},
    time::Duration,
};

use tokio::sync::watch;

use crate::{
    compose_status,
    mode::normalize_country,
    route,
    server::{SocksServer, TorBackend},
    NetError, NetMode, NetSettings, NetStatus, Route, Traffic,
};

pub fn tor_browser_args(port: u16) -> String {
    format!(
        "--proxy-server=socks5://127.0.0.1:{port} --host-resolver-rules=\"MAP * ~NOTFOUND , EXCLUDE 127.0.0.1\" --force-webrtc-ip-handling-policy=disable_non_proxied_udp"
    )
}

fn build_client(socks_port: Option<u16>) -> Result<reqwest::Client, NetError> {
    let mut b = reqwest::Client::builder()
        .user_agent(concat!("newpaper/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(45))
        .read_timeout(Duration::from_secs(90));
    match socks_port {
        Some(p) => {
            let proxy = reqwest::Proxy::all(format!("socks5h://127.0.0.1:{p}"))?
                .no_proxy(reqwest::NoProxy::from_string("localhost,127.0.0.1,::1"));
            b = b.proxy(proxy);
        }
        None => b = b.no_proxy(),
    }
    Ok(b.build()?)
}

pub struct NetController {
    tor: Arc<dyn TorBackend>,
    server: SocksServer,
    settings: RwLock<NetSettings>,
    status: watch::Sender<NetStatus>,
    direct: reqwest::Client,
    proxied: reqwest::Client,
}

impl NetController {
    pub async fn start(settings: NetSettings, tor: Arc<dyn TorBackend>) -> Result<Arc<Self>, NetError> {
        let server = SocksServer::bind(tor.clone().connector()).await?;
        let port = server.port();
        if let Some(cc) = &settings.exit_country {
            tor.set_exit_country(Some(cc))?;
        }
        let initial = compose_status(&settings, &tor.subscribe().borrow(), port, tor.circuit());
        let (status, _) = watch::channel(initial);
        let me = Arc::new(Self {
            direct: build_client(None)?,
            proxied: build_client(Some(port))?,
            tor: tor.clone(),
            server,
            settings: RwLock::new(settings.clone()),
            status,
        });
        if settings.mode == NetMode::Tor {
            tor.start();
        }
        let weak = Arc::downgrade(&me);
        let mut rx = tor.subscribe();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                match weak.upgrade() {
                    Some(me) => me.refresh(),
                    None => break,
                }
            }
        });
        me.refresh();
        Ok(me)
    }

    fn refresh(&self) {
        let s = self.settings.read().expect("settings lock").clone();
        let tor = self.tor.subscribe().borrow().clone();
        self.status.send_replace(compose_status(&s, &tor, self.server.port(), self.tor.circuit()));
    }

    pub fn status(&self) -> NetStatus {
        self.status.borrow().clone()
    }

    pub fn subscribe(&self) -> watch::Receiver<NetStatus> {
        self.status.subscribe()
    }

    pub fn settings(&self) -> NetSettings {
        self.settings.read().expect("settings lock").clone()
    }

    pub fn socks_port(&self) -> u16 {
        self.server.port()
    }

    pub fn set_mode(&self, mode: NetMode) -> bool {
        {
            let mut s = self.settings.write().expect("settings lock");
            if s.mode == mode {
                return false;
            }
            s.mode = mode;
        }
        match mode {
            NetMode::Tor => self.tor.start(),
            NetMode::Direct => self.tor.stop(),
        }
        self.refresh();
        true
    }

    pub fn set_exit_country(&self, cc: Option<String>) -> Result<bool, NetError> {
        let cc = cc.map(|c| normalize_country(&c)).transpose()?;
        if self.settings.read().expect("settings lock").exit_country == cc {
            return Ok(false);
        }
        self.tor.set_exit_country(cc.as_deref())?;
        self.settings.write().expect("settings lock").exit_country = cc;
        self.refresh();
        Ok(true)
    }

    pub fn new_circuit(&self) -> u64 {
        let n = self.tor.new_circuit();
        self.refresh();
        n
    }

    pub fn set_routing(&self, ai_via_tor: Option<bool>, feeds_via_tor: Option<bool>) -> bool {
        let changed = {
            let mut s = self.settings.write().expect("settings lock");
            let before = (s.ai_via_tor, s.feeds_via_tor);
            if let Some(v) = ai_via_tor {
                s.ai_via_tor = v;
            }
            if let Some(v) = feeds_via_tor {
                s.feeds_via_tor = v;
            }
            before != (s.ai_via_tor, s.feeds_via_tor)
        };
        if changed {
            self.refresh();
        }
        changed
    }

    pub fn http_client(&self, traffic: Traffic) -> reqwest::Client {
        match route(&self.settings.read().expect("settings lock"), traffic) {
            Route::Tor => self.proxied.clone(),
            Route::Direct => self.direct.clone(),
        }
    }
}
```

> `NetController::start(..., tor.clone())` con `tor: Arc<FakeTor>` necesita una coerción a `Arc<dyn TorBackend>`: en los tests pasa `tor.clone()` directamente; Rust la hace sola al ser el tipo del parámetro.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-net`
Expected: todos en verde (unitarios 13 + `socks_server` 4 + `http_routing` 5; `tor_live` ignorado).

- [ ] **Step 5: Prueba real opcional**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-net --test tor_live -- --ignored`
Expected: `1 passed` en menos de 3 minutos (requiere internet).

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/crates/np-net
git commit -m "feat(np-net): net controller with per-traffic http clients and tor kill switch"
```

---

### Task 14: `np-app` — ajustes y adaptadores de privacidad

**Files:**
- Modify: `src-tauri/Cargo.toml` (dependencias `np-adblock`, `np-net`)
- Create: `src-tauri/src/privacy/mod.rs` (solo `pub mod` por ahora), `src-tauri/src/privacy/settings.rs`, `src-tauri/src/privacy/adapters.rs`
- Modify: `src-tauri/src/lib.rs` (`pub mod privacy;`)

**Interfaces:**
- Consumes: `Store`, `ShellExtensions` y traits (subproyecto 1), `NetController`, `Traffic` (T13), `AdblockService`, `BlockedNotifier`, `parse_cosmetic_message`, `handle_cosmetic` (T6, T8).
- Produces:
  - `privacy::settings::{MODE_KEY, EXIT_KEY, AI_KEY, FEEDS_KEY, ADBLOCK_KEY}`, `load_net_settings(&Store) -> Result<NetSettings>`, `save_net_settings(&Store, &NetSettings) -> Result<()>`, `load_adblock_settings(&Store) -> Result<AdblockSettings>`, `save_adblock_settings(&Store, &AdblockSettings) -> Result<()>`
  - `privacy::adapters::profile_for(mode: NetMode, socks_port: u16, without_tor: bool) -> WebviewProfile`
  - `privacy::adapters::traffic_for(p: HttpPurpose) -> Traffic`
  - `NetProfiles::new(net) -> Self` (`WebviewProfileProvider`), `mark_without_tor(tab)`, `forget(tab)`, `without_tor() -> Vec<TabId>`
  - `NetHttp(Arc<NetController>)` (`HttpClientProvider`)
  - `AdblockHook(Arc<AdblockService>)` (`ContentWebviewHook`), `CosmeticHandler(Arc<AdblockService>)` (`ContentMessageHandler`)
  - `Throttle::new(min_gap: Duration)`, `Throttle::allow(tab, now: Instant) -> bool`

- [ ] **Step 1: Dependencias**

Añade a `[dependencies]` de `src-tauri/Cargo.toml`:
```toml
np-adblock = { path = "crates/np-adblock" }
np-net = { path = "crates/np-net" }
async-trait = { workspace = true }
```

- [ ] **Step 2: Escribir los tests que fallan**

`src-tauri/src/privacy/settings.rs`:
```rust
//! Persistencia de los ajustes de red y bloqueo.

#[cfg(test)]
mod tests {
    use super::*;
    use np_net::NetMode;

    #[test]
    fn defaults_when_nothing_is_stored() {
        let s = Store::open_in_memory().unwrap();
        assert_eq!(load_net_settings(&s).unwrap(), NetSettings::default());
        assert_eq!(load_adblock_settings(&s).unwrap(), AdblockSettings::default());
    }

    #[test]
    fn round_trips_through_individual_keys() {
        let s = Store::open_in_memory().unwrap();
        let n = NetSettings { mode: NetMode::Tor, exit_country: Some("DE".into()), ai_via_tor: true, feeds_via_tor: false };
        save_net_settings(&s, &n).unwrap();
        assert_eq!(s.get_setting::<String>(MODE_KEY).unwrap().as_deref(), Some("tor"));
        assert_eq!(s.get_setting::<Option<String>>(EXIT_KEY).unwrap(), Some(Some("DE".into())));
        assert_eq!(load_net_settings(&s).unwrap(), n);
    }

    #[test]
    fn ignores_garbage_and_falls_back_to_defaults() {
        let s = Store::open_in_memory().unwrap();
        s.set_setting(MODE_KEY, &"wireguard").unwrap();
        assert_eq!(load_net_settings(&s).unwrap().mode, NetMode::Direct);
    }
}
```

`src-tauri/src/privacy/adapters.rs`:
```rust
//! Adaptadores entre np-net/np-adblock y los puntos de extensión de np-shell.

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn direct_profile_uses_tauri_defaults() {
        let p = profile_for(NetMode::Direct, 50123, false);
        assert_eq!(p.data_dir_name, "direct");
        assert_eq!(p.additional_browser_args, DEFAULT_BROWSER_ARGS);
    }

    #[test]
    fn tor_profile_adds_proxy_flags_and_own_data_dir() {
        let p = profile_for(NetMode::Tor, 50123, false);
        assert_eq!(p.data_dir_name, "tor");
        assert!(p.additional_browser_args.starts_with(DEFAULT_BROWSER_ARGS));
        assert!(p.additional_browser_args.contains("socks5://127.0.0.1:50123"));
    }

    #[test]
    fn tabs_opened_without_tor_use_the_direct_profile() {
        assert_eq!(profile_for(NetMode::Tor, 50123, true).data_dir_name, "direct");
    }

    #[test]
    fn maps_http_purposes_to_traffic() {
        assert_eq!(traffic_for(HttpPurpose::Content), Traffic::Web);
        assert_eq!(traffic_for(HttpPurpose::Search), Traffic::Web);
        assert_eq!(traffic_for(HttpPurpose::Archive), Traffic::Web);
        assert_eq!(traffic_for(HttpPurpose::Feeds), Traffic::Feeds);
        assert_eq!(traffic_for(HttpPurpose::Ai), Traffic::Ai);
        assert_eq!(traffic_for(HttpPurpose::Updates), Traffic::Updates);
    }

    #[test]
    fn throttle_allows_one_event_per_gap_and_tab() {
        let t = Throttle::new(Duration::from_millis(250));
        let t0 = Instant::now();
        assert!(t.allow(1, t0));
        assert!(!t.allow(1, t0 + Duration::from_millis(100)));
        assert!(t.allow(2, t0 + Duration::from_millis(100)));
        assert!(t.allow(1, t0 + Duration::from_millis(300)));
    }
}
```

`src-tauri/src/privacy/mod.rs`:
```rust
//! Subproyecto 2: bloqueo y red.
pub mod adapters;
pub mod settings;
```

Añade a `src-tauri/src/lib.rs`: `pub mod privacy;`

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-app privacy`
Expected: FAIL de compilación (`cannot find function load_net_settings`).

- [ ] **Step 4: Implementación de ajustes**

Añade encima de los tests en `settings.rs`:
```rust
use np_adblock::service::AdblockSettings;
use np_net::{NetMode, NetSettings};
use np_store::{Store, StoreError};

pub const MODE_KEY: &str = "privacy.mode";
pub const EXIT_KEY: &str = "privacy.exitCountry";
pub const AI_KEY: &str = "privacy.aiViaTor";
pub const FEEDS_KEY: &str = "privacy.feedsViaTor";
pub const ADBLOCK_KEY: &str = "adblock.settings";

pub fn load_net_settings(store: &Store) -> Result<NetSettings, StoreError> {
    let d = NetSettings::default();
    let mode = match store.get_setting::<serde_json::Value>(MODE_KEY)? {
        Some(v) => serde_json::from_value::<NetMode>(v).unwrap_or(d.mode),
        None => d.mode,
    };
    Ok(NetSettings {
        mode,
        exit_country: store.get_setting::<Option<String>>(EXIT_KEY).unwrap_or(None).flatten(),
        ai_via_tor: store.get_setting::<bool>(AI_KEY).unwrap_or(None).unwrap_or(d.ai_via_tor),
        feeds_via_tor: store.get_setting::<bool>(FEEDS_KEY).unwrap_or(None).unwrap_or(d.feeds_via_tor),
    })
}

pub fn save_net_settings(store: &Store, s: &NetSettings) -> Result<(), StoreError> {
    store.set_setting(MODE_KEY, &s.mode)?;
    store.set_setting(EXIT_KEY, &s.exit_country)?;
    store.set_setting(AI_KEY, &s.ai_via_tor)?;
    store.set_setting(FEEDS_KEY, &s.feeds_via_tor)
}

pub fn load_adblock_settings(store: &Store) -> Result<AdblockSettings, StoreError> {
    Ok(store.get_setting::<AdblockSettings>(ADBLOCK_KEY).unwrap_or(None).unwrap_or_default())
}

pub fn save_adblock_settings(store: &Store, s: &AdblockSettings) -> Result<(), StoreError> {
    store.set_setting(ADBLOCK_KEY, s)
}
```

- [ ] **Step 5: Implementación de adaptadores**

Añade encima de los tests en `adapters.rs`:
```rust
use std::{
    collections::{HashMap, HashSet},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use np_adblock::{
    cosmetic_msg::{handle_cosmetic, parse_cosmetic_message},
    service::{AdblockService, BlockedNotifier},
};
use np_net::{controller::tor_browser_args, NetController, NetMode, Traffic};
use np_shell::{
    extensions::{
        ContentMessageHandler, ContentWebviewHook, HttpClientProvider, HttpPurpose, WebviewProfile, WebviewProfileProvider,
        DEFAULT_BROWSER_ARGS,
    },
    TabId,
};
use serde_json::Value;
use tauri::{AppHandle, Emitter};

pub fn profile_for(mode: NetMode, socks_port: u16, without_tor: bool) -> WebviewProfile {
    if mode == NetMode::Direct || without_tor {
        return WebviewProfile { data_dir_name: "direct".into(), additional_browser_args: DEFAULT_BROWSER_ARGS.into() };
    }
    WebviewProfile {
        data_dir_name: "tor".into(),
        additional_browser_args: format!("{DEFAULT_BROWSER_ARGS} {}", tor_browser_args(socks_port)),
    }
}

pub fn traffic_for(p: HttpPurpose) -> Traffic {
    match p {
        HttpPurpose::Content | HttpPurpose::Search | HttpPurpose::Archive => Traffic::Web,
        HttpPurpose::Feeds => Traffic::Feeds,
        HttpPurpose::Ai => Traffic::Ai,
        HttpPurpose::Updates => Traffic::Updates,
    }
}

pub struct NetProfiles {
    net: Arc<NetController>,
    without_tor: Mutex<HashSet<TabId>>,
}

impl NetProfiles {
    pub fn new(net: Arc<NetController>) -> Self {
        Self { net, without_tor: Mutex::default() }
    }
    pub fn mark_without_tor(&self, tab: TabId) {
        self.without_tor.lock().expect("lock").insert(tab);
    }
    pub fn forget(&self, tab: TabId) {
        self.without_tor.lock().expect("lock").remove(&tab);
    }
    pub fn without_tor(&self) -> Vec<TabId> {
        let mut v: Vec<TabId> = self.without_tor.lock().expect("lock").iter().copied().collect();
        v.sort();
        v
    }
}

impl WebviewProfileProvider for NetProfiles {
    fn profile_for_tab(&self, tab: TabId) -> WebviewProfile {
        let without = self.without_tor.lock().expect("lock").contains(&tab);
        profile_for(self.net.settings().mode, self.net.socks_port(), without)
    }
}

pub struct NetHttp(pub Arc<NetController>);

impl HttpClientProvider for NetHttp {
    fn client(&self, purpose: HttpPurpose) -> Result<reqwest::Client, String> {
        Ok(self.0.http_client(traffic_for(purpose)))
    }
}

/// Los marcados "sin Tor" no se olvidan al cerrar la webview: `recreate_tab` la cierra y la vuelve a crear.
pub struct AdblockHook {
    pub svc: Arc<AdblockService>,
}

impl ContentWebviewHook for AdblockHook {
    fn on_content_webview_created(&self, tab: TabId, webview: &tauri::Webview) {
        #[cfg(windows)]
        if let Err(e) = np_adblock::webview2::attach(webview, tab, self.svc.clone()) {
            tracing::error!(tab, error = %e, "adblock hook failed");
        }
        #[cfg(not(windows))]
        let _ = (tab, webview);
    }
    fn on_content_webview_closed(&self, tab: TabId) {
        self.svc.stats().remove_tab(tab);
    }
}

pub struct CosmeticHandler(pub Arc<AdblockService>);

impl ContentMessageHandler for CosmeticHandler {
    fn handles(&self, kind: &str) -> bool {
        kind.starts_with("np-cosmetic-")
    }
    fn handle(&self, _tab: TabId, payload: &Value) -> Option<Value> {
        parse_cosmetic_message(payload).and_then(|req| handle_cosmetic(&self.0, req))
    }
}

pub struct Throttle {
    gap: Duration,
    last: Mutex<HashMap<TabId, Instant>>,
}

impl Throttle {
    pub fn new(gap: Duration) -> Self {
        Self { gap, last: Mutex::default() }
    }
    pub fn allow(&self, tab: TabId, now: Instant) -> bool {
        let mut last = self.last.lock().expect("lock");
        match last.get(&tab) {
            Some(t) if now.duration_since(*t) < self.gap => false,
            _ => {
                last.insert(tab, now);
                true
            }
        }
    }
}

/// Avisa a la UI de cada bloqueo (como mucho 4 veces por segundo y pestaña; el volcado de
/// estadísticas cada 5 s envía el valor final).
pub struct UiNotifier {
    app: AppHandle,
    throttle: Throttle,
}

impl UiNotifier {
    pub fn new(app: AppHandle) -> Self {
        Self { app, throttle: Throttle::new(Duration::from_millis(250)) }
    }
}

impl BlockedNotifier for UiNotifier {
    fn blocked(&self, tab: u64, tab_count: u64) {
        if self.throttle.allow(tab, Instant::now()) {
            let _ = self.app.emit_to("ui", "adblock://blocked", serde_json::json!({ "tabId": tab, "tabCount": tab_count }));
        }
    }
}
```

- [ ] **Step 6: Ejecutar y ver que pasa**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-app privacy`
Expected: `test result: ok. 8 passed`.

- [ ] **Step 7: Commit**

```powershell
git add src-tauri/Cargo.toml src-tauri/src/lib.rs src-tauri/src/privacy
git commit -m "feat(app): privacy settings persistence and np-shell adapters for net and adblock"
```

---

### Task 15: `np-app` — arranque de privacidad, tareas de fondo y comandos

**Files:**
- Modify: `src-tauri/src/privacy/mod.rs`
- Create: `src-tauri/src/privacy/commands.rs`
- Modify: `src-tauri/src/features.rs`, `src-tauri/src/lib.rs`, `src-tauri/build.rs`, `src-tauri/capabilities/ui.json`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces:
  - Estado gestionado: `Arc<AdblockService>`, `Arc<np_adblock::lists::ListCache>`, `Arc<NetController>`, `Arc<NetProfiles>`
  - `privacy::setup(app: &mut tauri::App) -> Result<(), Box<dyn Error>>`
  - `privacy::rebuild_blocker(svc, cache)` (en hilo bloqueante)
  - Eventos: `net://status` (`PrivacyStatus`), `adblock://blocked` (`{tabId, tabCount}`), `adblock://counts` (`{tabs: {[tabId]: count}, today}` cada 5 s)
  - Comandos:

| Comando | Args | Devuelve |
|---|---|---|
| `privacy_status` | — | `PrivacyStatus` = `NetStatus` + `tabsWithoutTor: number[]` |
| `net_set_mode` | `{ mode: 'direct' \| 'tor' }` | `PrivacyStatus` |
| `tor_set_exit_country` | `{ country: string \| null }` | `PrivacyStatus` |
| `tor_new_circuit` | `{ tabId?: number }` | `PrivacyStatus` |
| `privacy_set_routing` | `{ aiViaTor?: bool, feedsViaTor?: bool }` | `PrivacyStatus` |
| `tab_without_tor` | `{ tabId }` | `PrivacyStatus` |
| `adblock_status` | — | `AdblockStatus` |
| `adblock_set_enabled` | `{ enabled }` | `AdblockStatus` |
| `adblock_set_list` | `{ id, enabled }` | `AdblockStatus` |
| `adblock_refresh` | — | `RefreshReport` |
| `blocked_counts` | `{ tabId?: number }` | `{ tab: number, today: number }` |

- [ ] **Step 1: Arranque**

Sustituye `src-tauri/src/privacy/mod.rs` por:
```rust
//! Subproyecto 2: bloqueo y red.
pub mod adapters;
pub mod commands;
pub mod settings;

use std::{sync::Arc, time::Duration};

use async_trait::async_trait;
use np_adblock::{
    cosmetic_msg::COSMETIC_SCRIPT,
    lists::ListCache,
    service::{build_blocker, AdblockService},
    stats::today_local,
    updater::{refresh_lists, ListFetcher},
};
use np_net::{fake::FakeTor, server::TorBackend, tor::ArtiTor, NetController};
use np_shell::extensions::{HttpPurpose, ShellExtensions};
use np_store::Store;
use tauri::{App, AppHandle, Emitter, Manager};

use adapters::{AdblockHook, CosmeticHandler, NetHttp, NetProfiles, UiNotifier};

/// Descargas de listas: siguen el modo de red (por Tor si está activo).
struct ShellFetcher(Arc<ShellExtensions>);

#[async_trait]
impl ListFetcher for ShellFetcher {
    async fn fetch(&self, url: &str) -> Result<String, String> {
        let client = self.0.http_client(HttpPurpose::Content)?;
        let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("HTTP {}", resp.status()));
        }
        resp.text().await.map_err(|e| e.to_string())
    }
}

fn extra_rules() -> Option<String> {
    if cfg!(debug_assertions) {
        std::env::var("NP_TEST_EXTRA_RULES").ok()
    } else {
        None
    }
}

pub fn rebuild_blocker(svc: Arc<AdblockService>, cache: Arc<ListCache>) {
    tauri::async_runtime::spawn_blocking(move || {
        let settings = svc.settings();
        let blocker = build_blocker(&cache, &settings, extra_rules().as_deref());
        svc.install_blocker(blocker);
        tracing::info!(lists = settings.lists.len(), "adblock engine rebuilt");
    });
}

fn tor_backend(app: &App) -> Result<Arc<dyn TorBackend>, Box<dyn std::error::Error>> {
    if cfg!(debug_assertions) && std::env::var("NP_FAKE_TOR").is_ok() {
        tracing::warn!("using simulated Tor (NP_FAKE_TOR)");
        return Ok(FakeTor::new(true));
    }
    let base = app.path().app_local_data_dir()?.join("tor");
    Ok(ArtiTor::new(base.join("state"), base.join("cache")))
}

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let store = app.state::<Arc<Store>>().inner().clone();
    let ext = app.state::<Arc<ShellExtensions>>().inner().clone();
    let data = app.path().app_local_data_dir()?;

    // --- Bloqueo ---
    let svc = Arc::new(AdblockService::new(settings::load_adblock_settings(&store)?, Arc::new(UiNotifier::new(app.handle().clone()))));
    let cache = Arc::new(ListCache::new(data.join("filter-lists")));
    rebuild_blocker(svc.clone(), cache.clone());

    // --- Red ---
    let net = tauri::async_runtime::block_on(NetController::start(settings::load_net_settings(&store)?, tor_backend(app)?))?;
    let profiles = Arc::new(NetProfiles::new(net.clone()));
    ext.set_profile_provider(profiles.clone());
    ext.set_http_provider(Arc::new(NetHttp(net.clone())));
    ext.add_hook(Arc::new(AdblockHook { svc: svc.clone() }));
    ext.add_message_handler(Arc::new(CosmeticHandler(svc.clone())));
    ext.add_init_script(COSMETIC_SCRIPT.to_string());

    spawn_status_forwarder(app.handle().clone(), net.clone(), profiles.clone());
    spawn_stats_flush(app.handle().clone(), store, svc.clone());
    spawn_list_refresher(ext, svc.clone(), cache.clone());

    app.manage(svc);
    app.manage(cache);
    app.manage(net);
    app.manage(profiles);
    Ok(())
}

fn spawn_status_forwarder(app: AppHandle, net: Arc<NetController>, profiles: Arc<NetProfiles>) {
    tauri::async_runtime::spawn(async move {
        let mut rx = net.subscribe();
        loop {
            let status = commands::PrivacyStatus::new(rx.borrow().clone(), profiles.without_tor());
            let _ = app.emit_to("ui", "net://status", status);
            if rx.changed().await.is_err() {
                break;
            }
        }
    });
}

fn spawn_stats_flush(app: AppHandle, store: Arc<Store>, svc: Arc<AdblockService>) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(5)).await;
            if let Err(e) = store.with_conn(|c| svc.stats().flush(c)) {
                tracing::warn!(error = %e, "blocked stats flush failed");
            }
            let today = store.with_conn(|c| svc.stats().day_total(c, &today_local())).unwrap_or(0);
            let _ = app.emit_to("ui", "adblock://counts", serde_json::json!({ "tabs": svc.stats().tab_counts(), "today": today }));
        }
    });
}

fn spawn_list_refresher(ext: Arc<ShellExtensions>, svc: Arc<AdblockService>, cache: Arc<ListCache>) {
    tauri::async_runtime::spawn(async move {
        // Primer intento a los 20 s (dar tiempo a Tor) y luego cada hora; refresh_lists solo descarga si toca (24 h).
        tokio::time::sleep(Duration::from_secs(20)).await;
        loop {
            let enabled = svc.settings().lists;
            let report = refresh_lists(&cache, &ShellFetcher(ext.clone()), &enabled, chrono::Utc::now().timestamp(), false).await;
            if !report.updated.is_empty() {
                rebuild_blocker(svc.clone(), cache.clone());
            }
            tokio::time::sleep(Duration::from_secs(3600)).await;
        }
    });
}
```

> `BlockedStats::tab_counts()` no existe aún: añádelo en `src-tauri/crates/np-adblock/src/stats.rs` (y un test):
> ```rust
> pub fn tab_counts(&self) -> std::collections::HashMap<u64, u64> {
>     self.inner.lock().expect("stats lock").per_tab.clone()
> }
> ```
> ```rust
> #[test]
> fn exposes_all_tab_counts() {
>     let s = BlockedStats::new();
>     s.record(1, "2026-10-06");
>     s.record(1, "2026-10-06");
>     assert_eq!(s.tab_counts().get(&1), Some(&2));
> }
> ```

- [ ] **Step 2: Comandos**

`src-tauri/src/privacy/commands.rs`:
```rust
use std::sync::Arc;

use np_adblock::{
    lists::ListCache,
    service::{adblock_status as compute_adblock_status, AdblockService, AdblockStatus},
    stats::today_local,
    updater::{refresh_lists, RefreshReport},
};
use np_net::{NetController, NetMode, NetStatus};
use np_shell::{extensions::ShellExtensions, TabId, TabManager};
use np_store::Store;
use serde::Serialize;
use tauri::State;

use super::{adapters::NetProfiles, rebuild_blocker, settings, ShellFetcher};
use crate::error::{CmdError, CmdResult};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivacyStatus {
    #[serde(flatten)]
    pub net: NetStatus,
    pub tabs_without_tor: Vec<TabId>,
}

impl PrivacyStatus {
    pub fn new(net: NetStatus, tabs_without_tor: Vec<TabId>) -> Self {
        Self { net, tabs_without_tor }
    }
}

fn status(net: &NetController, profiles: &NetProfiles) -> PrivacyStatus {
    PrivacyStatus::new(net.status(), profiles.without_tor())
}

fn net_err(e: np_net::NetError) -> CmdError {
    CmdError::new("net", e.to_string())
}

#[tauri::command]
pub async fn privacy_status(net: State<'_, Arc<NetController>>, profiles: State<'_, Arc<NetProfiles>>) -> CmdResult<PrivacyStatus> {
    Ok(status(&net, &profiles))
}

#[tauri::command]
pub async fn net_set_mode(
    net: State<'_, Arc<NetController>>,
    profiles: State<'_, Arc<NetProfiles>>,
    store: State<'_, Arc<Store>>,
    tabs: State<'_, Arc<TabManager>>,
    mode: NetMode,
) -> CmdResult<PrivacyStatus> {
    if net.set_mode(mode) {
        settings::save_net_settings(&store, &net.settings())?;
        tabs.recreate_all_content_webviews().await?;
    }
    Ok(status(&net, &profiles))
}

#[tauri::command]
pub async fn tor_set_exit_country(
    net: State<'_, Arc<NetController>>,
    profiles: State<'_, Arc<NetProfiles>>,
    store: State<'_, Arc<Store>>,
    tabs: State<'_, Arc<TabManager>>,
    country: Option<String>,
) -> CmdResult<PrivacyStatus> {
    if net.set_exit_country(country).map_err(net_err)? {
        settings::save_net_settings(&store, &net.settings())?;
        if net.settings().mode == NetMode::Tor {
            tabs.recreate_all_content_webviews().await?;
        }
    }
    Ok(status(&net, &profiles))
}

#[tauri::command]
pub async fn tor_new_circuit(
    net: State<'_, Arc<NetController>>,
    profiles: State<'_, Arc<NetProfiles>>,
    tabs: State<'_, Arc<TabManager>>,
    tab_id: Option<TabId>,
) -> CmdResult<PrivacyStatus> {
    net.new_circuit();
    if let Some(id) = tab_id.or(tabs.snapshot().active_id) {
        tabs.recreate_tab(id).await?;
    }
    Ok(status(&net, &profiles))
}

#[tauri::command]
pub async fn privacy_set_routing(
    net: State<'_, Arc<NetController>>,
    profiles: State<'_, Arc<NetProfiles>>,
    store: State<'_, Arc<Store>>,
    ai_via_tor: Option<bool>,
    feeds_via_tor: Option<bool>,
) -> CmdResult<PrivacyStatus> {
    if net.set_routing(ai_via_tor, feeds_via_tor) {
        settings::save_net_settings(&store, &net.settings())?;
    }
    Ok(status(&net, &profiles))
}

/// Acción explícita del usuario (la UI muestra antes un aviso): la pestaña sale por conexión directa.
#[tauri::command]
pub async fn tab_without_tor(
    net: State<'_, Arc<NetController>>,
    profiles: State<'_, Arc<NetProfiles>>,
    tabs: State<'_, Arc<TabManager>>,
    tab_id: TabId,
) -> CmdResult<PrivacyStatus> {
    profiles.mark_without_tor(tab_id);
    tabs.recreate_tab(tab_id).await?;
    Ok(status(&net, &profiles))
}

#[tauri::command]
pub async fn adblock_status(svc: State<'_, Arc<AdblockService>>, cache: State<'_, Arc<ListCache>>) -> CmdResult<AdblockStatus> {
    Ok(compute_adblock_status(&cache, &svc.settings()))
}

#[tauri::command]
pub async fn adblock_set_enabled(
    svc: State<'_, Arc<AdblockService>>,
    cache: State<'_, Arc<ListCache>>,
    store: State<'_, Arc<Store>>,
    enabled: bool,
) -> CmdResult<AdblockStatus> {
    svc.set_enabled(enabled);
    settings::save_adblock_settings(&store, &svc.settings())?;
    Ok(compute_adblock_status(&cache, &svc.settings()))
}

#[tauri::command]
pub async fn adblock_set_list(
    svc: State<'_, Arc<AdblockService>>,
    cache: State<'_, Arc<ListCache>>,
    store: State<'_, Arc<Store>>,
    id: String,
    enabled: bool,
) -> CmdResult<AdblockStatus> {
    if svc.set_list_enabled(&id, enabled).map_err(|e| CmdError::new("adblock_list", e))? {
        settings::save_adblock_settings(&store, &svc.settings())?;
        rebuild_blocker(svc.inner().clone(), cache.inner().clone());
    }
    Ok(compute_adblock_status(&cache, &svc.settings()))
}

#[tauri::command]
pub async fn adblock_refresh(
    svc: State<'_, Arc<AdblockService>>,
    cache: State<'_, Arc<ListCache>>,
    ext: State<'_, Arc<ShellExtensions>>,
) -> CmdResult<RefreshReport> {
    let report = refresh_lists(&cache, &ShellFetcher(ext.inner().clone()), &svc.settings().lists, chrono::Utc::now().timestamp(), true).await;
    if !report.updated.is_empty() {
        rebuild_blocker(svc.inner().clone(), cache.inner().clone());
    }
    Ok(report)
}

#[derive(Serialize)]
pub struct BlockedCounts {
    pub tab: u64,
    pub today: u64,
}

#[tauri::command]
pub async fn blocked_counts(svc: State<'_, Arc<AdblockService>>, store: State<'_, Arc<Store>>, tab_id: Option<TabId>) -> CmdResult<BlockedCounts> {
    let today = store.with_conn(|c| svc.stats().day_total(c, &today_local()))?;
    Ok(BlockedCounts { tab: tab_id.map(|t| svc.stats().tab_count(t)).unwrap_or(0), today })
}
```

- [ ] **Step 3: Registro**

En `src-tauri/src/features.rs`:
```rust
pub fn setup_all(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    crate::privacy::setup(app)?;
    Ok(())
}
```

En `src-tauri/src/lib.rs`, dentro de `generate_handler![...]`, añade:
```rust
            privacy::commands::privacy_status,
            privacy::commands::net_set_mode,
            privacy::commands::tor_set_exit_country,
            privacy::commands::tor_new_circuit,
            privacy::commands::privacy_set_routing,
            privacy::commands::tab_without_tor,
            privacy::commands::adblock_status,
            privacy::commands::adblock_set_enabled,
            privacy::commands::adblock_set_list,
            privacy::commands::adblock_refresh,
            privacy::commands::blocked_counts,
```

En `src-tauri/build.rs`, añade a `APP_COMMANDS`:
```rust
    "privacy_status", "net_set_mode", "tor_set_exit_country", "tor_new_circuit", "privacy_set_routing",
    "tab_without_tor", "adblock_status", "adblock_set_enabled", "adblock_set_list", "adblock_refresh",
    "blocked_counts",
```

En `src-tauri/capabilities/ui.json`, añade a `permissions`:
```json
    "allow-privacy-status", "allow-net-set-mode", "allow-tor-set-exit-country", "allow-tor-new-circuit",
    "allow-privacy-set-routing", "allow-tab-without-tor", "allow-adblock-status", "allow-adblock-set-enabled",
    "allow-adblock-set-list", "allow-adblock-refresh", "allow-blocked-counts"
```

Añade `chrono = { workspace = true }` a `src-tauri/Cargo.toml` si no estaba (el subproyecto 1 ya lo incluye).

- [ ] **Step 4: Compilar y ejecutar tests**

Run:
```powershell
cargo test --manifest-path src-tauri/Cargo.toml -p np-adblock stats
cargo test --manifest-path src-tauri/Cargo.toml -p np-app
```
Expected: `np-adblock stats` 5 tests; `np-app` todos en verde (incluidos los 8 de privacidad).

- [ ] **Step 5: Arranque manual**

Run: `$env:NP_FAKE_TOR="1"; pnpm tauri dev`
Expected: la app arranca; en la consola aparece `using simulated Tor (NP_FAKE_TOR)` y, tras unos segundos, `adblock engine rebuilt`. Abre `https://www.efe.com`: carga sin anuncios (comprueba en DevTools → Network que las peticiones de anuncios devuelven 403).

- [ ] **Step 6: Commit**

```powershell
git add src-tauri
git commit -m "feat(app): wire adblock and tor into the shell with background tasks and commands"
```

---
### Task 16: UI — IPC, estado de privacidad y textos

**Files:**
- Modify: `apps/ui/src/ipc/types.ts`, `apps/ui/src/ipc/commands.ts`, `apps/ui/src/ipc/events.ts`
- Create: `apps/ui/src/features/privacy/usePrivacy.ts`, `apps/ui/src/features/privacy/countries.ts`, `apps/ui/src/features/privacy/withoutTor.ts`
- Modify: `packages/i18n/locales/{es,en,de}.json`
- Test: `apps/ui/src/features/privacy/usePrivacy.test.ts`

**Interfaces:**
- Consumes: comandos y eventos de la Tarea 15; `createStore` (subproyecto 1).
- Produces:
  - Tipos: `NetMode`, `TorState`, `PrivacyStatus`, `ListCategory`, `FilterListStatus`, `AdblockStatus`, `RefreshReport`, `BlockedCounts`
  - `commands.{privacyStatus, netSetMode, torSetExitCountry, torNewCircuit, privacySetRouting, tabWithoutTor, adblockStatus, adblockSetEnabled, adblockSetList, adblockRefresh, blockedCounts}`
  - `onNetStatus`, `onAdblockBlocked`, `onAdblockCounts`
  - `privacyStore`, `startPrivacySync(): Promise<() => void>`, `usePrivacyStatus(): PrivacyStatus | null`, `useBlockedCount(tabId: number | null): number`, `useTodayBlocked(): number`
  - `EXIT_COUNTRIES: { code: string; lat: number; lon: number }[]`, `countryName(code, locale): string` (usa `Intl.DisplayNames`)
  - `withoutTorStore`, `requestOpenWithoutTor(tabId: number)`, `cancelOpenWithoutTor()`

- [ ] **Step 1: Textos**

Añade a `packages/i18n/locales/es.json`:
```json
"privacy": {
  "shield": {
    "label": "{count, plural, =0 {Nada bloqueado en esta página} one {# elemento bloqueado en esta página} other {# elementos bloqueados en esta página}}",
    "title": "Bloqueo",
    "page": "Esta página",
    "today": "Hoy",
    "enabled": "Bloquear anuncios y rastreadores",
    "settings": "Ajustes de bloqueo"
  },
  "tor": {
    "chipDirect": "Directo",
    "chipTor": "Tor · {country}",
    "chipLabel": "Red: {status}. Abrir opciones de Tor",
    "auto": "Auto",
    "withoutTor": "Sin Tor",
    "stateOff": "Tor apagado",
    "stateBootstrapping": "Conectando a Tor… {percent} %",
    "stateReady": "Conectado a Tor",
    "stateFailed": "Tor no disponible: no sale nada por conexión directa",
    "popupTitle": "Opciones de Tor",
    "routeYou": "Tú",
    "routeGuard": "Guardia",
    "routeMiddle": "Medio",
    "routeExit": "Salida · {country}",
    "prev": "País anterior",
    "next": "País siguiente",
    "autoCountry": "Automático",
    "fly": "Salir por {country}",
    "flyAuto": "Salir por cualquier país",
    "flying": "Cambiando de salida…",
    "current": "Salida actual",
    "newCircuit": "Nuevo circuito",
    "circuit": "Circuito n.º {n}",
    "withoutTorAction": "Abrir esta pestaña sin Tor",
    "more": "Más opciones",
    "enable": "Activar Tor",
    "directNote": "Conexión directa: los medios ven tu IP real. El bloqueo sigue activo.",
    "reducesAnonymity": "Fijar un país reduce el anonimato"
  },
  "withoutTor": {
    "title": "¿Abrir esta pestaña sin Tor?",
    "body": "La página verá tu dirección IP real y tu proveedor de internet sabrá qué medio visitas. Solo afecta a esta pestaña.",
    "confirm": "Abrir sin Tor"
  },
  "settings": {
    "title": "Privacidad y red",
    "connection": "Conexión",
    "restartNote": "Cambiar de modo o de país reinicia el motor web (unos 2 s). Las pestañas se recargan.",
    "modeDirect": "Directo",
    "modeDirectDesc": "Sin intermediarios. Rápido, pero los medios ven tu IP.",
    "modeTor": "Tor",
    "modeTorDesc": "Tu tráfico sale por la red Tor desde el país que elijas.",
    "modeWireguard": "WireGuard",
    "modeWireguardDesc": "Importar un perfil .conf de tu proveedor. Llegará en una fase posterior.",
    "exitCountry": "País de salida",
    "routing": "Qué pasa por Tor",
    "feedsViaTor": "Descargar las fuentes RSS por Tor",
    "aiViaTor": "Enviar las peticiones de IA por Tor",
    "aiViaTorHint": "Más lento. Los modelos locales nunca pasan por Tor."
  },
  "blocking": {
    "title": "Bloqueo",
    "enabled": "Bloquear anuncios, rastreadores, banners de cookies y modales de suscripción",
    "lists": "Listas de filtros",
    "sourceDownloaded": "Actualizada {date}",
    "sourceEmbedded": "Copia incluida en la app",
    "refresh": "Actualizar ahora",
    "refreshed": "{count, plural, =0 {Ninguna lista ha cambiado} one {# lista actualizada} other {# listas actualizadas}}",
    "refreshFailed": "{count, plural, one {# lista no se pudo descargar} other {# listas no se pudieron descargar}}",
    "engine": "Motor: adblock-rust · última actualización: {when}",
    "never": "nunca",
    "categoryAds": "Anuncios",
    "categoryPrivacy": "Rastreadores",
    "categoryCookies": "Banners de cookies",
    "categoryNewsletters": "Modales de suscripción"
  }
}
```

Añade a `packages/i18n/locales/en.json`:
```json
"privacy": {
  "shield": {
    "label": "{count, plural, =0 {Nothing blocked on this page} one {# item blocked on this page} other {# items blocked on this page}}",
    "title": "Blocking",
    "page": "This page",
    "today": "Today",
    "enabled": "Block ads and trackers",
    "settings": "Blocking settings"
  },
  "tor": {
    "chipDirect": "Direct",
    "chipTor": "Tor · {country}",
    "chipLabel": "Network: {status}. Open Tor options",
    "auto": "Auto",
    "withoutTor": "No Tor",
    "stateOff": "Tor is off",
    "stateBootstrapping": "Connecting to Tor… {percent}%",
    "stateReady": "Connected to Tor",
    "stateFailed": "Tor unavailable: nothing goes out directly",
    "popupTitle": "Tor options",
    "routeYou": "You",
    "routeGuard": "Guard",
    "routeMiddle": "Middle",
    "routeExit": "Exit · {country}",
    "prev": "Previous country",
    "next": "Next country",
    "autoCountry": "Automatic",
    "fly": "Exit via {country}",
    "flyAuto": "Exit via any country",
    "flying": "Changing exit…",
    "current": "Current exit",
    "newCircuit": "New circuit",
    "circuit": "Circuit #{n}",
    "withoutTorAction": "Open this tab without Tor",
    "more": "More options",
    "enable": "Turn on Tor",
    "directNote": "Direct connection: outlets see your real IP. Blocking stays on.",
    "reducesAnonymity": "Pinning a country reduces anonymity"
  },
  "withoutTor": {
    "title": "Open this tab without Tor?",
    "body": "The page will see your real IP address and your internet provider will know which outlet you visit. Only this tab is affected.",
    "confirm": "Open without Tor"
  },
  "settings": {
    "title": "Privacy and network",
    "connection": "Connection",
    "restartNote": "Changing mode or country restarts the web engine (about 2 s). Tabs reload.",
    "modeDirect": "Direct",
    "modeDirectDesc": "No intermediaries. Fast, but outlets see your IP.",
    "modeTor": "Tor",
    "modeTorDesc": "Your traffic leaves through the Tor network from the country you choose.",
    "modeWireguard": "WireGuard",
    "modeWireguardDesc": "Import a .conf profile from your provider. Coming in a later phase.",
    "exitCountry": "Exit country",
    "routing": "What goes through Tor",
    "feedsViaTor": "Download RSS feeds through Tor",
    "aiViaTor": "Send AI requests through Tor",
    "aiViaTorHint": "Slower. Local models never go through Tor."
  },
  "blocking": {
    "title": "Blocking",
    "enabled": "Block ads, trackers, cookie banners and newsletter pop-ups",
    "lists": "Filter lists",
    "sourceDownloaded": "Updated {date}",
    "sourceEmbedded": "Copy bundled with the app",
    "refresh": "Update now",
    "refreshed": "{count, plural, =0 {No list changed} one {# list updated} other {# lists updated}}",
    "refreshFailed": "{count, plural, one {# list could not be downloaded} other {# lists could not be downloaded}}",
    "engine": "Engine: adblock-rust · last update: {when}",
    "never": "never",
    "categoryAds": "Ads",
    "categoryPrivacy": "Trackers",
    "categoryCookies": "Cookie banners",
    "categoryNewsletters": "Newsletter pop-ups"
  }
}
```

Añade a `packages/i18n/locales/de.json`:
```json
"privacy": {
  "shield": {
    "label": "{count, plural, =0 {Auf dieser Seite nichts blockiert} one {# Element auf dieser Seite blockiert} other {# Elemente auf dieser Seite blockiert}}",
    "title": "Blockieren",
    "page": "Diese Seite",
    "today": "Heute",
    "enabled": "Werbung und Tracker blockieren",
    "settings": "Blockier-Einstellungen"
  },
  "tor": {
    "chipDirect": "Direkt",
    "chipTor": "Tor · {country}",
    "chipLabel": "Netzwerk: {status}. Tor-Optionen öffnen",
    "auto": "Auto",
    "withoutTor": "Ohne Tor",
    "stateOff": "Tor ist aus",
    "stateBootstrapping": "Verbinde mit Tor… {percent} %",
    "stateReady": "Mit Tor verbunden",
    "stateFailed": "Tor nicht verfügbar: Es geht nichts direkt hinaus",
    "popupTitle": "Tor-Optionen",
    "routeYou": "Du",
    "routeGuard": "Wächter",
    "routeMiddle": "Mitte",
    "routeExit": "Ausgang · {country}",
    "prev": "Vorheriges Land",
    "next": "Nächstes Land",
    "autoCountry": "Automatisch",
    "fly": "Über {country} hinaus",
    "flyAuto": "Über ein beliebiges Land hinaus",
    "flying": "Ausgang wird gewechselt…",
    "current": "Aktueller Ausgang",
    "newCircuit": "Neuer Kanal",
    "circuit": "Kanal Nr. {n}",
    "withoutTorAction": "Diesen Tab ohne Tor öffnen",
    "more": "Weitere Optionen",
    "enable": "Tor einschalten",
    "directNote": "Direkte Verbindung: Medien sehen deine echte IP. Das Blockieren bleibt aktiv.",
    "reducesAnonymity": "Ein festes Land verringert die Anonymität"
  },
  "withoutTor": {
    "title": "Diesen Tab ohne Tor öffnen?",
    "body": "Die Seite sieht deine echte IP-Adresse, und dein Internetanbieter erfährt, welches Medium du besuchst. Betrifft nur diesen Tab.",
    "confirm": "Ohne Tor öffnen"
  },
  "settings": {
    "title": "Datenschutz und Netzwerk",
    "connection": "Verbindung",
    "restartNote": "Ein Wechsel von Modus oder Land startet die Web-Engine neu (etwa 2 s). Tabs werden neu geladen.",
    "modeDirect": "Direkt",
    "modeDirectDesc": "Ohne Zwischenstation. Schnell, aber Medien sehen deine IP.",
    "modeTor": "Tor",
    "modeTorDesc": "Dein Verkehr verlässt das Tor-Netz in dem Land, das du wählst.",
    "modeWireguard": "WireGuard",
    "modeWireguardDesc": "Ein .conf-Profil deines Anbieters importieren. Kommt in einer späteren Phase.",
    "exitCountry": "Ausgangsland",
    "routing": "Was über Tor läuft",
    "feedsViaTor": "RSS-Feeds über Tor laden",
    "aiViaTor": "KI-Anfragen über Tor senden",
    "aiViaTorHint": "Langsamer. Lokale Modelle laufen nie über Tor."
  },
  "blocking": {
    "title": "Blockieren",
    "enabled": "Werbung, Tracker, Cookie-Banner und Newsletter-Fenster blockieren",
    "lists": "Filterlisten",
    "sourceDownloaded": "Aktualisiert {date}",
    "sourceEmbedded": "Mit der App ausgelieferte Kopie",
    "refresh": "Jetzt aktualisieren",
    "refreshed": "{count, plural, =0 {Keine Liste geändert} one {# Liste aktualisiert} other {# Listen aktualisiert}}",
    "refreshFailed": "{count, plural, one {# Liste konnte nicht geladen werden} other {# Listen konnten nicht geladen werden}}",
    "engine": "Engine: adblock-rust · letzte Aktualisierung: {when}",
    "never": "nie",
    "categoryAds": "Werbung",
    "categoryPrivacy": "Tracker",
    "categoryCookies": "Cookie-Banner",
    "categoryNewsletters": "Newsletter-Fenster"
  }
}
```

- [ ] **Step 2: Tipos, comandos y eventos**

Añade al final de `apps/ui/src/ipc/types.ts`:
```ts
export type NetMode = 'direct' | 'tor';
export type TorState =
  | { state: 'off' }
  | { state: 'bootstrapping'; percent: number }
  | { state: 'ready' }
  | { state: 'failed'; message: string };
export interface PrivacyStatus {
  mode: NetMode;
  tor: TorState;
  socksPort: number;
  exitCountry: string | null;
  circuit: number;
  aiViaTor: boolean;
  feedsViaTor: boolean;
  killSwitchActive: boolean;
  tabsWithoutTor: number[];
}
export type ListCategory = 'ads' | 'privacy' | 'cookies' | 'newsletters';
export interface FilterListStatus { id: string; name: string; category: ListCategory; enabled: boolean; source: 'downloaded' | 'embedded'; fetchedAt: number | null }
export interface AdblockStatus { enabled: boolean; lists: FilterListStatus[]; lastRefresh: number | null }
export interface RefreshReport { updated: string[]; failed: [string, string][]; skipped: boolean }
export interface BlockedCounts { tab: number; today: number }
```

Añade al objeto `commands` de `apps/ui/src/ipc/commands.ts` (y los tipos al `import type`):
```ts
  privacyStatus: () => invoke<PrivacyStatus>('privacy_status'),
  netSetMode: (mode: NetMode) => invoke<PrivacyStatus>('net_set_mode', { mode }),
  torSetExitCountry: (country: string | null) => invoke<PrivacyStatus>('tor_set_exit_country', { country }),
  torNewCircuit: (tabId?: TabId) => invoke<PrivacyStatus>('tor_new_circuit', { tabId }),
  privacySetRouting: (r: { aiViaTor?: boolean; feedsViaTor?: boolean }) => invoke<PrivacyStatus>('privacy_set_routing', r),
  tabWithoutTor: (tabId: TabId) => invoke<PrivacyStatus>('tab_without_tor', { tabId }),
  adblockStatus: () => invoke<AdblockStatus>('adblock_status'),
  adblockSetEnabled: (enabled: boolean) => invoke<AdblockStatus>('adblock_set_enabled', { enabled }),
  adblockSetList: (id: string, enabled: boolean) => invoke<AdblockStatus>('adblock_set_list', { id, enabled }),
  adblockRefresh: () => invoke<RefreshReport>('adblock_refresh'),
  blockedCounts: (tabId?: TabId) => invoke<BlockedCounts>('blocked_counts', { tabId }),
```

Añade a `apps/ui/src/ipc/events.ts`:
```ts
import type { PrivacyStatus } from './types';

export const onNetStatus = (cb: (s: PrivacyStatus) => void) => listen<PrivacyStatus>('net://status', (e) => cb(e.payload));
export const onAdblockBlocked = (cb: (e: { tabId: number; tabCount: number }) => void) =>
  listen<{ tabId: number; tabCount: number }>('adblock://blocked', (e) => cb(e.payload));
export const onAdblockCounts = (cb: (e: { tabs: Record<string, number>; today: number }) => void) =>
  listen<{ tabs: Record<string, number>; today: number }>('adblock://counts', (e) => cb(e.payload));
```

- [ ] **Step 3: Escribir el test que falla**

`apps/ui/src/features/privacy/usePrivacy.test.ts`:
```ts
import { mockIPC } from '@tauri-apps/api/mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import { countryName, EXIT_COUNTRIES } from './countries';
import { applyBlocked, applyCounts, privacyStore, resetPrivacyStore, startPrivacySync } from './usePrivacy';
import { cancelOpenWithoutTor, requestOpenWithoutTor, withoutTorStore } from './withoutTor';

const STATUS = {
  mode: 'tor', tor: { state: 'ready' }, socksPort: 50123, exitCountry: null, circuit: 1,
  aiViaTor: false, feedsViaTor: true, killSwitchActive: false, tabsWithoutTor: [],
};

describe('privacy store', () => {
  beforeEach(() => resetPrivacyStore());

  it('loads status and today counter on start', async () => {
    mockIPC((cmd) => (cmd === 'privacy_status' ? STATUS : cmd === 'blocked_counts' ? { tab: 0, today: 1832 } : null));
    const stop = await startPrivacySync();
    expect(privacyStore.get().status?.mode).toBe('tor');
    expect(privacyStore.get().today).toBe(1832);
    stop();
  });

  it('keeps the highest count per tab from live and periodic events', () => {
    applyBlocked({ tabId: 3, tabCount: 5 });
    applyCounts({ tabs: { '3': 4, '4': 2 }, today: 99 });
    expect(privacyStore.get().tabs).toEqual({ 3: 5, 4: 2 });
    expect(privacyStore.get().today).toBe(99);
    applyBlocked({ tabId: 3, tabCount: 6 });
    expect(privacyStore.get().tabs[3]).toBe(6);
  });
});

describe('countries', () => {
  it('has unique ISO codes with coordinates and localized names', () => {
    const codes = EXIT_COUNTRIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain('DE');
    expect(countryName('DE', 'es')).toBe('Alemania');
    expect(countryName('DE', 'de')).toBe('Deutschland');
  });
});

describe('open without Tor requests', () => {
  it('stores and clears the pending tab', () => {
    requestOpenWithoutTor(7);
    expect(withoutTorStore.get().pendingTabId).toBe(7);
    cancelOpenWithoutTor();
    expect(withoutTorStore.get().pendingTabId).toBeNull();
  });
});
```

- [ ] **Step 4: Ejecutar y ver que falla**

Run: `pnpm --filter @newpaper/ui exec vitest run src/features/privacy/usePrivacy.test.ts`
Expected: FAIL — `Failed to resolve import "./countries"`.

- [ ] **Step 5: Implementación**

`apps/ui/src/features/privacy/countries.ts`:
```ts
/** Países de salida frecuentes en Tor (orden de la pizarra) con coordenadas aproximadas de la capital. */
export const EXIT_COUNTRIES: { code: string; lat: number; lon: number }[] = [
  { code: 'DE', lat: 52.5, lon: 13.4 },
  { code: 'NL', lat: 52.4, lon: 4.9 },
  { code: 'FR', lat: 48.9, lon: 2.4 },
  { code: 'SE', lat: 59.3, lon: 18.1 },
  { code: 'CH', lat: 46.9, lon: 7.4 },
  { code: 'FI', lat: 60.2, lon: 24.9 },
  { code: 'NO', lat: 59.9, lon: 10.8 },
  { code: 'AT', lat: 48.2, lon: 16.4 },
  { code: 'LU', lat: 49.6, lon: 6.1 },
  { code: 'IS', lat: 64.1, lon: -21.9 },
  { code: 'RO', lat: 44.4, lon: 26.1 },
  { code: 'PL', lat: 52.2, lon: 21.0 },
  { code: 'CZ', lat: 50.1, lon: 14.4 },
  { code: 'ES', lat: 40.4, lon: -3.7 },
  { code: 'GB', lat: 51.5, lon: -0.1 },
  { code: 'US', lat: 38.9, lon: -77.0 },
  { code: 'CA', lat: 45.4, lon: -75.7 },
];

const cache = new Map<string, Intl.DisplayNames>();

export function countryName(code: string, locale: string): string {
  let dn = cache.get(locale);
  if (!dn) {
    dn = new Intl.DisplayNames([locale], { type: 'region' });
    cache.set(locale, dn);
  }
  return dn.of(code) ?? code;
}
```

`apps/ui/src/features/privacy/usePrivacy.ts`:
```ts
import { commands } from '../../ipc/commands';
import { onAdblockBlocked, onAdblockCounts, onNetStatus } from '../../ipc/events';
import type { PrivacyStatus } from '../../ipc/types';
import { createStore } from '../../state/store';

interface PrivacyState {
  status: PrivacyStatus | null;
  tabs: Record<number, number>;
  today: number;
}

const EMPTY: PrivacyState = { status: null, tabs: {}, today: 0 };
export const privacyStore = createStore<PrivacyState>(EMPTY);
export const resetPrivacyStore = () => privacyStore.set(() => EMPTY);

export function applyBlocked(e: { tabId: number; tabCount: number }): void {
  privacyStore.set((p) => ({ ...p, tabs: { ...p.tabs, [e.tabId]: Math.max(p.tabs[e.tabId] ?? 0, e.tabCount) } }));
}

export function applyCounts(e: { tabs: Record<string, number>; today: number }): void {
  privacyStore.set((p) => {
    const tabs: Record<number, number> = {};
    for (const [k, v] of Object.entries(e.tabs)) tabs[Number(k)] = Math.max(p.tabs[Number(k)] ?? 0, v);
    return { ...p, tabs, today: e.today };
  });
}

export const applyStatus = (status: PrivacyStatus) => privacyStore.set({ status });

export async function startPrivacySync(): Promise<() => void> {
  const offs = await Promise.all([onNetStatus(applyStatus), onAdblockBlocked(applyBlocked), onAdblockCounts(applyCounts)]);
  applyStatus(await commands.privacyStatus());
  const counts = await commands.blockedCounts();
  privacyStore.set({ today: counts.today });
  return () => offs.forEach((f) => f());
}

export const usePrivacyStatus = () => privacyStore.use((s) => s.status);
export const useBlockedCount = (tabId: number | null) => privacyStore.use((s) => (tabId === null ? 0 : s.tabs[tabId] ?? 0));
export const useTodayBlocked = () => privacyStore.use((s) => s.today);
```

`apps/ui/src/features/privacy/withoutTor.ts`:
```ts
import { createStore } from '../../state/store';

/** Cualquier parte de la UI (popup de Tor, página "Tor bloqueado" del subproyecto 6) pide el aviso aquí. */
export const withoutTorStore = createStore<{ pendingTabId: number | null }>({ pendingTabId: null });
export const requestOpenWithoutTor = (tabId: number) => withoutTorStore.set({ pendingTabId: tabId });
export const cancelOpenWithoutTor = () => withoutTorStore.set({ pendingTabId: null });
```

- [ ] **Step 6: Ejecutar y ver que pasa**

Run: `pnpm --filter @newpaper/ui exec vitest run src/features/privacy/usePrivacy.test.ts; pnpm --filter @newpaper/i18n test`
Expected: PASS (4 tests) y catálogos coherentes.

- [ ] **Step 7: Commit**

```powershell
git add apps/ui/src/ipc apps/ui/src/features/privacy packages/i18n/locales
git commit -m "feat(ui): privacy IPC, live status and blocked counters store"
```

---

### Task 17: UI — escudo con contador

**Files:**
- Create: `apps/ui/src/features/privacy/ShieldBadge.tsx`, `apps/ui/src/features/privacy/privacy.css`
- Test: `apps/ui/src/features/privacy/ShieldBadge.test.tsx`

**Interfaces:**
- Consumes: `useBlockedCount`, `useTodayBlocked` (T16), `IconButton`, `Switch` (ui-kit), `openInternal` (subproyecto 1).
- Produces: `ShieldBadge({ tab }: { tab: TabInfo | null })` (se registra en la barra en la Tarea 21).

- [ ] **Step 1: Escribir el test que falla**

`apps/ui/src/features/privacy/ShieldBadge.test.tsx`:
```tsx
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockIPC } from '@tauri-apps/api/mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TabInfo } from '../../ipc/types';
import { renderWithI18n } from '../../test/renderWithI18n';
import { ShieldBadge } from './ShieldBadge';
import { applyBlocked, applyCounts, resetPrivacyStore } from './usePrivacy';

const tab = { id: 3, url: 'https://a.example/', title: 'A', kind: 'web' } as TabInfo;

describe('ShieldBadge', () => {
  beforeEach(() => resetPrivacyStore());

  it('shows the per-tab count and opens a popover with today total', async () => {
    const calls: [string, unknown][] = [];
    mockIPC((cmd, args) => {
      calls.push([cmd, args]);
      return cmd === 'adblock_status' ? { enabled: true, lists: [], lastRefresh: null } : null;
    });
    act(() => {
      applyBlocked({ tabId: 3, tabCount: 47 });
      applyCounts({ tabs: { '3': 47 }, today: 1832 });
    });
    renderWithI18n(<ShieldBadge tab={tab} />);
    const button = screen.getByRole('button', { name: '47 elementos bloqueados en esta página' });
    expect(button).toHaveTextContent('47');
    await userEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('1832')).toBeInTheDocument();
    await userEvent.click(await screen.findByRole('switch', { name: 'Bloquear anuncios y rastreadores' }));
    expect(calls).toContainEqual(['adblock_set_enabled', { enabled: false }]);
    await userEvent.keyboard('{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm --filter @newpaper/ui exec vitest run src/features/privacy/ShieldBadge.test.tsx`
Expected: FAIL — `Failed to resolve import "./ShieldBadge"`.

- [ ] **Step 3: Implementación**

`apps/ui/src/features/privacy/ShieldBadge.tsx`:
```tsx
import { useI18n } from '@newpaper/i18n/react';
import { Button, Switch } from '@newpaper/ui-kit';
import { useEffect, useId, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { TabInfo } from '../../ipc/types';
import { openInternal } from '../../shell/navigate';
import { useBlockedCount, useTodayBlocked } from './usePrivacy';

const ShieldIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
  </svg>
);

export function ShieldBadge({ tab }: { tab: TabInfo | null }) {
  const { t, formatNumber } = useI18n();
  const count = useBlockedCount(tab?.id ?? null);
  const today = useTodayBlocked();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    void commands.adblockStatus().then((s) => setEnabled(s.enabled));
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="np-shield">
      <button
        type="button"
        className="np-shield-btn"
        aria-label={t('privacy.shield.label', { count })}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <ShieldIcon />
        <span className="np-shield-count np-mono" aria-hidden="true">{formatNumber(count, { useGrouping: false })}</span>
      </button>
      {open ? (
        <div id={panelId} role="dialog" aria-label={t('privacy.shield.title')} className="np-popover np-pop">
          <dl className="np-shield-stats">
            <div><dt>{t('privacy.shield.page')}</dt><dd className="np-mono">{formatNumber(count, { useGrouping: false })}</dd></div>
            <div><dt>{t('privacy.shield.today')}</dt><dd className="np-mono">{formatNumber(today, { useGrouping: false })}</dd></div>
          </dl>
          <Switch
            label={t('privacy.shield.enabled')}
            checked={enabled}
            onChange={(v) => {
              setEnabled(v);
              void commands.adblockSetEnabled(v);
            }}
          />
          <Button variant="quiet" onClick={() => { setOpen(false); void openInternal('ajustes', ['bloqueo']); }}>
            {t('privacy.shield.settings')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
```

`apps/ui/src/features/privacy/privacy.css`:
```css
.np-shield, .np-torchip-wrap { position: relative; }
.np-shield-btn { display: inline-flex; align-items: center; gap: 6px; min-height: var(--np-hit); padding: 0 10px; border: 0; border-radius: 10px; background: transparent; color: var(--np-ink2); }
.np-shield-btn:hover { background: var(--np-soft); }
.np-shield-count { font-size: 12px; color: var(--np-muted); }
.np-popover { position: absolute; right: 0; top: calc(100% + 8px); z-index: 20; width: 300px; padding: 16px; display: grid; gap: 12px; background: var(--np-card); border: 1px solid var(--np-line); border-radius: var(--np-radius-lg); box-shadow: var(--np-shadow-pop); }
.np-shield-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 0; }
.np-shield-stats dt { font-size: 11.5px; color: var(--np-muted); }
.np-shield-stats dd { margin: 0; font-size: 22px; }
.np-torchip { display: inline-flex; align-items: center; gap: 6px; min-height: 36px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--np-line3); background: var(--np-card); color: var(--np-ink2); font: 500 12.5px/1 var(--np-font-ui); }
.np-torchip[data-mode='tor'] { border-color: var(--np-tor); color: var(--np-tor); background: var(--np-tor-soft); }
.np-torchip[data-failed='true'] { border-color: var(--np-bad); color: var(--np-bad); background: var(--np-bad-bg); }
.np-torchip[data-without='true'] { border-color: var(--np-warn); color: var(--np-warn); background: var(--np-warn-bg); }
.np-tor-dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
.np-tor-popup { width: 340px; }
.np-tor-route { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font: 400 12px/1.4 var(--np-font-mono); color: var(--np-muted); }
.np-tor-picker { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 8px; }
.np-tor-candidate { text-align: center; }
.np-tor-candidate-code { display: block; font: 600 26px/1 var(--np-font-mono); color: var(--np-tor); }
.np-tor-fly { position: relative; overflow: hidden; }
.np-plane { display: inline-block; }
.np-tor-fly[data-flying='true'] .np-plane { animation: np-plane 0.9s var(--np-ease) both; }
@keyframes np-plane { 0% { transform: translateX(0) rotate(0); } 60% { transform: translateX(120px) translateY(-6px) rotate(-8deg); opacity: 1; } 100% { transform: translateX(160px) translateY(-10px); opacity: 0; } }
.np-tor-note { margin: 0; font-size: 12px; color: var(--np-muted); }
.np-dialog-scrim { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; background: var(--np-scrim); }
.np-dialog { width: min(460px, calc(100vw - 32px)); padding: 24px; display: grid; gap: 14px; background: var(--np-card); border-radius: var(--np-radius-lg); box-shadow: var(--np-shadow-modal); }
.np-dialog h2 { margin: 0; font: 600 22px/1.25 var(--np-font-read); }
.np-dialog-actions { display: flex; justify-content: flex-end; gap: 10px; }
.np-modes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.np-mode { display: grid; gap: 6px; text-align: left; min-height: 96px; padding: 14px; border-radius: var(--np-radius); border: 1px solid var(--np-line3); background: var(--np-card); color: var(--np-ink); }
.np-mode[aria-checked='true'] { border-color: var(--np-tor); box-shadow: inset 0 0 0 1px var(--np-tor); }
.np-mode:disabled { color: var(--np-disabled); }
.np-mode-desc { font-size: 12px; color: var(--np-muted); }
.np-countries { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; }
.np-country { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--np-line); background: var(--np-card); color: var(--np-ink); }
.np-country[aria-checked='true'] { border-color: var(--np-tor); color: var(--np-tor); }
.np-dotmap { width: 100%; max-width: 520px; height: auto; }
.np-dotmap-dot { fill: var(--np-line3); }
.np-dotmap-dot[data-active='true'] { fill: var(--np-tor); }
.np-list-row { display: grid; grid-template-columns: 1fr auto; gap: 4px 16px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--np-line2); }
.np-list-meta { font-size: 12px; color: var(--np-muted); }
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm --filter @newpaper/ui exec vitest run src/features/privacy/ShieldBadge.test.tsx`
Expected: PASS — 1 test.

- [ ] **Step 5: Commit**

```powershell
git add apps/ui/src/features/privacy
git commit -m "feat(ui): shield badge with per-tab and daily blocked counters"
```

---

### Task 18: UI — chip y popup compacto de Tor (flechas y avión)

**Files:**
- Create: `apps/ui/src/features/privacy/TorChip.tsx`, `apps/ui/src/features/privacy/TorPopup.tsx`
- Test: `apps/ui/src/features/privacy/TorPopup.test.tsx`

**Interfaces:**
- Consumes: `usePrivacyStatus` (T16), `EXIT_COUNTRIES`, `countryName` (T16), `requestOpenWithoutTor` (T16), `useReducedMotion`, `openInternal`.
- Produces: `TorChip({ tab })` (abre el popup), `TorPopup({ tabId, onClose })`, `torStateLabel(t, status): string`.

Comportamiento: el chip dice "Directo" o "Tor · DE"/"Tor · Auto"; con Tor caído se pinta en rojo y su etiqueta lo dice; si la pestaña activa está "sin Tor", muestra "Sin Tor" en ámbar. El popup recorre los candidatos con ◀ ▶ (botones o flechas del teclado, empezando en el país actual), y el botón "Salir por <país>" aplica el cambio con un avión que cruza el botón (sin animación con `prefers-reduced-motion`).

- [ ] **Step 1: Escribir el test que falla**

`apps/ui/src/features/privacy/TorPopup.test.tsx`:
```tsx
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockIPC } from '@tauri-apps/api/mocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrivacyStatus, TabInfo } from '../../ipc/types';
import { renderWithI18n } from '../../test/renderWithI18n';
import { TorChip } from './TorChip';
import { TorPopup } from './TorPopup';
import { applyStatus, resetPrivacyStore } from './usePrivacy';
import { withoutTorStore } from './withoutTor';

const status = (p: Partial<PrivacyStatus> = {}): PrivacyStatus => ({
  mode: 'tor', tor: { state: 'ready' }, socksPort: 1, exitCountry: null, circuit: 4,
  aiViaTor: false, feedsViaTor: true, killSwitchActive: false, tabsWithoutTor: [], ...p,
});

describe('TorChip', () => {
  beforeEach(() => resetPrivacyStore());

  it('reflects mode, exit country, failure and per-tab override', () => {
    const tab = { id: 2 } as TabInfo;
    act(() => applyStatus(status({ mode: 'direct', tor: { state: 'off' } })));
    const { rerender } = renderWithI18n(<TorChip tab={tab} />);
    expect(screen.getByRole('button', { name: /Directo/ })).toBeInTheDocument();
    act(() => applyStatus(status({ exitCountry: 'DE' })));
    rerender(<TorChip tab={tab} />);
    expect(screen.getByRole('button', { name: /Conectado a Tor/ })).toHaveTextContent('Tor · DE');
    act(() => applyStatus(status({ tor: { state: 'failed', message: 'x' }, killSwitchActive: true })));
    rerender(<TorChip tab={tab} />);
    expect(screen.getByRole('button')).toHaveAttribute('data-failed', 'true');
    act(() => applyStatus(status({ tabsWithoutTor: [2] })));
    rerender(<TorChip tab={tab} />);
    expect(screen.getByRole('button')).toHaveTextContent('Sin Tor');
  });
});

describe('TorPopup', () => {
  beforeEach(() => resetPrivacyStore());

  it('cycles exit countries with arrows and flies to the chosen one', async () => {
    const calls: [string, unknown][] = [];
    mockIPC((cmd, args) => {
      calls.push([cmd, args]);
      return status({ exitCountry: 'NL' });
    });
    act(() => applyStatus(status()));
    renderWithI18n(<TorPopup tabId={2} onClose={vi.fn()} />);
    expect(screen.getByText('Automático')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'País siguiente' }));
    expect(screen.getByText('Alemania')).toBeInTheDocument();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByText('Países Bajos')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salir por Países Bajos' }));
    expect(calls).toContainEqual(['tor_set_exit_country', { country: 'NL' }]);
    await userEvent.click(screen.getByRole('button', { name: 'País anterior' }));
    await userEvent.click(screen.getByRole('button', { name: 'País anterior' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salir por cualquier país' }));
    expect(calls).toContainEqual(['tor_set_exit_country', { country: null }]);
  });

  it('offers a new circuit, the without-Tor warning and more options', async () => {
    const calls: [string, unknown][] = [];
    mockIPC((cmd, args) => {
      calls.push([cmd, args]);
      return status({ circuit: 5 });
    });
    act(() => applyStatus(status()));
    renderWithI18n(<TorPopup tabId={2} onClose={vi.fn()} />);
    expect(screen.getByText('Circuito n.º 4')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo circuito' }));
    expect(calls).toContainEqual(['tor_new_circuit', { tabId: 2 }]);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir esta pestaña sin Tor' }));
    expect(withoutTorStore.get().pendingTabId).toBe(2);
  });

  it('offers to turn Tor on in direct mode', async () => {
    const calls: string[] = [];
    mockIPC((cmd) => {
      calls.push(cmd);
      return status();
    });
    act(() => applyStatus(status({ mode: 'direct', tor: { state: 'off' } })));
    renderWithI18n(<TorPopup tabId={2} onClose={vi.fn()} />);
    expect(screen.getByText('Conexión directa: los medios ven tu IP real. El bloqueo sigue activo.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Activar Tor' }));
    expect(calls).toContain('net_set_mode');
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm --filter @newpaper/ui exec vitest run src/features/privacy/TorPopup.test.tsx`
Expected: FAIL — `Failed to resolve import "./TorChip"`.

- [ ] **Step 3: Implementación**

`apps/ui/src/features/privacy/TorPopup.tsx`:
```tsx
import { useI18n } from '@newpaper/i18n/react';
import type { Translator } from '@newpaper/i18n';
import { Button, IconButton, useReducedMotion } from '@newpaper/ui-kit';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { commands } from '../../ipc/commands';
import type { PrivacyStatus } from '../../ipc/types';
import { openInternal } from '../../shell/navigate';
import { countryName, EXIT_COUNTRIES } from './countries';
import { applyStatus, usePrivacyStatus } from './usePrivacy';
import { requestOpenWithoutTor } from './withoutTor';

export function torStateLabel(t: Translator['t'], s: PrivacyStatus): string {
  if (s.mode === 'direct') return t('privacy.tor.chipDirect');
  switch (s.tor.state) {
    case 'ready': return t('privacy.tor.stateReady');
    case 'bootstrapping': return t('privacy.tor.stateBootstrapping', { percent: s.tor.percent });
    case 'failed': return t('privacy.tor.stateFailed');
    default: return t('privacy.tor.stateOff');
  }
}

const OPTIONS = ['auto', ...EXIT_COUNTRIES.map((c) => c.code)];
const Arrow = ({ dir }: { dir: 'l' | 'r' }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d={dir === 'l' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
  </svg>
);
const Plane = () => (
  <svg className="np-plane" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
  </svg>
);

export function TorPopup({ tabId, onClose }: { tabId: number | null; onClose(): void }) {
  const { t, locale } = useI18n();
  const status = usePrivacyStatus();
  const reduced = useReducedMotion();
  const current = status?.exitCountry ?? 'auto';
  const [index, setIndex] = useState(() => Math.max(0, OPTIONS.indexOf(current)));
  const [flying, setFlying] = useState(false);

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!status) return null;
  const name = (code: string) => (code === 'auto' ? t('privacy.tor.autoCountry') : countryName(code, locale));
  const candidate = OPTIONS[index]!;
  const move = (d: number) => setIndex((i) => (i + d + OPTIONS.length) % OPTIONS.length);
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); move(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); }
  };
  const fly = async () => {
    setFlying(true);
    try {
      applyStatus(await commands.torSetExitCountry(candidate === 'auto' ? null : candidate));
    } finally {
      setTimeout(() => setFlying(false), reduced ? 0 : 900);
    }
  };

  return (
    <div role="dialog" aria-label={t('privacy.tor.popupTitle')} className="np-popover np-tor-popup np-pop">
      <p className="np-kicker" aria-live="polite">{torStateLabel(t, status)}</p>
      {status.mode === 'direct' ? (
        <>
          <p className="np-tor-note">{t('privacy.tor.directNote')}</p>
          <Button variant="primary" onClick={async () => applyStatus(await commands.netSetMode('tor'))}>{t('privacy.tor.enable')}</Button>
        </>
      ) : (
        <>
          <div className="np-tor-route">
            <span>{t('privacy.tor.routeYou')}</span><span aria-hidden="true">→</span>
            <span>{t('privacy.tor.routeGuard')}</span><span aria-hidden="true">→</span>
            <span>{t('privacy.tor.routeMiddle')}</span><span aria-hidden="true">→</span>
            <span>{t('privacy.tor.routeExit', { country: current === 'auto' ? t('privacy.tor.auto') : current })}</span>
          </div>
          <div className="np-tor-picker" onKeyDown={onKey}>
            <IconButton label={t('privacy.tor.prev')} icon={<Arrow dir="l" />} onClick={() => move(-1)} />
            <div className="np-tor-candidate" aria-live="polite">
              <span className="np-tor-candidate-code">{candidate === 'auto' ? t('privacy.tor.auto') : candidate}</span>
              <span>{name(candidate)}</span>
              {candidate === current ? <span className="np-tor-note">{t('privacy.tor.current')}</span> : null}
            </div>
            <IconButton label={t('privacy.tor.next')} icon={<Arrow dir="r" />} onClick={() => move(1)} />
          </div>
          {candidate !== 'auto' ? <p className="np-tor-note">{t('privacy.tor.reducesAnonymity')}</p> : null}
          <Button variant="primary" className="np-tor-fly" data-flying={flying} disabled={flying || candidate === current} onClick={fly}>
            <Plane />{' '}
            {flying ? t('privacy.tor.flying') : candidate === 'auto' ? t('privacy.tor.flyAuto') : t('privacy.tor.fly', { country: name(candidate) })}
          </Button>
          <div className="np-tor-route">
            <span>{t('privacy.tor.circuit', { n: status.circuit })}</span>
            <Button variant="quiet" onClick={async () => applyStatus(await commands.torNewCircuit(tabId ?? undefined))}>{t('privacy.tor.newCircuit')}</Button>
          </div>
          {tabId !== null ? (
            <Button variant="quiet" onClick={() => { requestOpenWithoutTor(tabId); onClose(); }}>{t('privacy.tor.withoutTorAction')}</Button>
          ) : null}
        </>
      )}
      <Button variant="quiet" onClick={() => { onClose(); void openInternal('ajustes', ['red']); }}>{t('privacy.tor.more')}</Button>
    </div>
  );
}
```

`apps/ui/src/features/privacy/TorChip.tsx`:
```tsx
import { useT } from '@newpaper/i18n/react';
import { useCallback, useState } from 'react';
import type { TabInfo } from '../../ipc/types';
import { TorPopup, torStateLabel } from './TorPopup';
import { usePrivacyStatus } from './usePrivacy';

export function TorChip({ tab }: { tab: TabInfo | null }) {
  const t = useT();
  const status = usePrivacyStatus();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (!status) return null;
  const without = tab !== null && status.tabsWithoutTor.includes(tab.id);
  const label =
    status.mode === 'direct'
      ? t('privacy.tor.chipDirect')
      : without
        ? t('privacy.tor.withoutTor')
        : t('privacy.tor.chipTor', { country: status.exitCountry ?? t('privacy.tor.auto') });
  return (
    <div className="np-torchip-wrap">
      <button
        type="button"
        className="np-torchip"
        data-mode={status.mode}
        data-failed={status.mode === 'tor' && status.tor.state === 'failed'}
        data-without={without}
        aria-expanded={open}
        aria-label={t('privacy.tor.chipLabel', { status: `${label} · ${torStateLabel(t, status)}` })}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={status.tor.state === 'bootstrapping' ? 'np-tor-dot np-pulse' : 'np-tor-dot'} aria-hidden="true" />
        {label}
      </button>
      {open ? <TorPopup tabId={tab?.id ?? null} onClose={close} /> : null}
    </div>
  );
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm --filter @newpaper/ui exec vitest run src/features/privacy/TorPopup.test.tsx`
Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```powershell
git add apps/ui/src/features/privacy
git commit -m "feat(ui): tor chip and compact popup with arrow country picker and plane animation"
```

---

### Task 19: UI — aviso "abrir sin Tor"

**Files:**
- Create: `apps/ui/src/features/privacy/OpenWithoutTorDialog.tsx`
- Modify: `packages/ui-kit/src/components/Button.tsx` (reenviar `ref`)
- Test: `apps/ui/src/features/privacy/OpenWithoutTorDialog.test.tsx`

**Interfaces:**
- Consumes: `withoutTorStore`, `cancelOpenWithoutTor` (T16), `commands.tabWithoutTor`.
- Produces: `OpenWithoutTorDialog()` (capa global; se registra con `registerOverlay` en la Tarea 21). Acción explícita, por pestaña, con aviso (spec §4.2).

- [ ] **Step 1: Escribir el test que falla**

`apps/ui/src/features/privacy/OpenWithoutTorDialog.test.tsx`:
```tsx
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockIPC } from '@tauri-apps/api/mocks';
import { describe, expect, it } from 'vitest';
import { renderWithI18n } from '../../test/renderWithI18n';
import { OpenWithoutTorDialog } from './OpenWithoutTorDialog';
import { requestOpenWithoutTor, withoutTorStore } from './withoutTor';

describe('OpenWithoutTorDialog', () => {
  it('is hidden until requested, then confirms explicitly for that tab only', async () => {
    const calls: [string, unknown][] = [];
    mockIPC((cmd, args) => {
      calls.push([cmd, args]);
      return { mode: 'tor', tor: { state: 'ready' }, socksPort: 1, exitCountry: null, circuit: 1, aiViaTor: false, feedsViaTor: true, killSwitchActive: false, tabsWithoutTor: [5] };
    });
    renderWithI18n(<OpenWithoutTorDialog />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    act(() => requestOpenWithoutTor(5));
    const dialog = screen.getByRole('alertdialog', { name: '¿Abrir esta pestaña sin Tor?' });
    expect(dialog).toHaveTextContent('Solo afecta a esta pestaña.');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveFocus();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir sin Tor' }));
    expect(calls).toContainEqual(['tab_without_tor', { tabId: 5 }]);
    expect(withoutTorStore.get().pendingTabId).toBeNull();
  });

  it('cancels with Escape without calling Rust', async () => {
    const calls: string[] = [];
    mockIPC((cmd) => {
      calls.push(cmd);
      return null;
    });
    renderWithI18n(<OpenWithoutTorDialog />);
    act(() => requestOpenWithoutTor(9));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(calls).not.toContain('tab_without_tor');
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm --filter @newpaper/ui exec vitest run src/features/privacy/OpenWithoutTorDialog.test.tsx`
Expected: FAIL — `Failed to resolve import "./OpenWithoutTorDialog"`.

- [ ] **Step 3: Implementación**

`apps/ui/src/features/privacy/OpenWithoutTorDialog.tsx`:
```tsx
import { useT } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { useEffect, useId, useRef } from 'react';
import { commands } from '../../ipc/commands';
import { applyStatus } from './usePrivacy';
import { cancelOpenWithoutTor, withoutTorStore } from './withoutTor';

export function OpenWithoutTorDialog() {
  const t = useT();
  const tabId = withoutTorStore.use((s) => s.pendingTabId);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const bodyId = useId();

  useEffect(() => {
    if (tabId === null) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancelOpenWithoutTor();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tabId]);

  if (tabId === null) return null;
  return (
    <div className="np-dialog-scrim">
      <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId} className="np-dialog np-pop">
        <h2 id={titleId}>{t('privacy.withoutTor.title')}</h2>
        <p id={bodyId}>{t('privacy.withoutTor.body')}</p>
        <div className="np-dialog-actions">
          <Button ref={cancelRef} onClick={cancelOpenWithoutTor}>{t('common.cancel')}</Button>
          <Button
            variant="danger"
            onClick={async () => {
              cancelOpenWithoutTor();
              applyStatus(await commands.tabWithoutTor(tabId));
            }}
          >
            {t('privacy.withoutTor.confirm')}
          </Button>
        </div>
      </div>
    </div>
  );
}
```

`packages/ui-kit/src/components/Button.tsx` debe reenviar `ref` (React 19 lo admite como prop normal):
> ```tsx
> import type { ButtonHTMLAttributes, Ref } from 'react';
> export function Button({ variant = 'secondary', className, type = 'button', ref, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; ref?: Ref<HTMLButtonElement> }) {
>   return <button ref={ref} type={type} className={['np-btn', `np-btn--${variant}`, className].filter(Boolean).join(' ')} {...rest} />;
> }
> ```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm --filter @newpaper/ui exec vitest run src/features/privacy/OpenWithoutTorDialog.test.tsx; pnpm --filter @newpaper/ui-kit test`
Expected: PASS — 2 tests; ui-kit sigue en verde.

- [ ] **Step 5: Commit**

```powershell
git add apps/ui/src/features/privacy packages/ui-kit/src/components/Button.tsx
git commit -m "feat(ui): explicit per-tab open-without-tor warning dialog"
```

---

### Task 20: UI — Ajustes › Privacidad y red

**Files:**
- Create: `apps/ui/src/features/privacy/DotMap.tsx`, `apps/ui/src/features/privacy/PrivacySection.tsx`
- Test: `apps/ui/src/features/privacy/PrivacySection.test.tsx`

**Interfaces:**
- Consumes: `usePrivacyStatus`, `applyStatus`, `EXIT_COUNTRIES`, `countryName` (T16), `Switch`, `Button`.
- Produces: `DotMap({ active: string | null })` (decorativo, `aria-hidden`), `PrivacySection()` (sección `red` de Ajustes).

- [ ] **Step 1: Escribir el test que falla**

`apps/ui/src/features/privacy/PrivacySection.test.tsx`:
```tsx
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockIPC } from '@tauri-apps/api/mocks';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PrivacyStatus } from '../../ipc/types';
import { renderWithI18n } from '../../test/renderWithI18n';
import { PrivacySection } from './PrivacySection';
import { applyStatus, resetPrivacyStore } from './usePrivacy';

const base: PrivacyStatus = {
  mode: 'direct', tor: { state: 'off' }, socksPort: 1, exitCountry: null, circuit: 1,
  aiViaTor: false, feedsViaTor: true, killSwitchActive: false, tabsWithoutTor: [],
};

describe('PrivacySection', () => {
  beforeEach(() => resetPrivacyStore());

  it('switches mode, keeps WireGuard disabled and explains the restart', async () => {
    const calls: [string, unknown][] = [];
    mockIPC((cmd, args) => {
      calls.push([cmd, args]);
      return { ...base, mode: 'tor', tor: { state: 'ready' } };
    });
    act(() => applyStatus(base));
    renderWithI18n(<PrivacySection />);
    expect(screen.getByText(/reinicia el motor web/)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /WireGuard/ })).toBeDisabled();
    await userEvent.click(screen.getByRole('radio', { name: /^Tor/ }));
    expect(calls).toContainEqual(['net_set_mode', { mode: 'tor' }]);
    expect(await screen.findByRole('radiogroup', { name: 'País de salida' })).toBeInTheDocument();
  });

  it('picks an exit country and toggles routing', async () => {
    const calls: [string, unknown][] = [];
    mockIPC((cmd, args) => {
      calls.push([cmd, args]);
      return { ...base, mode: 'tor', tor: { state: 'ready' }, exitCountry: 'SE' };
    });
    act(() => applyStatus({ ...base, mode: 'tor', tor: { state: 'ready' } }));
    renderWithI18n(<PrivacySection />);
    await userEvent.click(screen.getByRole('radio', { name: 'Suecia' }));
    expect(calls).toContainEqual(['tor_set_exit_country', { country: 'SE' }]);
    await userEvent.click(screen.getByRole('switch', { name: 'Enviar las peticiones de IA por Tor' }));
    expect(calls).toContainEqual(['privacy_set_routing', { aiViaTor: true }]);
    await userEvent.click(screen.getByRole('switch', { name: 'Descargar las fuentes RSS por Tor' }));
    expect(calls).toContainEqual(['privacy_set_routing', { feedsViaTor: false }]);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm --filter @newpaper/ui exec vitest run src/features/privacy/PrivacySection.test.tsx`
Expected: FAIL — `Failed to resolve import "./PrivacySection"`.

- [ ] **Step 3: Implementación**

`apps/ui/src/features/privacy/DotMap.tsx`:
```tsx
import { EXIT_COUNTRIES } from './countries';

/** Mapa decorativo (proyección equirrectangular). La selección accesible es la lista de radios. */
export function DotMap({ active }: { active: string | null }) {
  return (
    <svg className="np-dotmap" viewBox="0 0 360 180" aria-hidden="true">
      <rect x="0" y="0" width="360" height="180" fill="none" />
      {EXIT_COUNTRIES.map((c) => (
        <circle
          key={c.code}
          className="np-dotmap-dot"
          data-active={c.code === active}
          cx={c.lon + 180}
          cy={90 - c.lat}
          r={c.code === active ? 4 : 2.5}
        />
      ))}
    </svg>
  );
}
```

`apps/ui/src/features/privacy/PrivacySection.tsx`:
```tsx
import { useI18n } from '@newpaper/i18n/react';
import { Button, Switch } from '@newpaper/ui-kit';
import { commands } from '../../ipc/commands';
import type { NetMode } from '../../ipc/types';
import { countryName, EXIT_COUNTRIES } from './countries';
import { DotMap } from './DotMap';
import { torStateLabel } from './TorPopup';
import { applyStatus, usePrivacyStatus } from './usePrivacy';

export function PrivacySection() {
  const { t, locale } = useI18n();
  const status = usePrivacyStatus();
  if (!status) return null;
  const setMode = async (m: NetMode) => applyStatus(await commands.netSetMode(m));
  const modes: { id: NetMode | 'wireguard'; title: string; desc: string; disabled?: boolean }[] = [
    { id: 'direct', title: t('privacy.settings.modeDirect'), desc: t('privacy.settings.modeDirectDesc') },
    { id: 'tor', title: t('privacy.settings.modeTor'), desc: t('privacy.settings.modeTorDesc') },
    { id: 'wireguard', title: t('privacy.settings.modeWireguard'), desc: t('privacy.settings.modeWireguardDesc'), disabled: true },
  ];
  return (
    <section className="np-settings-section" aria-labelledby="np-set-privacy">
      <h2 id="np-set-privacy" className="np-settings-h2">{t('privacy.settings.title')}</h2>
      <p className="np-settings-hint">{t('privacy.settings.restartNote')}</p>
      <div role="radiogroup" aria-label={t('privacy.settings.connection')} className="np-modes">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={status.mode === m.id}
            disabled={m.disabled}
            className="np-mode"
            onClick={() => m.id !== 'wireguard' && setMode(m.id)}
          >
            <strong>{m.title}</strong>
            <span className="np-mode-desc">{m.desc}</span>
          </button>
        ))}
      </div>
      <p className="np-kicker" aria-live="polite">{torStateLabel(t, status)}</p>
      {status.mode === 'direct' ? (
        <p className="np-settings-hint">{t('privacy.tor.directNote')}</p>
      ) : (
        <>
          <h3 className="np-settings-label">{t('privacy.settings.exitCountry')}</h3>
          <DotMap active={status.exitCountry} />
          <p className="np-settings-hint">{t('privacy.tor.reducesAnonymity')}</p>
          <div role="radiogroup" aria-label={t('privacy.settings.exitCountry')} className="np-countries">
            {['auto', ...EXIT_COUNTRIES.map((c) => c.code)].map((code) => {
              const checked = (status.exitCountry ?? 'auto') === code;
              return (
                <button
                  key={code}
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  className="np-country"
                  onClick={async () => applyStatus(await commands.torSetExitCountry(code === 'auto' ? null : code))}
                >
                  {code === 'auto' ? t('privacy.tor.autoCountry') : countryName(code, locale)}
                </button>
              );
            })}
          </div>
          <div className="np-tor-route">
            <span>{t('privacy.tor.routeYou')}</span><span aria-hidden="true">→</span>
            <span>{t('privacy.tor.routeGuard')}</span><span aria-hidden="true">→</span>
            <span>{t('privacy.tor.routeMiddle')}</span><span aria-hidden="true">→</span>
            <span>{t('privacy.tor.routeExit', { country: status.exitCountry ?? t('privacy.tor.auto') })}</span>
            <span>{t('privacy.tor.circuit', { n: status.circuit })}</span>
            <Button variant="quiet" onClick={async () => applyStatus(await commands.torNewCircuit())}>{t('privacy.tor.newCircuit')}</Button>
          </div>
        </>
      )}
      <h3 className="np-settings-label">{t('privacy.settings.routing')}</h3>
      <Switch
        label={t('privacy.settings.feedsViaTor')}
        checked={status.feedsViaTor}
        onChange={async (v) => applyStatus(await commands.privacySetRouting({ feedsViaTor: v }))}
      />
      <Switch
        label={t('privacy.settings.aiViaTor')}
        description={t('privacy.settings.aiViaTorHint')}
        checked={status.aiViaTor}
        onChange={async (v) => applyStatus(await commands.privacySetRouting({ aiViaTor: v }))}
      />
    </section>
  );
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm --filter @newpaper/ui exec vitest run src/features/privacy/PrivacySection.test.tsx`
Expected: PASS — 2 tests.

- [ ] **Step 5: Commit**

```powershell
git add apps/ui/src/features/privacy
git commit -m "feat(ui): privacy and network settings with modes, exit country map and routing"
```

---

### Task 21: UI — Ajustes › Bloqueo y registro de la función

**Files:**
- Create: `apps/ui/src/features/privacy/BlockingSection.tsx`, `apps/ui/src/features/privacy/register.ts`, `apps/ui/src/features/privacy/PrivacySync.tsx`
- Modify: `apps/ui/src/features/index.ts`
- Test: `apps/ui/src/features/privacy/BlockingSection.test.tsx`

**Interfaces:**
- Consumes: todo lo anterior; `registerToolbarItem`, `registerSettingsSection`, `registerOverlay` (subproyecto 1).
- Produces: `BlockingSection()`; `PrivacySync()` (capa invisible que arranca `startPrivacySync`); registro: barra `shield` (orden 10) y `tor` (orden 20); Ajustes `red` (orden 20) y `bloqueo` (orden 30); capas `privacy-sync` y `without-tor`.

- [ ] **Step 1: Escribir el test que falla**

`apps/ui/src/features/privacy/BlockingSection.test.tsx`:
```tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockIPC } from '@tauri-apps/api/mocks';
import { describe, expect, it } from 'vitest';
import type { AdblockStatus } from '../../ipc/types';
import { renderWithI18n } from '../../test/renderWithI18n';
import { BlockingSection } from './BlockingSection';

const STATUS: AdblockStatus = {
  enabled: true,
  lastRefresh: Date.UTC(2026, 9, 6, 8) / 1000,
  lists: [
    { id: 'easylist', name: 'EasyList', category: 'ads', enabled: true, source: 'downloaded', fetchedAt: Date.UTC(2026, 9, 6, 8) / 1000 },
    { id: 'easylist-cookie', name: 'EasyList Cookie', category: 'cookies', enabled: false, source: 'embedded', fetchedAt: null },
  ],
};

describe('BlockingSection', () => {
  it('lists filter lists with category and source, toggles and refreshes', async () => {
    const calls: [string, unknown][] = [];
    mockIPC((cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'adblock_refresh') return { updated: ['easylist'], failed: [['easyprivacy', '404']], skipped: false };
      return STATUS;
    });
    renderWithI18n(<BlockingSection />);
    expect(await screen.findByText('EasyList')).toBeInTheDocument();
    expect(screen.getByText('Banners de cookies')).toBeInTheDocument();
    expect(screen.getByText('Copia incluida en la app')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: 'EasyList Cookie' }));
    expect(calls).toContainEqual(['adblock_set_list', { id: 'easylist-cookie', enabled: true }]);
    await userEvent.click(screen.getByRole('switch', { name: /Bloquear anuncios, rastreadores/ }));
    expect(calls).toContainEqual(['adblock_set_enabled', { enabled: false }]);
    await userEvent.click(screen.getByRole('button', { name: 'Actualizar ahora' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1 lista actualizada'));
    expect(screen.getByRole('status')).toHaveTextContent('1 lista no se pudo descargar');
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm --filter @newpaper/ui exec vitest run src/features/privacy/BlockingSection.test.tsx`
Expected: FAIL — `Failed to resolve import "./BlockingSection"`.

- [ ] **Step 3: Implementación**

`apps/ui/src/features/privacy/BlockingSection.tsx`:
```tsx
import { useI18n } from '@newpaper/i18n/react';
import { Button, Switch } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { AdblockStatus, ListCategory } from '../../ipc/types';

const CATEGORY_KEY: Record<ListCategory, string> = {
  ads: 'privacy.blocking.categoryAds',
  privacy: 'privacy.blocking.categoryPrivacy',
  cookies: 'privacy.blocking.categoryCookies',
  newsletters: 'privacy.blocking.categoryNewsletters',
};

export function BlockingSection() {
  const { t, formatDate } = useI18n();
  const [status, setStatus] = useState<AdblockStatus | null>(null);
  const [report, setReport] = useState<string>('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void commands.adblockStatus().then(setStatus);
  }, []);
  if (!status) return null;
  const when = (secs: number | null) => (secs ? formatDate(new Date(secs * 1000), { dateStyle: 'medium', timeStyle: 'short' }) : t('privacy.blocking.never'));

  return (
    <section className="np-settings-section" aria-labelledby="np-set-blocking">
      <h2 id="np-set-blocking" className="np-settings-h2">{t('privacy.blocking.title')}</h2>
      <Switch label={t('privacy.blocking.enabled')} checked={status.enabled} onChange={async (v) => setStatus(await commands.adblockSetEnabled(v))} />
      <h3 className="np-settings-label">{t('privacy.blocking.lists')}</h3>
      <div>
        {status.lists.map((l) => (
          <div key={l.id} className="np-list-row">
            <Switch label={l.name} checked={l.enabled} onChange={async (v) => setStatus(await commands.adblockSetList(l.id, v))} />
            <span className="np-list-meta">
              <span>{t(CATEGORY_KEY[l.category])}</span> · <span>{l.source === 'downloaded' ? t('privacy.blocking.sourceDownloaded', { date: when(l.fetchedAt) }) : t('privacy.blocking.sourceEmbedded')}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="np-settings-actions">
        <Button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const r = await commands.adblockRefresh();
              const parts = [t('privacy.blocking.refreshed', { count: r.updated.length })];
              if (r.failed.length) parts.push(t('privacy.blocking.refreshFailed', { count: r.failed.length }));
              setReport(parts.join(' · '));
              setStatus(await commands.adblockStatus());
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('privacy.blocking.refresh')}
        </Button>
      </div>
      <p role="status" className="np-settings-hint">{report}</p>
      <p className="np-settings-hint np-mono">{t('privacy.blocking.engine', { when: when(status.lastRefresh) })}</p>
    </section>
  );
}
```

> El `·` literal entre los dos `span` lo admite el escáner de i18n (no tiene letras).

`apps/ui/src/features/privacy/PrivacySync.tsx`:
```tsx
import { useEffect } from 'react';
import { startPrivacySync } from './usePrivacy';

export function PrivacySync() {
  useEffect(() => {
    const stop = startPrivacySync();
    return () => void stop.then((f) => f());
  }, []);
  return null;
}
```

`apps/ui/src/features/privacy/register.ts`:
```ts
import './privacy.css';
import { registerOverlay, registerSettingsSection, registerToolbarItem } from '../../shell/registry';
import { BlockingSection } from './BlockingSection';
import { OpenWithoutTorDialog } from './OpenWithoutTorDialog';
import { PrivacySection } from './PrivacySection';
import { PrivacySync } from './PrivacySync';
import { ShieldBadge } from './ShieldBadge';
import { TorChip } from './TorChip';

registerToolbarItem({ id: 'shield', order: 10, Component: ShieldBadge });
registerToolbarItem({ id: 'tor', order: 20, Component: TorChip });
registerSettingsSection({ id: 'red', order: 20, titleKey: 'privacy.settings.title', Component: PrivacySection });
registerSettingsSection({ id: 'bloqueo', order: 30, titleKey: 'privacy.blocking.title', Component: BlockingSection });
registerOverlay({ id: 'privacy-sync', Component: PrivacySync });
registerOverlay({ id: 'without-tor', Component: OpenWithoutTorDialog });
```

Añade a `apps/ui/src/features/index.ts`:
```ts
import './privacy/register';
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run:
```powershell
pnpm --filter @newpaper/ui test
pnpm --filter @newpaper/i18n test
pnpm --filter @newpaper/ui typecheck
```
Expected: todo PASS (UI: 24 del núcleo + 14 de privacidad).

- [ ] **Step 5: Commit**

```powershell
git add apps/ui/src/features
git commit -m "feat(ui): blocking settings and registration of privacy toolbar, settings and overlays"
```

---

### Task 22: e2e — bloqueo real en una webview y Tor simulado

**Files:**
- Create: `e2e/fixtures/ads.html`, `e2e/fixtures/ads/banner.js`, `e2e/specs/privacy.e2e.ts`
- Modify: `e2e/wdio.conf.ts`, `e2e/helpers.ts`

**Interfaces:**
- Consumes: `uiInvoke`, `switchToUi`, `FIXTURE_URL` (subproyecto 1); variables `NP_FAKE_TOR` y `NP_TEST_EXTRA_RULES` (Tarea 15, solo depuración).
- Produces: `switchToContent(urlPart: string)` en `e2e/helpers.ts`.

- [ ] **Step 1: Fixtures**

`e2e/fixtures/ads.html`:
```html
<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><title>Fixture con anuncios</title></head>
<body>
  <h1>Página con anuncios</h1>
  <div class="np-test-ad">PUBLICIDAD</div>
  <p>Texto normal de la página.</p>
  <script src="http://localhost:4567/ads/banner.js"></script>
</body>
</html>
```

`e2e/fixtures/ads/banner.js`:
```js
window.npAdLoaded = true;
```

- [ ] **Step 2: Variables de entorno para la app bajo test**

En `e2e/wdio.conf.ts`, sustituye `beforeSession` por:
```ts
  beforeSession: () => {
    driver = spawn('tauri-driver', ['--native-driver', EDGE_DRIVER], {
      stdio: 'inherit',
      env: {
        ...process.env,
        NP_FAKE_TOR: '1',
        // localhost es "tercero" para una página servida en 127.0.0.1; el cosmético oculta .np-test-ad
        NP_TEST_EXTRA_RULES: '||localhost^$third-party\n127.0.0.1##.np-test-ad',
      },
    });
  },
```

Añade a `e2e/helpers.ts`:
```ts
export async function switchToContent(urlPart: string): Promise<void> {
  for (const h of await browser.getWindowHandles()) {
    await browser.switchToWindow(h);
    if ((await browser.getUrl()).includes(urlPart)) return;
  }
  throw new Error(`content webview with ${urlPart} not found`);
}
```

- [ ] **Step 3: Especificación**

`e2e/specs/privacy.e2e.ts`:
```ts
import { FIXTURE_URL, switchToContent, switchToUi, uiInvoke } from '../helpers';

describe('privacy', () => {
  it('blocks a third-party ad with 403 and hides cosmetic selectors', async () => {
    const tab = await uiInvoke<{ id: number }>('tab_open', { url: FIXTURE_URL('ads.html') });
    // El motor se construye en segundo plano al arrancar: recarga hasta que bloquee.
    await browser.waitUntil(
      async () => {
        const c = await uiInvoke<{ tab: number }>('blocked_counts', { tabId: tab.id });
        if (c.tab >= 1) return true;
        await uiInvoke('tab_reload', { tabId: tab.id });
        return false;
      },
      { timeout: 60_000, interval: 3_000 },
    );
    await switchToContent('ads.html');
    expect(await browser.execute(() => (window as unknown as { npAdLoaded?: boolean }).npAdLoaded ?? false)).toBe(false);
    await browser.waitUntil(
      async () => (await browser.execute(() => getComputedStyle(document.querySelector('.np-test-ad')!).display)) === 'none',
      { timeout: 10_000 },
    );
    await switchToUi();
    const shield = await $('.np-shield-btn');
    expect(Number(await shield.getText())).toBeGreaterThanOrEqual(1);
    await uiInvoke('tab_close', { tabId: tab.id });
  });

  it('switches to (simulated) Tor and changes the exit country', async () => {
    let s = await uiInvoke<{ mode: string; tor: { state: string }; exitCountry: string | null }>('net_set_mode', { mode: 'tor' });
    expect(s.mode).toBe('tor');
    expect(s.tor.state).toBe('ready');
    s = await uiInvoke('tor_set_exit_country', { country: 'DE' });
    expect(s.exitCountry).toBe('DE');
    await switchToUi();
    await browser.waitUntil(async () => (await $('.np-torchip').getText()).includes('DE'), { timeout: 10_000 });
    s = await uiInvoke('net_set_mode', { mode: 'direct' });
    expect(s.mode).toBe('direct');
  });
});
```

- [ ] **Step 4: Ejecutar**

Run:
```powershell
cargo build --manifest-path src-tauri/Cargo.toml
pnpm e2e
```
Expected: `reader` (1) y `privacy` (2) en verde.

- [ ] **Step 5: Commit**

```powershell
git add e2e
git commit -m "test(e2e): real webview blocking, cosmetic hiding and simulated tor country switch"
```

---

### Task 23: Verificación manual de fugas con Tor real

**Files:**
- Create: `docs/release/verificacion-privacidad.md`

**Interfaces:** ninguna; deja constancia de las comprobaciones que no se pueden automatizar.

- [ ] **Step 1: Escribir la lista de comprobación**

`docs/release/verificacion-privacidad.md`:
```markdown
# Verificación manual de privacidad (Tor real)

Build de producción (`pnpm tauri build`), sin `NP_FAKE_TOR`. Anota fecha, versión y resultado de cada punto.

1. **Arranque de Tor.** Ajustes › Privacidad y red › Tor. El chip pasa de "Conectando a Tor… N %" a "Tor · Auto" en menos de 2 min.
2. **Salida Tor.** Abre https://check.torproject.org → "Congratulations. This browser is configured to use Tor."
3. **País de salida.** Elige Alemania con el popup (flechas + avión). Tras ≈2 s, https://check.torproject.org muestra una IP; compruébala en https://ipinfo.io → país DE.
4. **Fugas de DNS.** https://www.dnsleaktest.com → "Extended test": ningún servidor de tu proveedor ni de tu país real.
5. **Fugas WebRTC.** https://browserleaks.com/webrtc → no aparece tu IP local ni la pública real.
6. **Kill switch.** Con una página abierta en modo Tor, desactiva el adaptador de red 30 s y vuelve a activarlo mientras recargas: las cargas fallan con la página de error; nunca se ve la web por conexión directa. Repite cerrando la app durante el arranque de Tor: al volver, nada carga hasta que el chip dice "Tor · …".
7. **Abrir sin Tor.** En una pestaña, popup › "Abrir esta pestaña sin Tor" → aviso → confirmar. Esa pestaña muestra tu IP real en https://ipinfo.io; las demás siguen por Tor. El chip dice "Sin Tor" en ámbar en esa pestaña.
8. **Nuevo circuito.** "Nuevo circuito" → la IP de https://check.torproject.org cambia (puede repetir país).
9. **Imágenes del lector.** En modo Tor, abre una noticia en el lector: en DevTools de la webview UI, las imágenes vienen de `http://npimg.localhost/…` (pasan por Rust y Tor), nunca directas.
10. **IA y RSS.** Con "IA por Tor" desactivado, una petición de IA de prueba sale directa; con "Fuentes RSS por Tor" activado, la descarga de feeds falla si Tor no está listo.
```

- [ ] **Step 2: Ejecutar la lista una vez y anotar resultados**

Run: `pnpm tauri build` y sigue los 10 puntos.
Expected: todos correctos. Cualquier fallo de los puntos 4–6 bloquea la publicación.

- [ ] **Step 3: Commit**

```powershell
git add docs/release/verificacion-privacidad.md
git commit -m "docs: manual tor leak verification checklist"
```

---

## Cobertura de la spec (autorrevisión)

| Requisito (§4, §10, §12) | Tarea |
|---|---|
| Motor adblock con EasyList, EasyPrivacy, uBO, cookies, suscripciones; copia embebida; refresco 24 h por Tor | 1, 3, 4, 15 |
| `WebResourceRequested` filtro `*` → 403 | 7, 15 |
| Cosméticos por script inyectado | 2, 8, 15 |
| Contadores por pestaña y día, escudo | 5, 15, 17 |
| Proxy SOCKS5 local, DNS remoto, WebRTC | 10, 11, 13, 14 |
| País de salida, recrear entorno, nuevo circuito (`IsolationToken`) | 12, 13, 15, 18, 20 |
| Kill switch, sin vuelta a directo; abrir sin Tor con aviso | 11, 13, 15, 19 |
| RSS por Tor e IA directa por defecto | 9, 13, 14, 20 |
| WireGuard fase 2 (deshabilitado) | 20 |
| Popup compacto con flechas y avión | 18 |
| Ajustes Red (mapa) y Bloqueo | 20, 21 |
| Tests: reglas de bloqueo, proxy SOCKS con Arti en modo test, e2e de país con Arti simulado | 1–8, 11, 13, 22 |

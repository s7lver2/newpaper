# newpaper · Subproyecto 6 — Arranque, sistema y actualizaciones · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instalador NSIS por usuario en tres idiomas; actualizador de la app (`tauri-plugin-updater`, firmas minisign, canales estable y beta, descarga en segundo plano, notas de versión y vuelta atrás si el arranque falla dos veces); actualizaciones de contenido con manifiesto firmado, aplicación atómica y reversión; primer arranque con las opciones de instalación; recorrido de bienvenida; páginas de error de red, cuelgue, 404 "Fe de erratas" y sin conexión con tres en raya; y la cola de acciones sin conexión.

**Architecture:** El crate puro `np-update` (sin Tauri) contiene lo que no puede fallar en silencio: verificación minisign, guardia de arranque con decisión de vuelta atrás y el manifiesto de contenido con aplicación atómica (`staging` → `current`, la anterior queda en `previous`). El módulo `system` de la app lo conecta con `tauri-plugin-updater` (red por Tor si el modo Tor está activo, sin vuelta a directo), con el cliente HTTP `Updates` del subproyecto 2 y con los plugins `autostart` y `single-instance`. La UI añade `apps/ui/src/features/system/*` (actualizaciones, primer arranque y recorrido) y `apps/ui/src/features/pages/*` (error, cuelgue, 404, sin conexión, tres en raya).

**Tech Stack:** `tauri-plugin-updater` 2.13.2, `tauri-plugin-process` 2.4.0, `tauri-plugin-autostart` 2.7.0, `tauri-plugin-single-instance` 2.5.2, `minisign-verify` 0.3.0 (verificación), `minisign` 0.10.0 (solo firma de contenido y tests), `sha2` 0.10, `base64` 0.23.1, `rusqlite` 0.40; `@tauri-apps/plugin-updater` 2.13.2, `@tauri-apps/plugin-process` 2.4.0; React 19, Vitest 5, WebdriverIO 10.

## Decisiones tomadas

1. **Opciones del instalador dentro de la app**: añadir páginas propias al NSIS de Tauri exige sustituir su plantilla completa. El instalador v1 pregunta lo que su plantilla ya pregunta (idioma, carpeta, acceso directo) y las demás opciones de §9 (iniciar con Windows, abrir enlaces de noticias, importar marcadores, incluir Tor, descargar modelo local) son la **primera pantalla del primer arranque**, antes del recorrido. Mismo resultado para el usuario y sin plantilla propia. El instalador v2 (mini app "setup") sigue siendo fase posterior.
2. **"Abrir enlaces de noticias"**: Windows no deja asociar solo algunos dominios. El gancho NSIS registra newpaper como navegador candidato en `HKCU` (`StartMenuInternet`, `RegisteredApplications`, `ProgId` para `http`/`https`); la opción del primer arranque abre `ms-settings:defaultapps` para que el usuario lo elija. Las URL que llegan por línea de comandos (o a una instancia ya abierta, vía `single-instance`) se abren en pestaña nueva.
3. **"Importar marcadores"**: newpaper no tiene marcadores. Se importan los de Edge, Chrome y Brave (fichero JSON `Bookmarks` del perfil `Default`) cuyo dominio es un medio conocido (`OutletIndex`), como artículos "leer más tarde" (`saved_articles`); el resto se ignora y se dice cuántos. Firefox queda fuera de v1 (su `places.sqlite` está bloqueado mientras Firefox se ejecuta).
4. **"Incluir Tor"**: Arti ya va dentro del binario (subproyecto 2). La opción pone `privacy.mode = "tor"` desde el primer arranque.
5. **"Descargar modelo local"**: si Ollama responde en `127.0.0.1:11434`, se pide `POST /api/pull` con `qwen3:8b` y se muestra el progreso; si no está instalado, se enlaza a su web.
6. **Canales y URLs**: estable `https://github.com/nickespro130/newpaper/releases/latest/download/latest.json`; beta: publicación con etiqueta móvil `beta` (`…/releases/download/beta/latest.json`); contenido: etiqueta móvil `content` (`…/releases/download/content/manifest.json` + `.minisig`). El propietario sale del usuario git del repositorio; si el repositorio público es otro, se cambia en `np_update::channels` y en `tauri.conf.json`. El canal se guarda en `device.updates.channel` (no se sincroniza).
7. **Tor**: con `privacy.mode = "tor"` el actualizador usa `proxy(socks5h://127.0.0.1:<socks_port>)`; si Tor no está listo, no se comprueba nada (nunca se cae a directo). El contenido se descarga con `ShellExtensions::http_client(HttpPurpose::Updates)`, que ya respeta el modo.
8. **Vuelta atrás**: antes de instalar la versión N+1 se guarda el instalador firmado de la versión actual N (si no está, se descarga de `…/releases/download/v{N}/newpaper_{N}_x64-setup.exe` y se verifica su `.sig` con la misma clave). La guardia de arranque cuenta los arranques de la versión nueva que no llegan a "sano" (la UI cargada y 20 s sin cuelgue); en el tercer arranque tras dos fallidos ejecuta el instalador guardado en modo pasivo y marca la versión como saltada. Un fallo antes de que corra Rust (p. ej. DLL ausente) no se detecta: limitación anotada.
9. **Claves**: la del actualizador va en `tauri.conf.json` (`plugins.updater.pubkey`, formato de `tauri signer generate`); la de contenido es **otra** clave minisign embebida con `include_str!("../../keys/content.pub")`. Nunca en `config/` (que es justo lo que se actualiza).
10. **Contenido actualizable**: `sources-*.json`, `topics-*.json`, `outlet-priors.json`, `parties-*.json`, `lexicon-*.json`, `providers.json`, `prices.json`, `primary-sources.json`, `framing-weights.json`, `mirror-swaps-*.json`. Las listas de filtros se siguen actualizando desde sus orígenes (subproyecto 2). Tras aplicar, se emite `content://applied` y las cachés de la UI (`getRegistry`, partidos) se recargan.
11. **Migración**: ranura **6** (`content_updates`, historial local; no se sincroniza).
12. **404**: la página "Fe de erratas" sustituye el texto provisional de páginas internas inexistentes y se usa para respuestas HTTP 404 de la navegación principal (el subproyecto 1 informa `httpStatus`). Seis columnas que rotan cada 7 s, con textos propios en cada idioma.
13. **Cola sin conexión** (§18): acciones que necesitan red (`analyzeFull`, `watchAdd`, `saved` de una URL aún no descargada) se guardan en `device.offlineQueue` y se ejecutan al volver la conexión.
14. **Informe de cuelgue**: opcional, local (`<app_local_data>/crash-reports/*.json`), solo datos técnicos (versión, SO, memoria, motivo de WebView2), **sin URL ni contenido**.

## Global Constraints

- §9: instalador NSIS por usuario, marca de newpaper, en español (y §14: también inglés y alemán); recorrido bienvenida → 3 pasos (temas, IA, red) → 6 marcas sobre la interfaz real (lente, frase, nota, noticia neutral, Tor, ajustes) → "Listo", repetible desde Ajustes.
- §17: `tauri-plugin-updater` con minisign y clave embebida; canales `estable` y `beta`; comprobación al arrancar y cada 24 h; descarga en segundo plano y aplicación al reiniciar; notas de versión en la app; conservar el instalador anterior para volver atrás si el arranque falla dos veces; contenido por manifiesto JSON firmado con versión por recurso, aplicación atómica y reversible; por Tor si está activo; **nunca se instala nada sin firma válida**.
- §10: sin red → página sin conexión con guardados y el juego; Tor caído → "Tor no disponible", nada sale en directo sin acción explícita.
- §8: 404 con columnas rotatorias, errores de red, cuelgue, tres en raya; estética papel, movimiento con `prefers-reduced-motion`, objetivos ≥ 44 px.
- §14: páginas internas traducidas; chistes de la fe de erratas con lista propia por idioma.
- §11: un certificado no válido **nunca** ofrece "continuar de todos modos".
- Comandos nuevos en tres sitios (`build.rs::APP_COMMANDS`, `generate_handler!`, `capabilities/ui.json`) y `features.rs::setup_all`.
- **Política de tests**: solo llevan test la verificación de firmas, la guardia de arranque, el manifiesto de contenido (firma, hash, aplicación y reversión), la migración 6, la clasificación de errores de red, el minimax del tres en raya y el e2e del recorrido. Lo demás se comprueba compilando y con la prueba manual de la Tarea 17.

---

## Interfaces de subproyectos anteriores

- Subproyecto 1: `np_store::{Store, migrations::{Migration, MIGRATIONS}}`, ajustes y observadores, `config::{read_config_text, OutletIndex}`, `ShellExtensions::http_client(HttpPurpose::Updates)`, `TabManager` (abrir pestaña), `registerTabSurface('error' | 'crash')`, `registerInternalPage`, `registerOverlay`, `registerSettingsSection`, `NavFailure { url, webErrorStatus, httpStatus }`, `commands`, `useSetting`, `navigate`, `openInternal`.
- Subproyecto 2: `NetController::{status, socks_port}`, `NetMode`, `TorState`, `requestOpenWithoutTor(tabId)`, ajuste `privacy.mode`, `TorChip`.
- Subproyecto 3: `commands.{topicsList, topicSetFollowing, savedAdd, savedList, offlineEditions, watchAdd}`, página `newpaper://edicion`.
- Subproyecto 4: `getRegistry`, `resetPipeline`, ajustes `ai.preset`.
- Subproyecto 5: `controller.analyzeFull`, `openPanel`, `panelStore`, elementos con `data-tour` que añade este plan.

## Contratos que publica este plan

| Elemento | Lo usan |
|---|---|
| `np_update::{sig, boot, content, channels}` | 7 (firma del `.npsync` no; reutiliza `sig` para nada más), 8 (contenido en móvil) |
| Comandos `update_status`, `update_check`, `update_install_now`, `update_set_channel`, `content_status`, `content_check_now`, `content_revert`, `app_ready`, `first_run_status`, `first_run_apply`, `bookmarks_import`, `ollama_pull`, `crash_report_save`, `system_info`, `open_default_apps` | UI de este plan |
| Eventos `update://status`, `content://applied`, `ollama://progress`, `app://open-url` | UI, 5 (recarga de registro) |
| `offlineQueue` (`enqueue`, `flush`) en `apps/ui/src/features/pages/offlineQueue.ts` | 5, 8 |
| Atributos `data-tour="lens|phrase|score|neutral|tor|settings"` | recorrido |

## Mapa de archivos

```
keys/content.pub                                     (clave pública de contenido)
src-tauri/crates/np-update/
  Cargo.toml  sql/0006_content.sql
  src/lib.rs error.rs sig.rs boot.rs content.rs channels.rs repo.rs  src/bin/np-content-sign.rs
src-tauri/crates/np-store/src/migrations.rs          (Modify: ranura 6)
src-tauri/src/system/{mod.rs, updater.rs, content.rs, firstrun.rs, bookmarks.rs, commands.rs}
src-tauri/{tauri.conf.json, Cargo.toml, build.rs, capabilities/ui.json, src/lib.rs, src/features.rs}   (Modify)
src-tauri/nsis/{installer-hooks.nsh, header.bmp, sidebar.bmp}
scripts/{make-installer-art.mjs, release-manifest.mjs}
apps/ui/src/features/system/{updates.ts, UpdatesSection.tsx, WhatsNew.tsx, FirstRun.tsx, tour/{steps.ts, Tour.tsx}, register.ts, system.css}
apps/ui/src/features/pages/{netError.ts, netError.test.ts, NetErrorSurface.tsx, CrashSurface.tsx, NotFoundPage.tsx, OfflinePage.tsx, ticTacToe.ts, ticTacToe.test.ts, TicTacToe.tsx, offlineQueue.ts, register.ts, pages.css}
apps/ui/src/shell/BrowserShell.tsx                    (Modify: 404 interno)
packages/i18n/locales/{es,en,de}.json                 (Modify)
e2e/specs/tour.e2e.ts
```

Todos los comandos se ejecutan desde `E:\newpaper` en PowerShell.

---

### Task 1: Crate `np-update` — verificación minisign y canales

**Files:**
- Create: `src-tauri/crates/np-update/Cargo.toml`, `src/lib.rs`, `src/error.rs`, `src/sig.rs`, `src/channels.rs`
- Test: `src-tauri/crates/np-update/src/sig.rs` (módulo `tests`)

**Interfaces:**
- Produces:
  - `UpdateError` (`Signature`, `Encoding`, `Hash { name }`, `Io`, `Json`, `Manifest(String)`, `Sql`), `type Result<T>`
  - `sig::decode_tauri(b64: &str) -> Result<String>` (los `.sig` y la `pubkey` de Tauri son el texto minisign en base64)
  - `sig::verify(pubkey_text: &str, data: &[u8], signature_text: &str) -> Result<()>` (acepta clave como texto completo o como línea base64)
  - `channels::{Channel { Stable, Beta }, Channel::parse(&str) -> Channel, manifest_url(Channel) -> &'static str, CONTENT_MANIFEST_URL, installer_url(version) -> String}`

- [ ] **Step 1: Crate**

`src-tauri/crates/np-update/Cargo.toml`:
```toml
[package]
name = "np-update"
version = "0.1.0"
edition = "2021"

[dependencies]
minisign-verify = "=0.3.0"
base64 = "=0.23.1"
sha2 = "0.10"
serde = { workspace = true }
serde_json = { workspace = true }
thiserror = { workspace = true }
rusqlite = { workspace = true }
np-store = { path = "../np-store" }
minisign = { version = "=0.10.0", optional = true }

[features]
sign = ["dep:minisign"]

[[bin]]
name = "np-content-sign"
required-features = ["sign"]

[dev-dependencies]
minisign = "=0.10.0"
tempfile = { workspace = true }
```

`src-tauri/crates/np-update/src/lib.rs`:
```rust
//! np-update: firmas minisign, guardia de arranque y manifiesto de contenido (§17).
pub mod boot;
pub mod channels;
pub mod content;
pub mod error;
pub mod repo;
pub mod sig;

pub use error::{Result, UpdateError};
```

`src-tauri/crates/np-update/src/error.rs`:
```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum UpdateError {
    #[error("invalid signature: {0}")]
    Signature(String),
    #[error("invalid encoding: {0}")]
    Encoding(String),
    #[error("hash mismatch for {name}")]
    Hash { name: String },
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("manifest: {0}")]
    Manifest(String),
    #[error("sql: {0}")]
    Sql(#[from] rusqlite::Error),
}

pub type Result<T> = std::result::Result<T, UpdateError>;
```

> Mientras las Tareas 2–4 no existan, deja `boot.rs`, `content.rs` y `repo.rs` vacíos (solo el comentario de módulo) para que compile.

- [ ] **Step 2: Escribir el test que falla**

`src-tauri/crates/np-update/src/sig.rs`:
```rust
//! Verificación minisign (Ed25519). Nunca se instala ni aplica nada sin firma válida (§17).

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;
    use std::io::Cursor;

    fn keypair() -> (String, minisign::SecretKey) {
        let kp = minisign::KeyPair::generate_unencrypted_keypair().unwrap();
        (kp.pk.to_box().unwrap().into_string(), kp.sk)
    }
    fn sign(sk: &minisign::SecretKey, data: &[u8]) -> String {
        minisign::sign(None, sk, Cursor::new(data), Some("newpaper"), None).unwrap().into_string()
    }

    #[test]
    fn accepts_valid_and_rejects_tampered_or_foreign_signatures() {
        let (pk, sk) = keypair();
        let (other_pk, _) = keypair();
        let sig = sign(&sk, b"manifest v1");
        verify(&pk, b"manifest v1", &sig).unwrap();
        assert!(verify(&pk, b"manifest v2", &sig).is_err());
        assert!(verify(&other_pk, b"manifest v1", &sig).is_err());
        assert!(verify(&pk, b"manifest v1", "not a signature").is_err());
    }

    #[test]
    fn accepts_keys_as_base64_line_and_tauri_encoded_files() {
        let (pk, sk) = keypair();
        let line = pk.lines().nth(1).unwrap();
        let sig = sign(&sk, b"installer");
        verify(line, b"installer", &sig).unwrap();
        let b64 = base64::engine::general_purpose::STANDARD;
        let tauri_pk = decode_tauri(&b64.encode(&pk)).unwrap();
        let tauri_sig = decode_tauri(&b64.encode(&sig)).unwrap();
        verify(&tauri_pk, b"installer", &tauri_sig).unwrap();
        assert!(decode_tauri("%%%").is_err());
    }
}
```

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-update sig`
Expected: FAIL de compilación (`cannot find function verify`).

- [ ] **Step 4: Implementación**

Añade encima de los tests en `sig.rs`:
```rust
use base64::Engine;
use minisign_verify::{PublicKey, Signature};

use crate::{Result, UpdateError};

/// Tauri guarda la clave pública y los `.sig` como el texto minisign entero codificado en base64.
pub fn decode_tauri(b64: &str) -> Result<String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64.trim())
        .map_err(|e| UpdateError::Encoding(e.to_string()))?;
    String::from_utf8(bytes).map_err(|e| UpdateError::Encoding(e.to_string()))
}

fn public_key(text: &str) -> Result<PublicKey> {
    let t = text.trim();
    let parsed = if t.contains('\n') { PublicKey::decode(t) } else { PublicKey::from_base64(t) };
    parsed.map_err(|e| UpdateError::Signature(e.to_string()))
}

pub fn verify(pubkey_text: &str, data: &[u8], signature_text: &str) -> Result<()> {
    let pk = public_key(pubkey_text)?;
    let sig = Signature::decode(signature_text.trim()).map_err(|e| UpdateError::Signature(e.to_string()))?;
    pk.verify(data, &sig, false).map_err(|e| UpdateError::Signature(e.to_string()))
}
```

`src-tauri/crates/np-update/src/channels.rs`:
```rust
//! Canales de actualización (§17). Cambia `REPO` si el repositorio público es otro.
pub const REPO: &str = "https://github.com/nickespro130/newpaper/releases";

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Channel {
    Stable,
    Beta,
}

impl Channel {
    pub fn parse(s: &str) -> Channel {
        if s.eq_ignore_ascii_case("beta") { Channel::Beta } else { Channel::Stable }
    }
}

pub fn manifest_url(c: Channel) -> &'static str {
    match c {
        Channel::Stable => "https://github.com/nickespro130/newpaper/releases/latest/download/latest.json",
        Channel::Beta => "https://github.com/nickespro130/newpaper/releases/download/beta/latest.json",
    }
}

pub const CONTENT_MANIFEST_URL: &str = "https://github.com/nickespro130/newpaper/releases/download/content/manifest.json";

/// Instalador NSIS de una versión publicada (para guardar la vuelta atrás).
pub fn installer_url(version: &str) -> String {
    format!("{REPO}/download/v{version}/newpaper_{version}_x64-setup.exe")
}
```

> La clave privada de las pruebas se genera en memoria; ninguna clave real entra en el repositorio. `minisign::sign(None, …)` firma sin precalcular la verificación de la clave pública.

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-update sig`
Expected: `test result: ok. 2 passed`.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/crates/np-update
git commit -m "feat(np-update): minisign verification for tauri-encoded keys and signatures, update channels"
```

---

### Task 2: `np-update` — guardia de arranque y decisión de vuelta atrás

**Files:**
- Modify: `src-tauri/crates/np-update/src/boot.rs`
- Test: `src-tauri/crates/np-update/src/boot.rs` (módulo `tests`)

**Interfaces:**
- Produces:
  - `BootState { last_good: Option<String>, pending: Option<PendingUpdate>, skipped: Vec<String>, rolled_back_from: Option<String> }`, `PendingUpdate { from: String, to: String, failed_starts: u32 }` (JSON en `<app_local_data>/updates/boot.json`)
  - `BootGuard::open(path)`; `on_start(&mut self, current: &str) -> BootDecision` (`Normal` | `Rollback { to_version }`); `mark_healthy(&mut self, current)`; `record_update(&mut self, from, to)`; `take_rollback_notice(&mut self) -> Option<String>`; `is_skipped(version) -> bool`; `save()`
  - `MAX_FAILED_STARTS = 2`

- [ ] **Step 1: Escribir el test que falla**

`src-tauri/crates/np-update/src/boot.rs`:
```rust
//! Guardia de arranque: si una versión recién instalada no llega a "sano" dos veces, se vuelve a la anterior (§17).

#[cfg(test)]
mod tests {
    use super::*;

    fn guard() -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("updates").join("boot.json");
        (dir, p)
    }

    #[test]
    fn healthy_update_clears_pending() {
        let (_d, p) = guard();
        let mut g = BootGuard::open(&p).unwrap();
        g.record_update("1.0.0", "1.1.0");
        g.save().unwrap();
        let mut g = BootGuard::open(&p).unwrap();
        assert_eq!(g.on_start("1.1.0"), BootDecision::Normal);
        g.mark_healthy("1.1.0");
        g.save().unwrap();
        let g = BootGuard::open(&p).unwrap();
        assert_eq!(g.state().last_good.as_deref(), Some("1.1.0"));
        assert!(g.state().pending.is_none());
    }

    #[test]
    fn rolls_back_on_the_third_start_after_two_unhealthy_starts_and_skips_the_version() {
        let (_d, p) = guard();
        let mut g = BootGuard::open(&p).unwrap();
        g.record_update("1.0.0", "1.1.0");
        g.save().unwrap();
        for _ in 0..2 {
            let mut g = BootGuard::open(&p).unwrap();
            assert_eq!(g.on_start("1.1.0"), BootDecision::Normal);
            g.save().unwrap(); // se cuelga antes de mark_healthy
        }
        let mut g = BootGuard::open(&p).unwrap();
        assert_eq!(g.on_start("1.1.0"), BootDecision::Rollback { to_version: "1.0.0".into() });
        g.save().unwrap();
        let mut g = BootGuard::open(&p).unwrap();
        assert!(g.is_skipped("1.1.0"));
        // Ya en la versión anterior: arranque normal y aviso una sola vez.
        assert_eq!(g.on_start("1.0.0"), BootDecision::Normal);
        assert_eq!(g.take_rollback_notice().as_deref(), Some("1.1.0"));
        assert_eq!(g.take_rollback_notice(), None);
    }

    #[test]
    fn unrelated_versions_and_corrupt_files_never_trigger_a_rollback() {
        let (_d, p) = guard();
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, "{ not json").unwrap();
        let mut g = BootGuard::open(&p).unwrap();
        for _ in 0..5 {
            assert_eq!(g.on_start("2.0.0"), BootDecision::Normal);
        }
        g.record_update("2.0.0", "2.1.0");
        assert_eq!(g.on_start("2.0.0"), BootDecision::Normal); // la instalación no llegó a ocurrir
    }
}
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-update boot`
Expected: FAIL de compilación (`cannot find struct BootGuard`).

- [ ] **Step 3: Implementación**

Añade encima de los tests en `boot.rs`:
```rust
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::Result;

pub const MAX_FAILED_STARTS: u32 = 2;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct PendingUpdate {
    pub from: String,
    pub to: String,
    pub failed_starts: u32,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct BootState {
    pub last_good: Option<String>,
    pub pending: Option<PendingUpdate>,
    pub skipped: Vec<String>,
    pub rolled_back_from: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BootDecision {
    Normal,
    Rollback { to_version: String },
}

pub struct BootGuard {
    path: PathBuf,
    state: BootState,
}

impl BootGuard {
    /// Un fichero ilegible se trata como vacío: la guardia nunca debe impedir arrancar.
    pub fn open(path: &Path) -> Result<Self> {
        let state = std::fs::read_to_string(path).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default();
        Ok(Self { path: path.to_path_buf(), state })
    }

    pub fn state(&self) -> &BootState {
        &self.state
    }

    pub fn record_update(&mut self, from: &str, to: &str) {
        self.state.pending = Some(PendingUpdate { from: from.into(), to: to.into(), failed_starts: 0 });
    }

    pub fn on_start(&mut self, current: &str) -> BootDecision {
        let Some(p) = self.state.pending.as_mut() else { return BootDecision::Normal };
        if p.to != current {
            // Seguimos en la versión de antes (la instalación no ocurrió) o ya volvimos atrás.
            if p.from == current && self.state.rolled_back_from.as_deref() == Some(p.to.as_str()) {
                self.state.pending = None;
            }
            return BootDecision::Normal;
        }
        if p.failed_starts >= MAX_FAILED_STARTS {
            let to_version = p.from.clone();
            let bad = p.to.clone();
            if !self.state.skipped.contains(&bad) {
                self.state.skipped.push(bad.clone());
            }
            self.state.rolled_back_from = Some(bad);
            return BootDecision::Rollback { to_version };
        }
        p.failed_starts += 1;
        BootDecision::Normal
    }

    pub fn mark_healthy(&mut self, current: &str) {
        if self.state.pending.as_ref().is_some_and(|p| p.to == current) {
            self.state.pending = None;
        }
        self.state.last_good = Some(current.into());
    }

    pub fn take_rollback_notice(&mut self) -> Option<String> {
        if self.state.pending.is_some() {
            return None;
        }
        self.state.rolled_back_from.take()
    }

    pub fn is_skipped(&self, version: &str) -> bool {
        self.state.skipped.iter().any(|v| v == version)
    }

    pub fn save(&self) -> Result<()> {
        if let Some(dir) = self.path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let tmp = self.path.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_vec_pretty(&self.state)?)?;
        std::fs::rename(&tmp, &self.path)?;
        Ok(())
    }
}
```

> En el segundo test, el tercer arranque decide `Rollback`; al arrancar ya la 1.0.0 (`p.from == current` y `rolled_back_from == 1.1.0`) se borra `pending` y el aviso se entrega una vez.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-update boot`
Expected: `test result: ok. 3 passed`.

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/crates/np-update
git commit -m "feat(np-update): boot guard that rolls back after two unhealthy starts and skips the bad version"
```

---

### Task 3: `np-update` — manifiesto de contenido firmado, aplicación atómica y reversión

**Files:**
- Modify: `src-tauri/crates/np-update/src/content.rs`
- Create: `src-tauri/crates/np-update/src/bin/np-content-sign.rs`
- Test: `src-tauri/crates/np-update/src/content.rs` (módulo `tests`)

**Interfaces:**
- Produces:
  - `Manifest { version: u32, issued: String, resources: Vec<Resource> }`, `Resource { name, version: u32, sha256, url, bytes: u64 }`
  - `ALLOWED: &[&str]` (patrones de nombre: solo ficheros de `config/` de la decisión 10; nunca rutas)
  - `parse_verified(pubkey, manifest_bytes, signature_text) -> Result<Manifest>` (firma + nombres permitidos + sin duplicados)
  - `ContentDir::new(root)` (`<app_local_data>/content`), `current_manifest() -> Option<Manifest>`, `plan(&Manifest) -> Vec<Resource>` (recursos nuevos o con versión mayor), `stage(&Manifest, fetched: &[(String, Vec<u8>)]) -> Result<PathBuf>` (comprueba tamaño y SHA‑256; copia los que no cambian desde `current`), `commit(staging) -> Result<()>` (`current` → `previous`, `staging` → `current`), `revert() -> Result<()>` (intercambia `previous` y `current`)
  - Binario `np-content-sign --key <secret.key> --dir <config> --base-url <url> --version <n> --out <dir>` (con la feature `sign`)

- [ ] **Step 1: Escribir el test que falla**

`src-tauri/crates/np-update/src/content.rs`:
```rust
//! Contenido actualizable sin reinstalar: manifiesto firmado, versión por recurso, aplicación atómica y reversible (§17).

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};
    use std::io::Cursor;

    fn keys() -> (String, minisign::SecretKey) {
        let kp = minisign::KeyPair::generate_unencrypted_keypair().unwrap();
        (kp.pk.to_box().unwrap().into_string(), kp.sk)
    }
    fn res(name: &str, version: u32, data: &[u8]) -> Resource {
        Resource { name: name.into(), version, sha256: format!("{:x}", Sha256::digest(data)), url: format!("https://x.test/{name}"), bytes: data.len() as u64 }
    }
    fn signed(sk: &minisign::SecretKey, m: &Manifest) -> (Vec<u8>, String) {
        let bytes = serde_json::to_vec(m).unwrap();
        let sig = minisign::sign(None, sk, Cursor::new(&bytes), None, None).unwrap().into_string();
        (bytes, sig)
    }

    #[test]
    fn rejects_bad_signatures_and_unexpected_names() {
        let (pk, sk) = keys();
        let m = Manifest { version: 1, issued: "2026-10-08".into(), resources: vec![res("sources-es.json", 1, b"{}")] };
        let (bytes, sig) = signed(&sk, &m);
        assert_eq!(parse_verified(&pk, &bytes, &sig).unwrap(), m);
        let mut tampered = bytes.clone();
        tampered[5] ^= 1;
        assert!(parse_verified(&pk, &tampered, &sig).is_err());
        for bad in ["../evil.json", "keys/content.pub", "sources-es.exe", "C:\\x.json"] {
            let m = Manifest { version: 1, issued: "x".into(), resources: vec![res(bad, 1, b"{}")] };
            let (b, s) = signed(&sk, &m);
            assert!(parse_verified(&pk, &b, &s).is_err(), "{bad}");
        }
    }

    #[test]
    fn stages_only_verified_files_commits_atomically_and_reverts() {
        let dir = tempfile::tempdir().unwrap();
        let cd = ContentDir::new(dir.path());
        let m1 = Manifest { version: 1, issued: "a".into(), resources: vec![res("sources-es.json", 1, b"v1"), res("providers.json", 1, b"p1")] };
        let s = cd.stage(&m1, &[("sources-es.json".into(), b"v1".to_vec()), ("providers.json".into(), b"p1".to_vec())]).unwrap();
        cd.commit(&s).unwrap();
        assert_eq!(std::fs::read(dir.path().join("current/sources-es.json")).unwrap(), b"v1");

        let m2 = Manifest { version: 2, issued: "b".into(), resources: vec![res("sources-es.json", 2, b"v2"), res("providers.json", 1, b"p1")] };
        assert_eq!(cd.plan(&m2).iter().map(|r| r.name.as_str()).collect::<Vec<_>>(), vec!["sources-es.json"]);
        // Hash incorrecto: no se toca `current`.
        assert!(matches!(cd.stage(&m2, &[("sources-es.json".into(), b"evil".to_vec())]), Err(UpdateError::Hash { .. })));
        assert_eq!(std::fs::read(dir.path().join("current/sources-es.json")).unwrap(), b"v1");

        let s = cd.stage(&m2, &[("sources-es.json".into(), b"v2".to_vec())]).unwrap();
        cd.commit(&s).unwrap();
        assert_eq!(std::fs::read(dir.path().join("current/sources-es.json")).unwrap(), b"v2");
        assert_eq!(std::fs::read(dir.path().join("current/providers.json")).unwrap(), b"p1");
        assert_eq!(cd.current_manifest().unwrap().version, 2);

        cd.revert().unwrap();
        assert_eq!(std::fs::read(dir.path().join("current/sources-es.json")).unwrap(), b"v1");
        assert_eq!(cd.current_manifest().unwrap().version, 1);
    }
}
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-update content`
Expected: FAIL de compilación.

- [ ] **Step 3: Implementación**

Añade encima de los tests en `content.rs`:
```rust
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::{sig, Result, UpdateError};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Resource {
    pub name: String,
    pub version: u32,
    pub sha256: String,
    pub url: String,
    pub bytes: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Manifest {
    pub version: u32,
    pub issued: String,
    pub resources: Vec<Resource>,
}

/// Prefijos de los ficheros de `config/` que el manifiesto puede sustituir (decisión 10).
pub const ALLOWED: &[&str] = &[
    "sources-", "topics-", "outlet-priors", "parties-", "lexicon-", "providers", "prices", "primary-sources", "framing-weights", "mirror-swaps-",
];

fn allowed(name: &str) -> bool {
    name.ends_with(".json")
        && name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.' || c == '_')
        && !name.contains("..")
        && ALLOWED.iter().any(|p| name.starts_with(p))
}

pub fn parse_verified(pubkey: &str, manifest: &[u8], signature: &str) -> Result<Manifest> {
    sig::verify(pubkey, manifest, signature)?;
    let m: Manifest = serde_json::from_slice(manifest)?;
    let mut seen = HashSet::new();
    for r in &m.resources {
        if !allowed(&r.name) {
            return Err(UpdateError::Manifest(format!("resource not allowed: {}", r.name)));
        }
        if !seen.insert(r.name.as_str()) {
            return Err(UpdateError::Manifest(format!("duplicate resource: {}", r.name)));
        }
        if !r.url.starts_with("https://") {
            return Err(UpdateError::Manifest(format!("insecure url: {}", r.url)));
        }
    }
    Ok(m)
}

pub struct ContentDir {
    root: PathBuf,
}

const MANIFEST: &str = "manifest.json";

impl ContentDir {
    pub fn new(root: &Path) -> Self {
        Self { root: root.to_path_buf() }
    }
    fn dir(&self, name: &str) -> PathBuf {
        self.root.join(name)
    }

    pub fn current_manifest(&self) -> Option<Manifest> {
        fs::read(self.dir("current").join(MANIFEST)).ok().and_then(|b| serde_json::from_slice(&b).ok())
    }

    pub fn plan(&self, m: &Manifest) -> Vec<Resource> {
        let cur = self.current_manifest();
        m.resources
            .iter()
            .filter(|r| match cur.as_ref().and_then(|c| c.resources.iter().find(|x| x.name == r.name)) {
                Some(old) => r.version > old.version || r.sha256 != old.sha256,
                None => true,
            })
            .cloned()
            .collect()
    }

    /// Escribe una carpeta `staging-<versión>` completa y verificada. Nada de `current` cambia aquí.
    pub fn stage(&self, m: &Manifest, fetched: &[(String, Vec<u8>)]) -> Result<PathBuf> {
        let staging = self.dir(&format!("staging-{}", m.version));
        if staging.exists() {
            fs::remove_dir_all(&staging)?;
        }
        fs::create_dir_all(&staging)?;
        let result = (|| {
            for r in &m.resources {
                let bytes = match fetched.iter().find(|(n, _)| n == &r.name) {
                    Some((_, b)) => b.clone(),
                    None => fs::read(self.dir("current").join(&r.name)).map_err(|_| UpdateError::Manifest(format!("missing resource: {}", r.name)))?,
                };
                if bytes.len() as u64 != r.bytes || format!("{:x}", Sha256::digest(&bytes)) != r.sha256 {
                    return Err(UpdateError::Hash { name: r.name.clone() });
                }
                fs::write(staging.join(&r.name), &bytes)?;
            }
            fs::write(staging.join(MANIFEST), serde_json::to_vec_pretty(m)?)?;
            Ok(())
        })();
        if result.is_err() {
            let _ = fs::remove_dir_all(&staging);
        }
        result.map(|_| staging)
    }

    /// `current` → `previous` y `staging` → `current` con dos renombrados en el mismo volumen.
    pub fn commit(&self, staging: &Path) -> Result<()> {
        let (cur, prev) = (self.dir("current"), self.dir("previous"));
        if prev.exists() {
            fs::remove_dir_all(&prev)?;
        }
        if cur.exists() {
            fs::rename(&cur, &prev)?;
        }
        if let Err(e) = fs::rename(staging, &cur) {
            if prev.exists() {
                let _ = fs::rename(&prev, &cur);
            }
            return Err(e.into());
        }
        Ok(())
    }

    pub fn revert(&self) -> Result<()> {
        let (cur, prev, tmp) = (self.dir("current"), self.dir("previous"), self.dir("swap"));
        if !prev.exists() {
            return Err(UpdateError::Manifest("nothing to revert".into()));
        }
        if tmp.exists() {
            fs::remove_dir_all(&tmp)?;
        }
        if cur.exists() {
            fs::rename(&cur, &tmp)?;
        }
        fs::rename(&prev, &cur)?;
        if tmp.exists() {
            fs::rename(&tmp, &prev)?;
        }
        Ok(())
    }
}
```

> `plan` es una optimización: `stage` vuelve a comprobar todos los recursos (los no descargados se copian de `current` y también se verifican con su hash).

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-update content`
Expected: `test result: ok. 2 passed`.

- [ ] **Step 5: Firmador para publicar contenido**

`src-tauri/crates/np-update/src/bin/np-content-sign.rs`:
```rust
//! np-content-sign --key <secret.key> --dir config --base-url <url> --version <n> --out <dir>
//! Escribe en <out> los ficheros con sufijo de versión, manifest.json y manifest.json.minisig.
use std::{collections::HashMap, fs, io::Cursor, path::PathBuf};

use np_update::content::{Manifest, Resource, ALLOWED};
use sha2::{Digest, Sha256};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    let get = |k: &str| args.iter().position(|a| a == k).and_then(|i| args.get(i + 1)).cloned().ok_or(format!("missing {k}"));
    let boxed = minisign::SecretKeyBox::from_string(&fs::read_to_string(get("--key")?)?)?;
    // Clave con contraseña (lo normal): NP_CONTENT_KEY_PASSWORD. Sin contraseña: clave sin cifrar.
    let key = match std::env::var("NP_CONTENT_KEY_PASSWORD") {
        Ok(p) => boxed.into_secret_key(Some(p))?,
        Err(_) => boxed.into_unencrypted_secret_key()?,
    };
    let dir = PathBuf::from(get("--dir")?);
    let out = PathBuf::from(get("--out")?);
    let base = get("--base-url")?;
    let version: u32 = get("--version")?.parse()?;
    let previous: HashMap<String, Resource> = fs::read(out.join("manifest.json"))
        .ok()
        .and_then(|b| serde_json::from_slice::<Manifest>(&b).ok())
        .map(|m| m.resources.into_iter().map(|r| (r.name.clone(), r)).collect())
        .unwrap_or_default();
    fs::create_dir_all(&out)?;
    let mut resources = Vec::new();
    for entry in fs::read_dir(&dir)? {
        let name = entry?.file_name().to_string_lossy().to_string();
        if !name.ends_with(".json") || !ALLOWED.iter().any(|p| name.starts_with(p)) {
            continue;
        }
        let bytes = fs::read(dir.join(&name))?;
        let sha256 = format!("{:x}", Sha256::digest(&bytes));
        let v = match previous.get(&name) {
            Some(old) if old.sha256 == sha256 => old.version,
            Some(old) => old.version + 1,
            None => 1,
        };
        let file = format!("{}.v{v}.json", name.trim_end_matches(".json"));
        fs::write(out.join(&file), &bytes)?;
        resources.push(Resource { name, version: v, sha256, url: format!("{base}/{file}"), bytes: bytes.len() as u64 });
    }
    resources.sort_by(|a, b| a.name.cmp(&b.name));
    let m = Manifest { version, issued: std::env::var("NP_ISSUED").unwrap_or_else(|_| "unspecified".into()), resources };
    let json = serde_json::to_vec_pretty(&m)?;
    let sig = minisign::sign(None, &key, Cursor::new(&json), Some("newpaper content"), None)?;
    fs::write(out.join("manifest.json"), &json)?;
    fs::write(out.join("manifest.json.minisig"), sig.into_string())?;
    println!("manifest v{version}: {} resources", m.resources.len());
    Ok(())
}
```

> API comprobada con minisign 0.10.0: `into_unencrypted_secret_key()` para claves sin cifrar e `into_secret_key(Some(password))` para claves cifradas (con `None` falla con "Key is not encrypted" si la clave no lo está). La clave de contenido se genera en la Tarea 7.

Run: `cargo build --manifest-path src-tauri/Cargo.toml -p np-update --features sign --bin np-content-sign`
Expected: compila.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/crates/np-update
git commit -m "feat(np-update): signed content manifest with verified staging, atomic commit, revert and signer tool"
```

---

### Task 4: Migración 6 — historial de actualizaciones de contenido

**Files:**
- Create: `src-tauri/crates/np-update/sql/0006_content.sql`
- Modify: `src-tauri/crates/np-update/src/repo.rs`, `src-tauri/crates/np-store/src/migrations.rs`
- Test: `src-tauri/crates/np-update/src/repo.rs` (módulo `tests`)

**Interfaces:**
- Produces:
  - Tabla `content_updates(id INTEGER PRIMARY KEY, manifest_version INTEGER NOT NULL, applied_at INTEGER NOT NULL, action TEXT NOT NULL CHECK (action IN ('apply','revert')), resources TEXT NOT NULL)` (local, no sincronizable)
  - `repo::{ContentUpdate { manifest_version, applied_at, action, resources: Vec<String> }, record(store, &ContentUpdate) -> Result<()>, history(store, limit) -> Result<Vec<ContentUpdate>>}`

- [ ] **Step 1: Esquema y registro de la migración**

`src-tauri/crates/np-update/sql/0006_content.sql`:
```sql
CREATE TABLE IF NOT EXISTS content_updates (
  id INTEGER PRIMARY KEY,
  manifest_version INTEGER NOT NULL,
  applied_at INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('apply', 'revert')),
  resources TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS content_updates_at ON content_updates(applied_at DESC);
```

En `src-tauri/crates/np-store/src/migrations.rs`, añade a `MIGRATIONS` (tras la 5):
```rust
    Migration { version: 6, name: "content", sql: include_str!("../../np-update/sql/0006_content.sql") },
```

- [ ] **Step 2: Escribir el test que falla**

`src-tauri/crates/np-update/src/repo.rs`:
```rust
//! Historial local de contenido aplicado o revertido.

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_6_creates_the_table_and_history_is_newest_first() {
        let dir = tempfile::tempdir().unwrap();
        let store = np_store::Store::open(&dir.path().join("np.db")).unwrap();
        let v: i64 = store.with_conn(|c| c.query_row("PRAGMA user_version", [], |r| r.get(0))).unwrap();
        assert!(v >= 6);
        record(&store, &ContentUpdate { manifest_version: 3, applied_at: 10, action: "apply".into(), resources: vec!["sources-es.json".into()] }).unwrap();
        record(&store, &ContentUpdate { manifest_version: 3, applied_at: 20, action: "revert".into(), resources: vec![] }).unwrap();
        let h = history(&store, 10).unwrap();
        assert_eq!(h.iter().map(|x| x.action.as_str()).collect::<Vec<_>>(), vec!["revert", "apply"]);
        assert_eq!(h[1].resources, vec!["sources-es.json".to_string()]);
        let bad = store.with_conn(|c| c.execute("INSERT INTO content_updates(manifest_version, applied_at, action, resources) VALUES (1, 1, 'drop', '[]')", []));
        assert!(bad.is_err());
    }
}
```

> Si `Store::open` o `with_conn` del subproyecto 1 tienen otra firma (p. ej. `with_conn` devuelve `np_store::Result`), ajusta solo este test.

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-update repo`
Expected: FAIL de compilación (`cannot find function record`).

- [ ] **Step 4: Implementación**

Añade encima de los tests en `repo.rs`:
```rust
use np_store::Store;
use rusqlite::params;
use serde::{Deserialize, Serialize};

use crate::{Result, UpdateError};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentUpdate {
    pub manifest_version: u32,
    pub applied_at: i64,
    pub action: String,
    pub resources: Vec<String>,
}

pub fn record(store: &Store, u: &ContentUpdate) -> Result<()> {
    let resources = serde_json::to_string(&u.resources)?;
    store
        .with_conn(|c| c.execute("INSERT INTO content_updates(manifest_version, applied_at, action, resources) VALUES (?1, ?2, ?3, ?4)", params![u.manifest_version, u.applied_at, u.action, resources]))
        .map_err(|e| UpdateError::Manifest(e.to_string()))?;
    Ok(())
}

pub fn history(store: &Store, limit: u32) -> Result<Vec<ContentUpdate>> {
    store
        .with_conn(|c| {
            let mut st = c.prepare("SELECT manifest_version, applied_at, action, resources FROM content_updates ORDER BY applied_at DESC, id DESC LIMIT ?1")?;
            let rows = st.query_map([limit], |r| {
                let res: String = r.get(3)?;
                Ok(ContentUpdate { manifest_version: r.get(0)?, applied_at: r.get(1)?, action: r.get(2)?, resources: serde_json::from_str(&res).unwrap_or_default() })
            })?;
            rows.collect::<rusqlite::Result<Vec<_>>>()
        })
        .map_err(|e| UpdateError::Manifest(e.to_string()))
}
```

- [ ] **Step 5: Ejecutar y ver que pasa**

Run:
```powershell
cargo test --manifest-path src-tauri/Cargo.toml -p np-update
cargo test --manifest-path src-tauri/Cargo.toml -p np-store migrations
```
Expected: `np-update` 8 tests en verde; los tests de migraciones del subproyecto 1 siguen en verde (versión final 6, o 7 cuando exista la del subproyecto 7).

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/crates/np-update src-tauri/crates/np-store/src/migrations.rs
git commit -m "feat(np-update): migration 6 with local content update history"
```

---
### Task 5: Módulo `system` — guardia de arranque, "app sana", URLs entrantes, informe de cuelgue e información del sistema

**Files:**
- Create: `src-tauri/src/system/mod.rs`, `src-tauri/src/system/commands.rs`
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/src/setup.rs`, `src-tauri/src/features.rs`, `src-tauri/build.rs`, `src-tauri/capabilities/ui.json`

**Interfaces:**
- Consumes: `np_update::boot` (T2), `Store`, `CmdResult`/`CmdError` (1).
- Produces:
  - `system::boot_check(app: &mut App) -> Result<(), Box<dyn Error>>` — se llama **la primera** en `setup`; si toca volver atrás, lanza el instalador guardado en modo pasivo y termina el proceso
  - Estado `Arc<SystemState { boot: Mutex<BootGuard>, pending_urls: Mutex<Vec<String>>, version: String, data_dir: PathBuf }>`
  - Plugin `single-instance`: las URL `http(s)` de la segunda instancia llegan como evento `app://open-url` y la ventana principal pasa al frente
  - Comandos: `app_ready() -> { pendingUrls: string[]; rolledBackFrom: string | null }` (y a los 20 s marca la versión como sana), `system_info() -> SystemInfo`, `crash_report_save(report: CrashReport) -> string` (ruta del fichero)

- [ ] **Step 1: Dependencias y plugin de instancia única**

En `src-tauri/Cargo.toml`, `[dependencies]`:
```toml
np-update = { path = "crates/np-update" }
tauri-plugin-updater = "=2.13.2"
tauri-plugin-process = "=2.4.0"
tauri-plugin-autostart = "=2.7.0"
tauri-plugin-single-instance = "=2.5.2"
sysinfo = "=0.39.6"
```

En `src-tauri/src/lib.rs`, el plugin de instancia única va **antes** que cualquier otro en `tauri::Builder::default()`, y el resto justo después:
```rust
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| crate::system::on_second_instance(app, argv)))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))
```
y declara `pub mod system;`.

- [ ] **Step 2: Módulo**

`src-tauri/src/system/mod.rs`:
```rust
//! Subproyecto 6: arranque, actualizaciones de app y contenido, primer arranque y páginas del sistema.
pub mod commands;
pub mod content;
pub mod firstrun;
pub mod updater;

use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};

use np_update::boot::{BootDecision, BootGuard};
use tauri::{App, AppHandle, Emitter, Manager};

pub struct SystemState {
    pub boot: Mutex<BootGuard>,
    pub pending_urls: Mutex<Vec<String>>,
    pub version: String,
    pub data_dir: PathBuf,
}

fn http_urls<'a>(args: impl Iterator<Item = &'a String>) -> Vec<String> {
    args.filter(|a| a.starts_with("http://") || a.starts_with("https://")).cloned().collect()
}

pub fn rollback_installer(data_dir: &std::path::Path, version: &str) -> PathBuf {
    data_dir.join("updates").join("rollback").join(format!("newpaper_{version}_x64-setup.exe"))
}

/// Primera llamada de `setup` (antes de crear ventanas): cuenta el arranque y, si procede, vuelve atrás.
pub fn boot_check(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let data_dir = app.path().app_local_data_dir()?;
    let version = app.package_info().version.to_string();
    let mut guard = BootGuard::open(&data_dir.join("updates").join("boot.json"))?;
    let decision = guard.on_start(&version);
    guard.save()?;
    if let BootDecision::Rollback { to_version } = decision {
        let installer = rollback_installer(&data_dir, &to_version);
        if installer.exists() {
            tracing::warn!(%version, %to_version, "rolling back after repeated failed starts");
            // `/P`: instalación pasiva del NSIS de Tauri (barra de progreso, sin preguntas).
            std::process::Command::new(&installer).arg("/P").spawn()?;
            std::process::exit(0);
        }
        tracing::error!(%to_version, "rollback installer missing; continuing");
    }
    let urls = http_urls(std::env::args().collect::<Vec<_>>().iter().skip(1));
    app.manage(Arc::new(SystemState { boot: Mutex::new(guard), pending_urls: Mutex::new(urls), version, data_dir }));
    Ok(())
}

pub fn on_second_instance(app: &AppHandle, argv: Vec<String>) {
    for url in http_urls(argv.iter().skip(1)) {
        let _ = app.emit_to("ui", "app://open-url", url);
    }
    if let Some(w) = app.get_window("main") {
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

/// Tareas de fondo del sistema (actualizaciones de app y contenido).
pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    updater::setup(app)?;
    content::setup(app)?;
    Ok(())
}
```

En `src-tauri/src/setup.rs`, primera línea de `setup`: `crate::system::boot_check(app)?;`. En `features.rs::setup_all`, añade `crate::system::setup(app)?;`.

- [ ] **Step 3: Comandos básicos**

`src-tauri/src/system/commands.rs`:
```rust
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::State;

use super::SystemState;
use crate::commands::{CmdError, CmdResult};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadyInfo {
    pub pending_urls: Vec<String>,
    pub rolled_back_from: Option<String>,
}

#[tauri::command]
pub async fn app_ready(sys: State<'_, Arc<SystemState>>) -> CmdResult<ReadyInfo> {
    let pending_urls = std::mem::take(&mut *sys.pending_urls.lock().expect("lock"));
    let rolled_back_from = {
        let mut g = sys.boot.lock().expect("lock");
        let n = g.take_rollback_notice();
        g.save().map_err(|e| CmdError::new("io", e.to_string()))?;
        n
    };
    let s = sys.inner().clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(20)).await;
        let mut g = s.boot.lock().expect("lock");
        g.mark_healthy(&s.version);
        let _ = g.save();
    });
    Ok(ReadyInfo { pending_urls, rolled_back_from })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub version: String,
    pub os: String,
    pub arch: String,
    pub memory_mb: u64,
    pub webview2: Option<String>,
}

#[tauri::command]
pub async fn system_info(sys: State<'_, Arc<SystemState>>) -> CmdResult<SystemInfo> {
    let mut s = sysinfo::System::new();
    s.refresh_memory();
    Ok(SystemInfo {
        version: sys.version.clone(),
        os: sysinfo::System::long_os_version().unwrap_or_else(|| std::env::consts::OS.into()),
        arch: std::env::consts::ARCH.into(),
        memory_mb: s.total_memory() / 1_048_576,
        webview2: tauri::webview_version().ok(),
    })
}

/// Solo datos técnicos: nunca URL ni contenido (decisión 14).
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrashReport {
    pub reason: String,
    pub exit_code: Option<i32>,
    pub tab_kind: String,
    pub at: i64,
}

#[tauri::command]
pub async fn crash_report_save(sys: State<'_, Arc<SystemState>>, report: CrashReport) -> CmdResult<String> {
    let dir = sys.data_dir.join("crash-reports");
    std::fs::create_dir_all(&dir).map_err(|e| CmdError::new("io", e.to_string()))?;
    let info = system_info(sys.clone()).await?;
    let path = dir.join(format!("crash-{}.json", report.at));
    let body = serde_json::json!({ "report": report, "system": info });
    std::fs::write(&path, serde_json::to_vec_pretty(&body).unwrap_or_default()).map_err(|e| CmdError::new("io", e.to_string()))?;
    Ok(path.display().to_string())
}
```

> `crate::commands::{CmdError, CmdResult}` es donde los dejó el subproyecto 1; si están en otro módulo, ajusta el `use`. `tauri::webview_version()` existe en Tauri 2 (devuelve la versión del runtime WebView2).

- [ ] **Step 4: Registro de comandos**

`build.rs::APP_COMMANDS`: `"app_ready", "system_info", "crash_report_save"`. `generate_handler!`: `system::commands::app_ready, system::commands::system_info, system::commands::crash_report_save`. `capabilities/ui.json`: `"allow-app-ready", "allow-system-info", "allow-crash-report-save"`, y además los permisos de plugin `"updater:default"`, `"process:allow-restart"`, `"autostart:allow-enable"`, `"autostart:allow-disable"`, `"autostart:allow-is-enabled"`.

- [ ] **Step 5: Comprobar que compila**

Crea `updater.rs`, `content.rs` y `firstrun.rs` con `pub fn setup(_app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> { Ok(()) }` (las Tareas 6–8 los rellenan).

Run: `cargo check --manifest-path src-tauri/Cargo.toml -p np-app`
Expected: compila sin errores.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri
git commit -m "feat(system): boot guard on startup, single instance url forwarding, app ready, crash report and system info"
```

---

### Task 6: Actualizador de la app — canales, Tor sin vuelta a directo, descarga en segundo plano, notas y vuelta atrás

**Files:**
- Modify: `src-tauri/src/system/updater.rs`, `src-tauri/src/lib.rs`, `src-tauri/build.rs`, `src-tauri/capabilities/ui.json`

**Interfaces:**
- Consumes: `tauri_plugin_updater::{UpdaterExt, Update}`, `np_update::{channels, sig}`, `NetController::{status, socks_port}` (2), `ShellExtensions::http_client(HttpPurpose::Updates)` (1).
- Produces:
  - `UpdateStatus` (serde con `state`): `idle`, `checking`, `upToDate { checkedAt }`, `downloading { version, received, total }`, `ready { version, notes, date }`, `torUnavailable`, `error { message }`
  - Evento `update://status` con `UpdateStatus`
  - Comandos: `update_status() -> UpdateInfo { status, current, channel, whatsNew: { version, notes } | null }`, `update_check()`, `update_install_now()` (instala y la app se cierra), `update_set_channel(channel: 'stable' | 'beta')`, `update_ack_notes()`
  - Comprobación 30 s después de arrancar y cada 24 h; al pedir cerrar la app con una actualización lista, se instala (`RunEvent::ExitRequested`)

- [ ] **Step 1: Implementación**

`src-tauri/src/system/updater.rs`:
```rust
use std::{sync::Arc, time::Duration};

use np_net::{NetController, NetMode, TorState};
use np_shell::extensions::{HttpPurpose, ShellExtensions};
use np_store::Store;
use np_update::channels::{installer_url, manifest_url, Channel};
use serde::Serialize;
use tauri::{App, AppHandle, Emitter, Manager, State, Url};
use tauri_plugin_updater::{Update, UpdaterExt};
use tokio::sync::Mutex;

use super::{rollback_installer, SystemState};
use crate::commands::{CmdError, CmdResult};

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "state", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum UpdateStatus {
    Idle,
    Checking,
    UpToDate { checked_at: i64 },
    Downloading { version: String, received: u64, total: Option<u64> },
    Ready { version: String, notes: Option<String>, date: Option<String> },
    TorUnavailable,
    Error { message: String },
}

#[derive(Default)]
pub struct UpdaterState {
    pub status: std::sync::Mutex<Option<UpdateStatus>>,
    pub ready: Mutex<Option<(Update, Vec<u8>)>>,
    pub running: Mutex<()>,
}

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn set(app: &AppHandle, s: UpdateStatus) {
    *app.state::<Arc<UpdaterState>>().status.lock().expect("lock") = Some(s.clone());
    let _ = app.emit_to("ui", "update://status", s);
}

fn channel(store: &Store) -> Channel {
    Channel::parse(&store.get_setting::<String>("device.updates.channel").ok().flatten().unwrap_or_default())
}

fn updater_pubkey(app: &AppHandle) -> Option<String> {
    app.config().plugins.0.get("updater").and_then(|v| v.get("pubkey")).and_then(|v| v.as_str()).map(str::to_string)
}

/// Guarda el instalador firmado de la versión actual para poder volver atrás (§17).
async fn keep_rollback_installer(app: &AppHandle) -> Result<(), String> {
    let sys = app.state::<Arc<SystemState>>();
    let path = rollback_installer(&sys.data_dir, &sys.version);
    if path.exists() {
        return Ok(());
    }
    let client = app.state::<Arc<ShellExtensions>>().http_client(HttpPurpose::Updates)?;
    let url = installer_url(&sys.version);
    let bytes = client.get(&url).send().await.map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?.bytes().await.map_err(|e| e.to_string())?;
    let sig_b64 = client.get(format!("{url}.sig")).send().await.map_err(|e| e.to_string())?.text().await.map_err(|e| e.to_string())?;
    let pubkey = np_update::sig::decode_tauri(&updater_pubkey(app).ok_or("missing updater pubkey")?).map_err(|e| e.to_string())?;
    let signature = np_update::sig::decode_tauri(&sig_b64).map_err(|e| e.to_string())?;
    np_update::sig::verify(&pubkey, &bytes, &signature).map_err(|e| e.to_string())?; // nunca sin firma válida
    std::fs::create_dir_all(path.parent().expect("parent")).map_err(|e| e.to_string())?;
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    // Solo se conserva un instalador de vuelta atrás.
    if let Ok(entries) = std::fs::read_dir(path.parent().expect("parent")) {
        for e in entries.flatten() {
            if e.path() != path {
                let _ = std::fs::remove_file(e.path());
            }
        }
    }
    Ok(())
}

pub async fn check(app: AppHandle) {
    let st = app.state::<Arc<UpdaterState>>().inner().clone();
    let Ok(_guard) = st.running.try_lock() else { return };
    if st.ready.lock().await.is_some() {
        return;
    }
    let net = app.state::<Arc<NetController>>().inner().clone();
    let store = app.state::<Arc<Store>>().inner().clone();
    let sys = app.state::<Arc<SystemState>>().inner().clone();
    let status = net.status();
    let mut builder = match app.updater_builder().endpoints(vec![Url::parse(manifest_url(channel(&store))).expect("static url")]) {
        Ok(b) => b.timeout(Duration::from_secs(120)),
        Err(e) => return set(&app, UpdateStatus::Error { message: e.to_string() }),
    };
    if status.mode == NetMode::Tor {
        if !matches!(status.tor, TorState::Ready) {
            return set(&app, UpdateStatus::TorUnavailable); // nunca se cae a directo (§4.2)
        }
        builder = builder.proxy(Url::parse(&format!("socks5h://127.0.0.1:{}", net.socks_port())).expect("proxy url"));
    }
    let skipped = sys.boot.lock().expect("lock").state().skipped.clone();
    builder = builder.version_comparator(move |current, remote| remote.version > current && !skipped.contains(&remote.version.to_string()));
    set(&app, UpdateStatus::Checking);
    let updater = match builder.build() {
        Ok(u) => u,
        Err(e) => return set(&app, UpdateStatus::Error { message: e.to_string() }),
    };
    match updater.check().await {
        Ok(None) => set(&app, UpdateStatus::UpToDate { checked_at: now() }),
        Err(e) => set(&app, UpdateStatus::Error { message: e.to_string() }),
        Ok(Some(update)) => {
            let version = update.version.clone();
            let app2 = app.clone();
            let mut received = 0u64;
            let bytes = update
                .download(
                    |chunk, total| {
                        received += chunk as u64;
                        set(&app2, UpdateStatus::Downloading { version: version.clone(), received, total });
                    },
                    || {},
                )
                .await;
            let bytes = match bytes {
                Ok(b) => b,
                Err(e) => return set(&app, UpdateStatus::Error { message: e.to_string() }),
            };
            if let Err(e) = keep_rollback_installer(&app).await {
                tracing::warn!(error = %e, "could not keep rollback installer; update postponed");
                return set(&app, UpdateStatus::Error { message: e });
            }
            let notes = update.body.clone();
            if let Some(n) = &notes {
                let _ = std::fs::write(sys.data_dir.join("updates").join(format!("notes-{version}.md")), n);
            }
            let date = update.date.map(|d| d.to_string());
            *st.ready.lock().await = Some((update, bytes));
            set(&app, UpdateStatus::Ready { version, notes, date });
        }
    }
}

/// Instala la actualización descargada. En Windows la app se cierra y el instalador la vuelve a abrir.
pub async fn install(app: &AppHandle) -> Result<(), String> {
    let st = app.state::<Arc<UpdaterState>>().inner().clone();
    let Some((update, bytes)) = st.ready.lock().await.take() else { return Err("no update ready".into()) };
    let sys = app.state::<Arc<SystemState>>();
    {
        let mut g = sys.boot.lock().expect("lock");
        g.record_update(&sys.version, &update.version);
        g.save().map_err(|e| e.to_string())?;
    }
    update.install(bytes).map_err(|e| e.to_string())
}

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(Arc::new(UpdaterState::default()));
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(30)).await;
        loop {
            check(handle.clone()).await;
            tokio::time::sleep(Duration::from_secs(24 * 3600)).await;
        }
    });
    Ok(())
}

/// `RunEvent::ExitRequested`: si hay actualización lista, se aplica al cerrar (§17 "aplicación al reiniciar").
pub fn on_exit(app: &AppHandle) {
    let st = app.state::<Arc<UpdaterState>>().inner().clone();
    if st.ready.try_lock().map(|g| g.is_some()).unwrap_or(false) {
        let _ = tauri::async_runtime::block_on(install(app));
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WhatsNew {
    pub version: String,
    pub notes: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub status: UpdateStatus,
    pub current: String,
    pub channel: Channel,
    pub whats_new: Option<WhatsNew>,
}

#[tauri::command]
pub async fn update_status(app: AppHandle, st: State<'_, Arc<UpdaterState>>, sys: State<'_, Arc<SystemState>>, store: State<'_, Arc<Store>>) -> CmdResult<UpdateInfo> {
    let seen = store.get_setting::<String>("device.updates.notesSeen").ok().flatten();
    let notes_path = sys.data_dir.join("updates").join(format!("notes-{}.md", sys.version));
    let whats_new = if seen.as_deref() != Some(sys.version.as_str()) {
        std::fs::read_to_string(&notes_path).ok().map(|notes| WhatsNew { version: sys.version.clone(), notes })
    } else {
        None
    };
    let _ = app;
    Ok(UpdateInfo { status: st.status.lock().expect("lock").clone().unwrap_or(UpdateStatus::Idle), current: sys.version.clone(), channel: channel(&store), whats_new })
}

#[tauri::command]
pub async fn update_check(app: AppHandle) -> CmdResult<()> {
    tauri::async_runtime::spawn(check(app));
    Ok(())
}

#[tauri::command]
pub async fn update_install_now(app: AppHandle) -> CmdResult<()> {
    install(&app).await.map_err(|e| CmdError::new("update", e))
}

#[tauri::command]
pub async fn update_set_channel(app: AppHandle, store: State<'_, Arc<Store>>, channel: Channel) -> CmdResult<()> {
    store.set_setting("device.updates.channel", &channel)?;
    tauri::async_runtime::spawn(check(app));
    Ok(())
}

#[tauri::command]
pub async fn update_ack_notes(sys: State<'_, Arc<SystemState>>, store: State<'_, Arc<Store>>) -> CmdResult<()> {
    store.set_setting("device.updates.notesSeen", &sys.version)?;
    Ok(())
}
```

> `remote.version > current` compara `semver::Version` (los dos parámetros del comparador lo son). Si el `reqwest` interno del plugin no admite `socks5h://` (comprobar al primer arranque con Tor), `check` devuelve `Error` y **no** se reintenta en directo: es el comportamiento buscado; la UI dice que la comprobación por Tor no está disponible y se puede cambiar de modo a mano.

En `src-tauri/src/lib.rs`, sustituye `.run(tauri::generate_context!())…` por:
```rust
        .build(tauri::generate_context!())
        .expect("error while building newpaper")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { .. } = event {
                crate::system::updater::on_exit(app);
            }
        });
```

- [ ] **Step 2: Registro**

`APP_COMMANDS`: `"update_status", "update_check", "update_install_now", "update_set_channel", "update_ack_notes"`; `generate_handler!`: `system::updater::update_status, system::updater::update_check, system::updater::update_install_now, system::updater::update_set_channel, system::updater::update_ack_notes`; `capabilities/ui.json`: `"allow-update-status", "allow-update-check", "allow-update-install-now", "allow-update-set-channel", "allow-update-ack-notes"`.

- [ ] **Step 3: Comprobar que compila**

Run: `cargo check --manifest-path src-tauri/Cargo.toml -p np-app`
Expected: compila sin errores.

- [ ] **Step 4: Commit**

```powershell
git add src-tauri
git commit -m "feat(system): app updater with channels, tor-only proxy, background download, notes and verified rollback installer"
```

---

### Task 7: Actualizaciones de contenido — descarga por el cliente `Updates`, verificación, aplicación y reversión

**Files:**
- Modify: `src-tauri/src/system/content.rs`, `src-tauri/build.rs`, `src-tauri/capabilities/ui.json`, `src-tauri/src/lib.rs`
- Create: `keys/content.pub`

**Interfaces:**
- Consumes: `np_update::{content, repo, channels::CONTENT_MANIFEST_URL}` (T3–T4), `ShellExtensions::http_client(HttpPurpose::Updates)`.
- Produces:
  - `CONTENT_PUBKEY: &str = include_str!("../../../keys/content.pub")`
  - Comandos: `content_status() -> { version: number | null; history: ContentUpdate[]; lastCheck: number | null; lastError: string | null }`, `content_check_now() -> { applied: string[] }`, `content_revert()`
  - Evento `content://applied` (`{ version, resources }`); comprobación 60 s tras arrancar y cada 24 h

- [ ] **Step 1: Clave pública de contenido**

Genera el par fuera del repositorio y guarda solo la pública:
```powershell
cargo install rsign2 --version 0.6.7 --locked
rsign generate -p keys/content.pub -s "$env:USERPROFILE\.newpaper-keys\content.key"
```
Expected: `keys/content.pub` con dos líneas (`untrusted comment: minisign public key …` y la clave base64). La secreta queda en tu perfil, **nunca** en el repo.

> `rsign2` escribe claves en el formato minisign que leen `minisign-verify` y `np-content-sign` (con contraseña: exporta `NP_CONTENT_KEY_PASSWORD` al firmar).

- [ ] **Step 2: Implementación**

`src-tauri/src/system/content.rs`:
```rust
use std::{sync::Arc, time::Duration};

use np_shell::extensions::{HttpPurpose, ShellExtensions};
use np_store::Store;
use np_update::{
    channels::CONTENT_MANIFEST_URL,
    content::{parse_verified, ContentDir},
    repo::{self, ContentUpdate},
};
use serde::Serialize;
use tauri::{App, AppHandle, Emitter, Manager, State};

use crate::commands::{CmdError, CmdResult};

pub const CONTENT_PUBKEY: &str = include_str!("../../../keys/content.pub");
const MAX_RESOURCE: usize = 20 * 1024 * 1024;

#[derive(Default)]
pub struct ContentState {
    pub last_check: std::sync::Mutex<Option<i64>>,
    pub last_error: std::sync::Mutex<Option<String>>,
    pub running: tokio::sync::Mutex<()>,
}

fn dir(app: &AppHandle) -> Result<ContentDir, String> {
    Ok(ContentDir::new(&app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("content")))
}

async fn fetch(client: &reqwest::Client, url: &str) -> Result<Vec<u8>, String> {
    let r = client.get(url).send().await.map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?;
    let b = r.bytes().await.map_err(|e| e.to_string())?;
    if b.len() > MAX_RESOURCE {
        return Err(format!("resource too large: {url}"));
    }
    Ok(b.to_vec())
}

pub async fn check_now(app: &AppHandle) -> Result<Vec<String>, String> {
    let st = app.state::<Arc<ContentState>>().inner().clone();
    let _g = st.running.lock().await;
    let client = app.state::<Arc<ShellExtensions>>().http_client(HttpPurpose::Updates)?;
    let result = async {
        let manifest_bytes = fetch(&client, CONTENT_MANIFEST_URL).await?;
        let sig = String::from_utf8(fetch(&client, &format!("{CONTENT_MANIFEST_URL}.minisig")).await?).map_err(|e| e.to_string())?;
        let manifest = parse_verified(CONTENT_PUBKEY, &manifest_bytes, &sig).map_err(|e| e.to_string())?;
        let cd = dir(app)?;
        if cd.current_manifest().is_some_and(|m| m.version >= manifest.version) {
            return Ok(vec![]);
        }
        let mut fetched = Vec::new();
        for r in cd.plan(&manifest) {
            fetched.push((r.name.clone(), fetch(&client, &r.url).await?));
        }
        let names: Vec<String> = fetched.iter().map(|(n, _)| n.clone()).collect();
        let staging = cd.stage(&manifest, &fetched).map_err(|e| e.to_string())?;
        cd.commit(&staging).map_err(|e| e.to_string())?;
        let store = app.state::<Arc<Store>>();
        let _ = repo::record(&store, &ContentUpdate { manifest_version: manifest.version, applied_at: chrono::Utc::now().timestamp_millis(), action: "apply".into(), resources: names.clone() });
        let _ = app.emit_to("ui", "content://applied", serde_json::json!({ "version": manifest.version, "resources": names }));
        Ok(names)
    }
    .await;
    *st.last_check.lock().expect("lock") = Some(chrono::Utc::now().timestamp_millis());
    *st.last_error.lock().expect("lock") = result.as_ref().err().cloned();
    result
}

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    app.manage(Arc::new(ContentState::default()));
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(60)).await;
        loop {
            if let Err(e) = check_now(&handle).await {
                tracing::info!(error = %e, "content update check failed");
            }
            tokio::time::sleep(Duration::from_secs(24 * 3600)).await;
        }
    });
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentStatus {
    pub version: Option<u32>,
    pub history: Vec<ContentUpdate>,
    pub last_check: Option<i64>,
    pub last_error: Option<String>,
}

#[tauri::command]
pub async fn content_status(app: AppHandle, st: State<'_, Arc<ContentState>>, store: State<'_, Arc<Store>>) -> CmdResult<ContentStatus> {
    let cd = dir(&app).map_err(|e| CmdError::new("io", e))?;
    Ok(ContentStatus {
        version: cd.current_manifest().map(|m| m.version),
        history: repo::history(&store, 20).map_err(|e| CmdError::new("sql", e.to_string()))?,
        last_check: *st.last_check.lock().expect("lock"),
        last_error: st.last_error.lock().expect("lock").clone(),
    })
}

#[tauri::command]
pub async fn content_check_now(app: AppHandle) -> CmdResult<Vec<String>> {
    check_now(&app).await.map_err(|e| CmdError::new("content", e))
}

#[tauri::command]
pub async fn content_revert(app: AppHandle, store: State<'_, Arc<Store>>) -> CmdResult<()> {
    let cd = dir(&app).map_err(|e| CmdError::new("io", e))?;
    cd.revert().map_err(|e| CmdError::new("content", e.to_string()))?;
    let version = cd.current_manifest().map(|m| m.version).unwrap_or(0);
    let _ = repo::record(&store, &ContentUpdate { manifest_version: version, applied_at: chrono::Utc::now().timestamp_millis(), action: "revert".into(), resources: vec![] });
    let _ = app.emit_to("ui", "content://applied", serde_json::json!({ "version": version, "resources": [] }));
    Ok(())
}
```

> `read_config_text` (subproyecto 1) ya lee primero `<app_local_data>/content/current/<name>`: tras `commit`, cada lectura nueva ve el contenido nuevo. Lo que se cargó al arrancar (índice de medios, partidos en memoria) se refresca en el siguiente arranque; la UI recarga sus cachés con `content://applied` (Tarea 11).

- [ ] **Step 3: Registro**

`APP_COMMANDS`: `"content_status", "content_check_now", "content_revert"`; `generate_handler!`: `system::content::content_status, system::content::content_check_now, system::content::content_revert`; `capabilities/ui.json`: `"allow-content-status", "allow-content-check-now", "allow-content-revert"`.

- [ ] **Step 4: Comprobar que compila**

Run: `cargo check --manifest-path src-tauri/Cargo.toml -p np-app`
Expected: compila sin errores.

- [ ] **Step 5: Commit**

```powershell
git add src-tauri keys/content.pub
git commit -m "feat(system): signed content updates over the updates client with atomic apply, history and revert"
```

---

### Task 8: Primer arranque — iniciar con Windows, navegador candidato, marcadores, Tor y modelo local

**Files:**
- Modify: `src-tauri/src/system/firstrun.rs`, `src-tauri/build.rs`, `src-tauri/capabilities/ui.json`, `src-tauri/src/lib.rs`

**Interfaces:**
- Consumes: `tauri_plugin_autostart::ManagerExt`, `OutletIndex` (1), `Store`.
- Produces:
  - `first_run_status() -> { done: boolean; browsers: ('edge' | 'chrome' | 'brave')[]; ollama: boolean; autostart: boolean }`
  - `first_run_apply(opts: { autostart: boolean; tor: boolean }) -> null` (y `device.firstRunDone = true`)
  - `bookmarks_scan(browser) -> { url; title }[]` (solo dominios de medios conocidos; como mucho 200)
  - `ollama_pull(model: string) -> null` con eventos `ollama://progress` (`{ status, completed, total }`)
  - `open_default_apps() -> null` (abre `ms-settings:defaultapps`)

- [ ] **Step 1: Implementación**

`src-tauri/src/system/firstrun.rs`:
```rust
use std::{path::PathBuf, sync::Arc};

use futures::StreamExt;
use np_store::Store;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_autostart::ManagerExt;

use crate::{
    commands::{CmdError, CmdResult},
    config::OutletIndex,
};

pub fn setup(_app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    Ok(())
}

fn bookmarks_file(browser: &str) -> Option<PathBuf> {
    let base = PathBuf::from(std::env::var_os("LOCALAPPDATA")?);
    let rel = match browser {
        "edge" => "Microsoft/Edge/User Data/Default/Bookmarks",
        "chrome" => "Google/Chrome/User Data/Default/Bookmarks",
        "brave" => "BraveSoftware/Brave-Browser/User Data/Default/Bookmarks",
        _ => return None,
    };
    Some(base.join(rel))
}

async fn ollama_running() -> bool {
    let Ok(c) = reqwest::Client::builder().no_proxy().timeout(std::time::Duration::from_millis(800)).build() else { return false };
    c.get("http://127.0.0.1:11434/api/tags").send().await.is_ok_and(|r| r.status().is_success())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FirstRunStatus {
    pub done: bool,
    pub browsers: Vec<String>,
    pub ollama: bool,
    pub autostart: bool,
}

#[tauri::command]
pub async fn first_run_status(app: AppHandle, store: State<'_, Arc<Store>>) -> CmdResult<FirstRunStatus> {
    Ok(FirstRunStatus {
        done: store.get_setting::<bool>("device.firstRunDone")?.unwrap_or(false),
        browsers: ["edge", "chrome", "brave"].iter().filter(|b| bookmarks_file(b).is_some_and(|p| p.exists())).map(|b| b.to_string()).collect(),
        ollama: ollama_running().await,
        autostart: app.autolaunch().is_enabled().unwrap_or(false),
    })
}

#[derive(Deserialize)]
pub struct FirstRunOptions {
    pub autostart: bool,
    pub tor: bool,
}

#[tauri::command]
pub async fn first_run_apply(app: AppHandle, store: State<'_, Arc<Store>>, opts: FirstRunOptions) -> CmdResult<()> {
    let al = app.autolaunch();
    let r = if opts.autostart { al.enable() } else { al.disable() };
    r.map_err(|e| CmdError::new("autostart", e.to_string()))?;
    if opts.tor {
        store.set_setting("privacy.mode", &"tor")?; // el subproyecto 2 observa este ajuste y arranca Arti
    }
    store.set_setting("device.firstRunDone", &true)?;
    Ok(())
}

#[derive(Serialize)]
pub struct Bookmark {
    pub url: String,
    pub title: String,
}

fn walk(node: &serde_json::Value, out: &mut Vec<Bookmark>) {
    match node.get("type").and_then(|t| t.as_str()) {
        Some("url") => {
            if let (Some(url), Some(name)) = (node.get("url").and_then(|v| v.as_str()), node.get("name").and_then(|v| v.as_str())) {
                out.push(Bookmark { url: url.into(), title: name.into() });
            }
        }
        _ => {
            if let Some(children) = node.get("children").and_then(|c| c.as_array()) {
                for c in children {
                    walk(c, out);
                }
            }
        }
    }
}

#[tauri::command]
pub async fn bookmarks_scan(outlets: State<'_, Arc<OutletIndex>>, browser: String) -> CmdResult<Vec<Bookmark>> {
    let path = bookmarks_file(&browser).ok_or_else(|| CmdError::new("bookmarks", "unknown browser"))?;
    let text = std::fs::read_to_string(&path).map_err(|e| CmdError::new("bookmarks", e.to_string()))?;
    let json: serde_json::Value = serde_json::from_str(&text).map_err(|e| CmdError::new("bookmarks", e.to_string()))?;
    let mut all = Vec::new();
    if let Some(roots) = json.get("roots").and_then(|r| r.as_object()) {
        for v in roots.values() {
            walk(v, &mut all);
        }
    }
    let domains = outlets.domains();
    let is_news = |u: &str| {
        url::Url::parse(u).ok().and_then(|x| x.host_str().map(str::to_ascii_lowercase)).is_some_and(|h| domains.iter().any(|d| h == *d || h.ends_with(&format!(".{d}"))))
    };
    Ok(all.into_iter().filter(|b| is_news(&b.url)).take(200).collect())
}

#[tauri::command]
pub async fn ollama_pull(app: AppHandle, model: String) -> CmdResult<()> {
    let c = reqwest::Client::builder().no_proxy().build().map_err(|e| CmdError::new("ollama", e.to_string()))?;
    let resp = c
        .post("http://127.0.0.1:11434/api/pull")
        .json(&serde_json::json!({ "model": model, "stream": true }))
        .send()
        .await
        .map_err(|e| CmdError::new("ollama", e.to_string()))?;
    let mut stream = resp.bytes_stream();
    let mut buf = Vec::new();
    while let Some(chunk) = stream.next().await {
        buf.extend_from_slice(&chunk.map_err(|e| CmdError::new("ollama", e.to_string()))?);
        while let Some(i) = buf.iter().position(|b| *b == b'\n') {
            let line: Vec<u8> = buf.drain(..=i).collect();
            if let Ok(v) = serde_json::from_slice::<serde_json::Value>(&line) {
                let _ = app.emit_to("ui", "ollama://progress", v);
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn open_default_apps() -> CmdResult<()> {
    std::process::Command::new("cmd").args(["/C", "start", "", "ms-settings:defaultapps"]).spawn().map_err(|e| CmdError::new("system", e.to_string()))?;
    Ok(())
}
```

> `Arc<OutletIndex>` es el estado que gestiona el subproyecto 1 (`app.manage(outlets.clone())`); si no se gestiona, añade esa línea en `setup.rs`. El progreso de Ollama llega como líneas JSON (`{"status":"pulling …","completed":…,"total":…}`) y se reenvía tal cual. Los marcadores se descargan e importan desde la UI (Tarea 12), que reutiliza la extracción y `saved_add` del subproyecto 3.

- [ ] **Step 2: Registro**

`APP_COMMANDS`: `"first_run_status", "first_run_apply", "bookmarks_scan", "ollama_pull", "open_default_apps"`; `generate_handler!`: `system::firstrun::first_run_status, system::firstrun::first_run_apply, system::firstrun::bookmarks_scan, system::firstrun::ollama_pull, system::firstrun::open_default_apps`; `capabilities/ui.json`: `"allow-first-run-status", "allow-first-run-apply", "allow-bookmarks-scan", "allow-ollama-pull", "allow-open-default-apps"`.

- [ ] **Step 3: Comprobar que compila**

Run: `cargo check --manifest-path src-tauri/Cargo.toml -p np-app`
Expected: compila sin errores.

- [ ] **Step 4: Commit**

```powershell
git add src-tauri
git commit -m "feat(system): first-run backend for autostart, tor, bookmark scan, ollama pull and default apps"
```

---

### Task 9: Instalador NSIS (es/en/de), firma del actualizador y herramientas de publicación

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Create: `src-tauri/nsis/installer-hooks.nsh`, `scripts/make-installer-art.mjs`, `scripts/release-manifest.mjs`

**Interfaces:**
- Produces: instalador `newpaper_<v>_x64-setup.exe` por usuario con selector de idioma (español por defecto, inglés y alemán), imágenes de marca, registro como navegador candidato en `HKCU` y limpieza al desinstalar; artefactos de actualización firmados (`.sig`) y `latest.json` por canal.

- [ ] **Step 1: Configuración**

En `src-tauri/tauri.conf.json`:
```json
{
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "createUpdaterArtifacts": true,
    "publisher": "newpaper",
    "windows": {
      "nsis": {
        "installMode": "currentUser",
        "languages": ["Spanish", "English", "German"],
        "displayLanguageSelector": true,
        "headerImage": "nsis/header.bmp",
        "sidebarImage": "nsis/sidebar.bmp",
        "installerIcon": "icons/icon.ico",
        "installerHooks": "nsis/installer-hooks.nsh",
        "startMenuFolder": "newpaper"
      }
    }
  },
  "plugins": {
    "updater": {
      "pubkey": "<contenido del fichero .pub generado en el Step 3, tal cual>",
      "endpoints": ["https://github.com/nickespro130/newpaper/releases/latest/download/latest.json"],
      "windows": { "installMode": "passive" }
    }
  }
}
```

> Mezcla estas claves con las existentes del subproyecto 1 (no sustituyas `app`, `build` ni `identifier`). El valor de `pubkey` es la salida de `tauri signer generate` (Step 3); no es un secreto. Los nombres de idioma son los de los ficheros de idioma NSIS que trae Tauri (`Spanish`, `English`, `German`); si `tauri build` avisa de que alguno no existe, consulta la lista de `tauri-bundler` y anota el cambio.

- [ ] **Step 2: Ganchos NSIS**

`src-tauri/nsis/installer-hooks.nsh`:
```nsis
; Registro de newpaper como navegador candidato (por usuario). El usuario lo elige en
; Configuración › Aplicaciones predeterminadas; Windows no permite asociar solo dominios de noticias.
!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr HKCU "Software\Classes\newpaperURL" "" "newpaper URL"
  WriteRegStr HKCU "Software\Classes\newpaperURL" "URL Protocol" ""
  WriteRegStr HKCU "Software\Classes\newpaperURL\DefaultIcon" "" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr HKCU "Software\Classes\newpaperURL\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\newpaper" "" "newpaper"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\newpaper\DefaultIcon" "" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\newpaper\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe"'
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\newpaper\Capabilities" "ApplicationName" "newpaper"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\newpaper\Capabilities" "ApplicationDescription" "newpaper"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\newpaper\Capabilities\URLAssociations" "http" "newpaperURL"
  WriteRegStr HKCU "Software\Clients\StartMenuInternet\newpaper\Capabilities\URLAssociations" "https" "newpaperURL"
  WriteRegStr HKCU "Software\RegisteredApplications" "newpaper" "Software\Clients\StartMenuInternet\newpaper\Capabilities"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey HKCU "Software\Classes\newpaperURL"
  DeleteRegKey HKCU "Software\Clients\StartMenuInternet\newpaper"
  DeleteRegValue HKCU "Software\RegisteredApplications" "newpaper"
!macroend
```

> `${MAINBINARYNAME}` lo define la plantilla NSIS de Tauri 2; si `tauri build` no lo encuentra, sustitúyelo por el nombre del ejecutable (`np-app`). En una actualización (`/UPDATER`), el gancho de desinstalación no se ejecuta, así que el registro se conserva.

- [ ] **Step 3: Claves de firma del actualizador**

Run:
```powershell
pnpm tauri signer generate -w "$env:USERPROFILE\.newpaper-keys\updater.key"
```
Expected: escribe `updater.key` (secreta, con contraseña) y `updater.key.pub`. Copia el contenido de `updater.key.pub` en `plugins.updater.pubkey`. Para compilar con firma: `$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$env:USERPROFILE\.newpaper-keys\updater.key" -Raw` y `$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = '<tu contraseña>'` en la sesión (o como secretos de CI). Ninguna clave secreta entra en el repositorio.

- [ ] **Step 4: Imágenes del instalador**

`scripts/make-installer-art.mjs`:
```js
// Genera las imágenes BMP de 24 bits del instalador con la paleta papel/tinta (sin dependencias).
import { writeFileSync } from 'node:fs';

const PAPER = [0xf6, 0xf4, 0xef];
const INK = [0x17, 0x17, 0x1a];
const ACCENT = [0x23, 0x40, 0xb8];

function bmp(w, h, pixel) {
  const row = Math.ceil((w * 3) / 4) * 4;
  const size = 54 + row * h;
  const b = Buffer.alloc(size);
  b.write('BM', 0);
  b.writeUInt32LE(size, 2);
  b.writeUInt32LE(54, 10);
  b.writeUInt32LE(40, 14);
  b.writeInt32LE(w, 18);
  b.writeInt32LE(h, 22);
  b.writeUInt16LE(1, 26);
  b.writeUInt16LE(24, 28);
  b.writeUInt32LE(row * h, 34);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, bl] = pixel(x, h - 1 - y);
      const o = 54 + y * row + x * 3;
      b[o] = bl;
      b[o + 1] = g;
      b[o + 2] = r;
    }
  }
  return b;
}

// Cabecera 150×57: papel con una línea de tinta abajo y un bloque de acento (la "n" de la marca).
writeFileSync('src-tauri/nsis/header.bmp', bmp(150, 57, (x, y) => (y >= 54 ? INK : x >= 118 && x < 140 && y >= 14 && y < 44 ? ACCENT : PAPER)));
// Lateral 164×314: columna de tinta con filetes de periódico sobre papel.
writeFileSync('src-tauri/nsis/sidebar.bmp', bmp(164, 314, (x, y) => (x < 12 ? INK : y % 24 === 0 && x > 24 && x < 140 ? INK : y > 40 && y < 70 && x > 24 && x < 60 ? ACCENT : PAPER)));
console.log('installer art written');
```

Run: `node scripts/make-installer-art.mjs`
Expected: `installer art written`; dos BMP en `src-tauri/nsis/`.

- [ ] **Step 5: Manifiesto de versiones por canal**

`scripts/release-manifest.mjs`:
```js
// Uso: node scripts/release-manifest.mjs <version> <stable|beta> "<notas>"
// Lee el .sig que genera `tauri build` y escribe dist/latest.json en el formato estático del actualizador de Tauri.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const [version, channel = 'stable', notes = ''] = process.argv.slice(2);
if (!version) throw new Error('version required');
const file = `newpaper_${version}_x64-setup.exe`;
const signature = readFileSync(`src-tauri/target/release/bundle/nsis/${file}.sig`, 'utf8').trim();
const tag = channel === 'beta' ? 'beta' : `v${version}`;
const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: { 'windows-x86_64': { signature, url: `https://github.com/nickespro130/newpaper/releases/download/${tag}/${file}` } },
};
mkdirSync('dist', { recursive: true });
writeFileSync('dist/latest.json', JSON.stringify(manifest, null, 2));
console.log(`dist/latest.json for ${channel} ${version}`);
```

> Publicación: estable → release `v<versión>` con el instalador, su `.sig` y `latest.json` (marcada como "latest"); beta → mismos ficheros en la release con etiqueta `beta` (se reemplazan en cada beta). Contenido → `np-content-sign` y subir `manifest.json`, `manifest.json.minisig` y los `*.vN.json` a la release `content`.

- [ ] **Step 6: Compilar el instalador**

Run:
```powershell
pnpm --filter @newpaper/ui build
pnpm tauri build
node scripts/release-manifest.mjs 0.1.0 stable "Primera versión"
```
Expected: `src-tauri/target/release/bundle/nsis/newpaper_0.1.0_x64-setup.exe` y su `.sig`; el instalador abre el selector de idioma (Español, English, Deutsch) y se instala sin pedir permisos de administrador; `dist/latest.json` contiene la firma.

- [ ] **Step 7: Commit**

```powershell
git add src-tauri/tauri.conf.json src-tauri/nsis scripts/make-installer-art.mjs scripts/release-manifest.mjs
git commit -m "build: per-user nsis installer in three languages with browser registration, updater signing and release manifest"
```

---
### Task 10: Textos del sistema (es, en, de), incluidos los chistes de la fe de erratas

**Files:**
- Modify: `packages/i18n/locales/es.json`, `packages/i18n/locales/en.json`, `packages/i18n/locales/de.json`

**Interfaces:**
- Produces: espacios `updates`, `firstRun`, `tour`, `pages` y, dentro de `settings`, `updates` y `help`. Los chistes de cada columna de la 404 son propios de cada idioma (§14), no traducciones literales.

- [ ] **Step 1: Español**

Añade al nivel raíz de `packages/i18n/locales/es.json`:
```json
"updates": {
  "current": "Versión instalada: {version}",
  "channel": { "label": "Canal", "stable": "Estable", "beta": "Beta", "stableHint": "Versiones probadas. Recomendado.", "betaHint": "Novedades antes que nadie, con algún fallo posible." },
  "status": {
    "idle": "Sin comprobar todavía.",
    "checking": "Buscando actualizaciones…",
    "upToDate": "Tienes la última versión (comprobado {when}).",
    "downloading": "Descargando la versión {version}: {percent} %",
    "ready": "La versión {version} está lista. Se instalará al cerrar newpaper.",
    "torUnavailable": "Tor no está disponible: no se comprueba nada por conexión directa.",
    "error": "No se ha podido comprobar: {message}"
  },
  "check": "Buscar actualizaciones",
  "installNow": "Reiniciar y actualizar",
  "signedNote": "Solo se instalan paquetes con firma válida de newpaper.",
  "whatsNew": "Novedades de la versión {version}",
  "rolledBack": { "title": "Se ha vuelto a la versión anterior", "body": "La versión {version} no arrancaba bien, así que se ha restaurado la anterior. No se volverá a ofrecer." },
  "close": "Entendido",
  "content": {
    "title": "Contenido",
    "version": "Contenido actualizado: versión {version}",
    "bundled": "Contenido de serie de esta versión",
    "check": "Buscar actualizaciones de contenido",
    "revert": "Revertir el último cambio",
    "error": "La última comprobación falló: {message}",
    "applied": "Versión {version} aplicada ({n} ficheros)",
    "reverted": "Revertido a la versión {version}"
  }
},
"firstRun": {
  "title": "Antes de empezar",
  "subtitle": "Unas pocas preferencias. Puedes cambiarlas cuando quieras en Ajustes.",
  "autostart": "Iniciar con Windows",
  "autostartHint": "newpaper se abre al encender el equipo.",
  "tor": "Navegar por Tor desde el principio",
  "torHint": "Más privado, algo más lento. Elige el país de salida cuando quieras.",
  "links": "Abrir enlaces de noticias con newpaper",
  "linksHint": "Windows te deja elegirlo como navegador en sus ajustes.",
  "linksOpen": "Abrir los ajustes de Windows",
  "bookmarks": "Importar marcadores de noticias",
  "bookmarksHint": "Solo los de medios conocidos, para leerlos más tarde.",
  "browser": "Navegador",
  "browsers": { "edge": "Microsoft Edge", "chrome": "Google Chrome", "brave": "Brave" },
  "import": "Importar",
  "imported": "Importados {done} de {total}",
  "model": "Descargar un modelo local",
  "modelHint": "Usa Ollama para descargar {model}: análisis rápidos sin que nada salga de tu equipo.",
  "noOllama": "Para usar modelos en tu equipo, instala Ollama.",
  "modelPull": "Descargar",
  "modelProgress": "Descargando: {pct} %",
  "modelDone": "Modelo listo.",
  "getOllama": "Conseguir Ollama",
  "continue": "Continuar"
},
"tour": {
  "count": "{n} de {total}",
  "skip": "Saltar",
  "start": "Empezar",
  "next": "Siguiente",
  "notVisible": "Lo verás en cuanto abras una noticia.",
  "welcome": { "title": "Bienvenido a newpaper", "body": "Un navegador para leer noticias sabiendo cómo están contadas. En un minuto te enseñamos lo esencial." },
  "topics": { "title": "¿Qué te interesa?", "body": "Sigue algunos temas y verás primero lo que pasa en ellos." },
  "ai": { "title": "¿Con qué inteligencia artificial?", "body": "Puedes analizar solo con modelos de tu equipo o conectar un proveedor para análisis completos.", "local": "Solo en mi equipo", "connect": "Conectar un proveedor" },
  "network": { "title": "¿Cómo te conectas?", "body": "Con Tor, los medios no saben quién eres. Sin Tor, todo va más rápido.", "direct": "Conexión directa", "tor": "Usar Tor" },
  "marks": {
    "lens": { "title": "La lente", "body": "Subraya en el texto las afirmaciones y las frases cargadas." },
    "phrase": { "title": "Una frase", "body": "Pulsa cualquier marca para ver su veredicto y sus fuentes." },
    "score": { "title": "La nota", "body": "Neutralidad de 0 a 100 y la posición del texto frente a cómo lo cuentan otros." },
    "neutral": { "title": "La noticia neutral", "body": "Una versión sin adjetivos ni encuadre, con lo que se sabe y lo que no." },
    "tor": { "title": "Tor", "body": "Aquí ves si navegas por Tor y desde qué país sales." },
    "settings": { "title": "Ajustes", "body": "Proveedores, fuentes, privacidad y este recorrido, cuando quieras." }
  },
  "done": { "title": "Listo", "body": "Abre cualquier noticia y pulsa Analizar. Buena lectura.", "cta": "Empezar a leer" },
  "settingsButton": "Ajustes",
  "repeat": "Repetir el recorrido",
  "repeatHint": "Vuelve a ver la presentación de newpaper."
},
"pages": {
  "netError": {
    "code": "Código {code}",
    "actions": { "retry": "Reintentar", "offlinePage": "Ir a la página sin conexión", "openWithoutTor": "Abrir sin Tor", "archive": "Buscar en la hemeroteca", "back": "Volver" },
    "offline": { "kicker": "Sin conexión", "title": "No hay conexión a internet", "body": "No se ha podido abrir {host}. Mientras vuelve la red, tienes la edición del día y tus guardados." },
    "dns": { "kicker": "Dirección desconocida", "title": "No encontramos esa dirección", "body": "{host} no existe o no responde. Revisa cómo está escrita." },
    "timeout": { "kicker": "Sin respuesta", "title": "La página tarda demasiado", "body": "{host} no ha contestado a tiempo." },
    "unreachable": { "kicker": "Sin respuesta", "title": "No se puede llegar a la página", "body": "{host} no acepta la conexión ahora mismo." },
    "cert": { "kicker": "Conexión no segura", "title": "El certificado de la página no es válido", "body": "No se abre {host} porque alguien podría estar leyendo o cambiando lo que ves. No hay forma de continuar." },
    "torBlocked": { "kicker": "Tor no disponible", "title": "Tor no está listo y nada sale sin él", "body": "Para abrir {host} sin Tor tienes que pedirlo expresamente." },
    "server": { "kicker": "Error del medio", "title": "La web del medio está fallando", "body": "{host} ha devuelto un error. Prueba más tarde o busca una copia en la hemeroteca." },
    "unknown": { "kicker": "Error", "title": "No se ha podido cargar la página", "body": "Algo ha fallado al abrir {host}." }
  },
  "crash": {
    "kicker": "Pestaña detenida",
    "title": "Esta pestaña ha dejado de responder",
    "body": "El resto de newpaper sigue funcionando.",
    "report": "Guardar un informe técnico en este equipo",
    "reportHint": "Solo versión, sistema y memoria. Nunca la dirección ni el contenido.",
    "saved": "Informe guardado.",
    "reload": "Recargar la pestaña"
  },
  "notFound": {
    "kicker": "Fe de erratas",
    "title": "Esta página no existe",
    "lead": "Donde decía «{address}» debía decir otra cosa. Lamentamos el error.",
    "columnsLabel": "Columnas",
    "columns": {
      "erratas": { "title": "Fe de erratas", "body": "En la edición de ayer, donde decía «enlace», debía decir «enlace roto». Donde decía «mañana», debía decir «nunca»." },
      "chiste": { "title": "El chiste", "body": "—¿Cuál es la página más visitada de internet? —La 404: todo el mundo acaba en ella alguna vez." },
      "necrologica": { "title": "Necrológica", "body": "Nos deja esta página, tras una larga vida de enlaces. Sus padres, el servidor y el gestor de contenidos, no saben qué pasó." },
      "anuncio": { "title": "Anuncio por palabras", "body": "Se busca página extraviada. Responde al nombre de «la que buscabas». Se gratificará con una visita." },
      "horoscopo": { "title": "Horóscopo", "body": "Hoy los astros te recomiendan volver atrás. Número de la suerte: 404." },
      "ultimaHora": { "title": "Última hora", "body": "Fuentes consultadas por este diario confirman que la página no está. Ampliaremos." }
    }
  },
  "offline": {
    "kicker": "Sin conexión",
    "title": "Estás sin conexión",
    "body": "Puedes seguir leyendo lo que tienes guardado. Lo que necesite red se hará al volver la conexión.",
    "edition": "Leer la edición del {date}",
    "noEdition": "Todavía no hay ninguna edición descargada.",
    "saved": "Guardado para leer"
  },
  "game": {
    "title": "Tres en raya",
    "board": "Tablero",
    "cell": "Casilla {n}: {value}",
    "empty": "vacía",
    "yourTurn": "Te toca: eres ×",
    "youWin": "Has ganado. Es más raro de lo que parece.",
    "iWin": "He ganado yo.",
    "draw": "Tablas.",
    "again": "Otra partida"
  }
}
```

Y **dentro** de `settings`:
```json
"updates": { "title": "Actualizaciones", "description": "Versión, canal y contenido" },
"help": { "title": "Ayuda", "description": "Recorrido de bienvenida" }
```

- [ ] **Step 2: Inglés**

Añade al nivel raíz de `packages/i18n/locales/en.json`:
```json
"updates": {
  "current": "Installed version: {version}",
  "channel": { "label": "Channel", "stable": "Stable", "beta": "Beta", "stableHint": "Tested releases. Recommended.", "betaHint": "New features first, with the odd bug." },
  "status": {
    "idle": "Not checked yet.",
    "checking": "Checking for updates…",
    "upToDate": "You have the latest version (checked {when}).",
    "downloading": "Downloading version {version}: {percent}%",
    "ready": "Version {version} is ready. It will be installed when you close newpaper.",
    "torUnavailable": "Tor is not available: nothing is checked over a direct connection.",
    "error": "Could not check: {message}"
  },
  "check": "Check for updates",
  "installNow": "Restart and update",
  "signedNote": "Only packages with a valid newpaper signature are installed.",
  "whatsNew": "What’s new in version {version}",
  "rolledBack": { "title": "Rolled back to the previous version", "body": "Version {version} did not start properly, so the previous one was restored. It will not be offered again." },
  "close": "Got it",
  "content": {
    "title": "Content",
    "version": "Updated content: version {version}",
    "bundled": "Content shipped with this version",
    "check": "Check for content updates",
    "revert": "Revert the last change",
    "error": "The last check failed: {message}",
    "applied": "Version {version} applied ({n} files)",
    "reverted": "Reverted to version {version}"
  }
},
"firstRun": {
  "title": "Before you start",
  "subtitle": "A few preferences. You can change them any time in Settings.",
  "autostart": "Start with Windows",
  "autostartHint": "newpaper opens when you turn on your computer.",
  "tor": "Browse through Tor from the start",
  "torHint": "More private, a bit slower. Choose the exit country whenever you like.",
  "links": "Open news links with newpaper",
  "linksHint": "Windows lets you pick it as your browser in its settings.",
  "linksOpen": "Open Windows settings",
  "bookmarks": "Import news bookmarks",
  "bookmarksHint": "Only those from known outlets, saved to read later.",
  "browser": "Browser",
  "browsers": { "edge": "Microsoft Edge", "chrome": "Google Chrome", "brave": "Brave" },
  "import": "Import",
  "imported": "Imported {done} of {total}",
  "model": "Download a local model",
  "modelHint": "Uses Ollama to download {model}: quick analyses without anything leaving your computer.",
  "noOllama": "To use models on your computer, install Ollama.",
  "modelPull": "Download",
  "modelProgress": "Downloading: {pct}%",
  "modelDone": "Model ready.",
  "getOllama": "Get Ollama",
  "continue": "Continue"
},
"tour": {
  "count": "{n} of {total}",
  "skip": "Skip",
  "start": "Start",
  "next": "Next",
  "notVisible": "You will see it as soon as you open a news article.",
  "welcome": { "title": "Welcome to newpaper", "body": "A browser for reading the news knowing how it is told. In a minute we will show you the essentials." },
  "topics": { "title": "What are you into?", "body": "Follow a few topics and you will see what happens in them first." },
  "ai": { "title": "Which artificial intelligence?", "body": "You can analyse with models on your computer only, or connect a provider for full analyses.", "local": "Only on my computer", "connect": "Connect a provider" },
  "network": { "title": "How do you connect?", "body": "With Tor, outlets do not know who you are. Without Tor, everything is faster.", "direct": "Direct connection", "tor": "Use Tor" },
  "marks": {
    "lens": { "title": "The lens", "body": "Underlines claims and loaded phrases in the text." },
    "phrase": { "title": "A phrase", "body": "Tap any mark to see its verdict and its sources." },
    "score": { "title": "The score", "body": "Neutrality from 0 to 100 and where the text stands compared with how others tell it." },
    "neutral": { "title": "The neutral story", "body": "A version without adjectives or framing, with what is known and what is not." },
    "tor": { "title": "Tor", "body": "Here you see whether you browse through Tor and which country you exit from." },
    "settings": { "title": "Settings", "body": "Providers, sources, privacy and this tour, whenever you want." }
  },
  "done": { "title": "All set", "body": "Open any article and press Analyse. Enjoy your reading.", "cta": "Start reading" },
  "settingsButton": "Settings",
  "repeat": "Take the tour again",
  "repeatHint": "See the newpaper introduction once more."
},
"pages": {
  "netError": {
    "code": "Code {code}",
    "actions": { "retry": "Try again", "offlinePage": "Go to the offline page", "openWithoutTor": "Open without Tor", "archive": "Search the archive", "back": "Go back" },
    "offline": { "kicker": "Offline", "title": "No internet connection", "body": "{host} could not be opened. Until the network is back, you have today’s edition and your saved articles." },
    "dns": { "kicker": "Unknown address", "title": "We cannot find that address", "body": "{host} does not exist or does not answer. Check the spelling." },
    "timeout": { "kicker": "No answer", "title": "The page is taking too long", "body": "{host} did not answer in time." },
    "unreachable": { "kicker": "No answer", "title": "The page cannot be reached", "body": "{host} is not accepting connections right now." },
    "cert": { "kicker": "Insecure connection", "title": "The page’s certificate is not valid", "body": "{host} is not opened because someone could be reading or changing what you see. There is no way to continue." },
    "torBlocked": { "kicker": "Tor not available", "title": "Tor is not ready and nothing goes out without it", "body": "To open {host} without Tor you have to ask for it explicitly." },
    "server": { "kicker": "Outlet error", "title": "The outlet’s website is failing", "body": "{host} returned an error. Try later or look for a copy in the archive." },
    "unknown": { "kicker": "Error", "title": "The page could not be loaded", "body": "Something went wrong while opening {host}." }
  },
  "crash": {
    "kicker": "Tab stopped",
    "title": "This tab stopped responding",
    "body": "The rest of newpaper keeps working.",
    "report": "Save a technical report on this computer",
    "reportHint": "Only version, system and memory. Never the address or the content.",
    "saved": "Report saved.",
    "reload": "Reload the tab"
  },
  "notFound": {
    "kicker": "Corrections",
    "title": "This page does not exist",
    "lead": "Where it said “{address}” it should have said something else. We regret the error.",
    "columnsLabel": "Columns",
    "columns": {
      "erratas": { "title": "Corrections", "body": "Yesterday’s edition said “link”. It should have said “broken link”. Where it said “tomorrow”, it should have said “never”." },
      "chiste": { "title": "The joke", "body": "Why did the web page go to therapy? It had a 404: it could not find itself." },
      "necrologica": { "title": "Obituary", "body": "This page has passed away after a long life of links. Its parents, the server and the content management system, are at a loss." },
      "anuncio": { "title": "Classifieds", "body": "Lost: one web page. Answers to “the one you were looking for”. Reward: a visit." },
      "horoscopo": { "title": "Horoscope", "body": "The stars suggest you go back today. Lucky number: 404." },
      "ultimaHora": { "title": "Breaking", "body": "Sources close to this newspaper confirm the page is missing. More to follow." }
    }
  },
  "offline": {
    "kicker": "Offline",
    "title": "You are offline",
    "body": "You can keep reading what you saved. Anything that needs the network will happen when you are back online.",
    "edition": "Read the {date} edition",
    "noEdition": "No edition has been downloaded yet.",
    "saved": "Saved to read"
  },
  "game": {
    "title": "Tic-tac-toe",
    "board": "Board",
    "cell": "Square {n}: {value}",
    "empty": "empty",
    "yourTurn": "Your turn: you are ×",
    "youWin": "You won. That is rarer than it looks.",
    "iWin": "I won.",
    "draw": "Draw.",
    "again": "Play again"
  }
}
```

Y dentro de `settings`:
```json
"updates": { "title": "Updates", "description": "Version, channel and content" },
"help": { "title": "Help", "description": "Welcome tour" }
```

- [ ] **Step 3: Alemán**

Añade al nivel raíz de `packages/i18n/locales/de.json`:
```json
"updates": {
  "current": "Installierte Version: {version}",
  "channel": { "label": "Kanal", "stable": "Stabil", "beta": "Beta", "stableHint": "Geprüfte Versionen. Empfohlen.", "betaHint": "Neues zuerst, mit gelegentlichen Fehlern." },
  "status": {
    "idle": "Noch nicht geprüft.",
    "checking": "Suche nach Updates…",
    "upToDate": "Du hast die neueste Version (geprüft {when}).",
    "downloading": "Version {version} wird geladen: {percent} %",
    "ready": "Version {version} ist bereit. Sie wird beim Schließen von newpaper installiert.",
    "torUnavailable": "Tor ist nicht verfügbar: Über eine direkte Verbindung wird nichts geprüft.",
    "error": "Prüfung nicht möglich: {message}"
  },
  "check": "Nach Updates suchen",
  "installNow": "Neu starten und aktualisieren",
  "signedNote": "Installiert werden nur Pakete mit gültiger newpaper-Signatur.",
  "whatsNew": "Neu in Version {version}",
  "rolledBack": { "title": "Zur vorherigen Version zurückgekehrt", "body": "Version {version} startete nicht richtig, deshalb wurde die vorherige wiederhergestellt. Sie wird nicht erneut angeboten." },
  "close": "Verstanden",
  "content": {
    "title": "Inhalte",
    "version": "Aktualisierte Inhalte: Version {version}",
    "bundled": "Mitgelieferte Inhalte dieser Version",
    "check": "Nach Inhaltsupdates suchen",
    "revert": "Letzte Änderung zurücknehmen",
    "error": "Die letzte Prüfung ist fehlgeschlagen: {message}",
    "applied": "Version {version} angewendet ({n} Dateien)",
    "reverted": "Auf Version {version} zurückgesetzt"
  }
},
"firstRun": {
  "title": "Bevor es losgeht",
  "subtitle": "Ein paar Einstellungen. Du kannst sie jederzeit in den Einstellungen ändern.",
  "autostart": "Mit Windows starten",
  "autostartHint": "newpaper öffnet sich beim Einschalten des Rechners.",
  "tor": "Von Anfang an über Tor surfen",
  "torHint": "Privater, etwas langsamer. Das Ausgangsland wählst du, wann du willst.",
  "links": "Nachrichtenlinks mit newpaper öffnen",
  "linksHint": "Windows lässt dich newpaper in seinen Einstellungen als Browser wählen.",
  "linksOpen": "Windows-Einstellungen öffnen",
  "bookmarks": "Nachrichten-Lesezeichen importieren",
  "bookmarksHint": "Nur die bekannter Medien, zum späteren Lesen gespeichert.",
  "browser": "Browser",
  "browsers": { "edge": "Microsoft Edge", "chrome": "Google Chrome", "brave": "Brave" },
  "import": "Importieren",
  "imported": "{done} von {total} importiert",
  "model": "Lokales Modell herunterladen",
  "modelHint": "Lädt {model} über Ollama: schnelle Analysen, ohne dass etwas deinen Rechner verlässt.",
  "noOllama": "Für Modelle auf deinem Rechner installiere Ollama.",
  "modelPull": "Herunterladen",
  "modelProgress": "Wird geladen: {pct} %",
  "modelDone": "Modell bereit.",
  "getOllama": "Ollama holen",
  "continue": "Weiter"
},
"tour": {
  "count": "{n} von {total}",
  "skip": "Überspringen",
  "start": "Los geht’s",
  "next": "Weiter",
  "notVisible": "Du siehst es, sobald du einen Artikel öffnest.",
  "welcome": { "title": "Willkommen bei newpaper", "body": "Ein Browser, um Nachrichten zu lesen und zu wissen, wie sie erzählt werden. In einer Minute zeigen wir dir das Wichtigste." },
  "topics": { "title": "Was interessiert dich?", "body": "Folge ein paar Themen und du siehst zuerst, was dort passiert." },
  "ai": { "title": "Mit welcher künstlichen Intelligenz?", "body": "Du kannst nur mit Modellen auf deinem Rechner analysieren oder einen Anbieter für vollständige Analysen verbinden.", "local": "Nur auf meinem Rechner", "connect": "Anbieter verbinden" },
  "network": { "title": "Wie verbindest du dich?", "body": "Mit Tor wissen die Medien nicht, wer du bist. Ohne Tor geht alles schneller.", "direct": "Direkte Verbindung", "tor": "Tor nutzen" },
  "marks": {
    "lens": { "title": "Die Linse", "body": "Unterstreicht Behauptungen und wertende Formulierungen im Text." },
    "phrase": { "title": "Eine Formulierung", "body": "Tippe auf eine Markierung, um Bewertung und Quellen zu sehen." },
    "score": { "title": "Die Bewertung", "body": "Neutralität von 0 bis 100 und wo der Text im Vergleich zu anderen Berichten steht." },
    "neutral": { "title": "Die neutrale Nachricht", "body": "Eine Fassung ohne Adjektive und Rahmung, mit dem, was man weiß und was nicht." },
    "tor": { "title": "Tor", "body": "Hier siehst du, ob du über Tor surfst und aus welchem Land du austrittst." },
    "settings": { "title": "Einstellungen", "body": "Anbieter, Quellen, Privatsphäre und diese Tour, wann immer du willst." }
  },
  "done": { "title": "Fertig", "body": "Öffne einen Artikel und tippe auf Analysieren. Viel Spaß beim Lesen.", "cta": "Lesen beginnen" },
  "settingsButton": "Einstellungen",
  "repeat": "Tour wiederholen",
  "repeatHint": "Sieh dir die Einführung in newpaper noch einmal an."
},
"pages": {
  "netError": {
    "code": "Code {code}",
    "actions": { "retry": "Erneut versuchen", "offlinePage": "Zur Offline-Seite", "openWithoutTor": "Ohne Tor öffnen", "archive": "Im Archiv suchen", "back": "Zurück" },
    "offline": { "kicker": "Offline", "title": "Keine Internetverbindung", "body": "{host} konnte nicht geöffnet werden. Bis das Netz zurück ist, hast du die heutige Ausgabe und deine gespeicherten Artikel." },
    "dns": { "kicker": "Unbekannte Adresse", "title": "Diese Adresse finden wir nicht", "body": "{host} existiert nicht oder antwortet nicht. Prüfe die Schreibweise." },
    "timeout": { "kicker": "Keine Antwort", "title": "Die Seite braucht zu lange", "body": "{host} hat nicht rechtzeitig geantwortet." },
    "unreachable": { "kicker": "Keine Antwort", "title": "Die Seite ist nicht erreichbar", "body": "{host} nimmt gerade keine Verbindungen an." },
    "cert": { "kicker": "Unsichere Verbindung", "title": "Das Zertifikat der Seite ist ungültig", "body": "{host} wird nicht geöffnet, weil jemand mitlesen oder verändern könnte, was du siehst. Es gibt keinen Weg, fortzufahren." },
    "torBlocked": { "kicker": "Tor nicht verfügbar", "title": "Tor ist nicht bereit und ohne Tor geht nichts hinaus", "body": "Um {host} ohne Tor zu öffnen, musst du es ausdrücklich anfordern." },
    "server": { "kicker": "Fehler beim Medium", "title": "Die Website des Mediums hat Probleme", "body": "{host} hat einen Fehler gemeldet. Versuche es später oder suche eine Kopie im Archiv." },
    "unknown": { "kicker": "Fehler", "title": "Die Seite konnte nicht geladen werden", "body": "Beim Öffnen von {host} ist etwas schiefgegangen." }
  },
  "crash": {
    "kicker": "Tab angehalten",
    "title": "Dieser Tab reagiert nicht mehr",
    "body": "Der Rest von newpaper funktioniert weiter.",
    "report": "Technischen Bericht auf diesem Rechner speichern",
    "reportHint": "Nur Version, System und Speicher. Niemals Adresse oder Inhalt.",
    "saved": "Bericht gespeichert.",
    "reload": "Tab neu laden"
  },
  "notFound": {
    "kicker": "Berichtigung",
    "title": "Diese Seite gibt es nicht",
    "lead": "Wo „{address}“ stand, hätte etwas anderes stehen sollen. Wir bedauern den Fehler.",
    "columnsLabel": "Rubriken",
    "columns": {
      "erratas": { "title": "Berichtigung", "body": "In der gestrigen Ausgabe stand „Link“. Richtig ist „toter Link“. Wo „morgen“ stand, muss es „nie“ heißen." },
      "chiste": { "title": "Der Witz", "body": "Treffen sich zwei Webseiten. Sagt die eine: „Ich bin 404.“ Sagt die andere: „Dich gibt’s doch gar nicht.“" },
      "necrologica": { "title": "Nachruf", "body": "Nach einem langen Leben voller Links ist diese Seite von uns gegangen. Server und Redaktionssystem sind ratlos." },
      "anuncio": { "title": "Kleinanzeige", "body": "Webseite entlaufen. Hört auf den Namen „die, die du gesucht hast“. Finderlohn: ein Besuch." },
      "horoscopo": { "title": "Horoskop", "body": "Die Sterne raten dir heute zur Rückkehr. Glückszahl: 404." },
      "ultimaHora": { "title": "Eilmeldung", "body": "Wie unsere Zeitung aus gut unterrichteten Kreisen erfuhr, fehlt die Seite. Wir berichten weiter." }
    }
  },
  "offline": {
    "kicker": "Offline",
    "title": "Du bist offline",
    "body": "Du kannst weiterlesen, was du gespeichert hast. Was Netz braucht, passiert, sobald du wieder online bist.",
    "edition": "Ausgabe vom {date} lesen",
    "noEdition": "Es wurde noch keine Ausgabe heruntergeladen.",
    "saved": "Zum Lesen gespeichert"
  },
  "game": {
    "title": "Tic-Tac-Toe",
    "board": "Spielfeld",
    "cell": "Feld {n}: {value}",
    "empty": "leer",
    "yourTurn": "Du bist dran: Du spielst ×",
    "youWin": "Du hast gewonnen. Das ist seltener, als es aussieht.",
    "iWin": "Ich habe gewonnen.",
    "draw": "Unentschieden.",
    "again": "Noch eine Partie"
  }
}
```

Y dentro de `settings`:
```json
"updates": { "title": "Updates", "description": "Version, Kanal und Inhalte" },
"help": { "title": "Hilfe", "description": "Willkommenstour" }
```

- [ ] **Step 4: Comprobar los catálogos**

Run: `pnpm --filter @newpaper/i18n test`
Expected: PASS — claves completas en los tres idiomas, ICU válido y mismos marcadores.

- [ ] **Step 5: Commit**

```powershell
git add packages/i18n/locales
git commit -m "feat(i18n): updates, first run, tour, error, 404 errata, offline and game strings"
```

---
### Task 11: UI — Ajustes › Actualizaciones, "Novedades", URLs entrantes y recarga de contenido

**Files:**
- Create: `apps/ui/src/features/system/updates.ts`, `apps/ui/src/features/system/UpdatesSection.tsx`, `apps/ui/src/features/system/WhatsNew.tsx`, `apps/ui/src/features/system/system.css`
- Modify: `apps/ui/src/ipc/types.ts`, `apps/ui/src/ipc/commands.ts`, `apps/ui/src/ipc/events.ts`, `apps/ui/src/features/ai/pipeline.ts`, `apps/ui/src/features/analysis/parties.ts`

**Interfaces:**
- Consumes: comandos de las Tareas 5–8.
- Produces:
  - Tipos `UpdateStatus`, `UpdateInfo`, `ContentStatus`, `ContentUpdate`, `ReadyInfo`, `FirstRunStatus`, `Bookmark`; `commands.{appReady, systemInfo, crashReportSave, updateStatus, updateCheck, updateInstallNow, updateSetChannel, updateAckNotes, contentStatus, contentCheckNow, contentRevert, firstRunStatus, firstRunApply, bookmarksScan, ollamaPull, openDefaultApps}`; eventos `onUpdateStatus`, `onContentApplied`, `onOpenUrl`, `onOllamaProgress`
  - `startSystemBridge(): Promise<void>` — llama a `app_ready`, abre las URL pendientes, escucha `app://open-url` y, con `content://applied`, vacía las cachés (`resetRegistry`, `resetPipeline`, `clearPartiesCache`)
  - `systemStore` (`{ rolledBackFrom: string | null; whatsNew: { version; notes } | null }`)
  - `UpdatesSection()` (sección `actualizaciones`, orden 80), `WhatsNew()` (overlay)

- [ ] **Step 1: IPC**

Añade al final de `apps/ui/src/ipc/types.ts`:
```ts
export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'upToDate'; checkedAt: number }
  | { state: 'downloading'; version: string; received: number; total: number | null }
  | { state: 'ready'; version: string; notes: string | null; date: string | null }
  | { state: 'torUnavailable' }
  | { state: 'error'; message: string };
export interface UpdateInfo { status: UpdateStatus; current: string; channel: 'stable' | 'beta'; whatsNew: { version: string; notes: string } | null }
export interface ContentUpdate { manifestVersion: number; appliedAt: number; action: 'apply' | 'revert'; resources: string[] }
export interface ContentStatus { version: number | null; history: ContentUpdate[]; lastCheck: number | null; lastError: string | null }
export interface ReadyInfo { pendingUrls: string[]; rolledBackFrom: string | null }
export interface SystemInfo { version: string; os: string; arch: string; memoryMb: number; webview2: string | null }
export interface FirstRunStatus { done: boolean; browsers: ('edge' | 'chrome' | 'brave')[]; ollama: boolean; autostart: boolean }
export interface Bookmark { url: string; title: string }
export interface OllamaProgress { status: string; completed?: number; total?: number }
```

Añade al objeto `commands` (y los tipos al `import type`):
```ts
  appReady: () => invoke<ReadyInfo>('app_ready'),
  systemInfo: () => invoke<SystemInfo>('system_info'),
  crashReportSave: (report: { reason: string; exitCode: number | null; tabKind: string; at: number }) => invoke<string>('crash_report_save', { report }),
  updateStatus: () => invoke<UpdateInfo>('update_status'),
  updateCheck: () => invoke<void>('update_check'),
  updateInstallNow: () => invoke<void>('update_install_now'),
  updateSetChannel: (channel: 'stable' | 'beta') => invoke<void>('update_set_channel', { channel }),
  updateAckNotes: () => invoke<void>('update_ack_notes'),
  contentStatus: () => invoke<ContentStatus>('content_status'),
  contentCheckNow: () => invoke<string[]>('content_check_now'),
  contentRevert: () => invoke<void>('content_revert'),
  firstRunStatus: () => invoke<FirstRunStatus>('first_run_status'),
  firstRunApply: (opts: { autostart: boolean; tor: boolean }) => invoke<void>('first_run_apply', { opts }),
  bookmarksScan: (browser: string) => invoke<Bookmark[]>('bookmarks_scan', { browser }),
  ollamaPull: (model: string) => invoke<void>('ollama_pull', { model }),
  openDefaultApps: () => invoke<void>('open_default_apps'),
```

Añade a `apps/ui/src/ipc/events.ts`:
```ts
import type { OllamaProgress, UpdateStatus } from './types';

export const onUpdateStatus = (cb: (s: UpdateStatus) => void) => listen<UpdateStatus>('update://status', (e) => cb(e.payload));
export const onContentApplied = (cb: (e: { version: number; resources: string[] }) => void) =>
  listen<{ version: number; resources: string[] }>('content://applied', (e) => cb(e.payload));
export const onOpenUrl = (cb: (url: string) => void) => listen<string>('app://open-url', (e) => cb(e.payload));
export const onOllamaProgress = (cb: (p: OllamaProgress) => void) => listen<OllamaProgress>('ollama://progress', (e) => cb(e.payload));
```

En `apps/ui/src/features/ai/pipeline.ts` (subproyecto 4) añade:
```ts
/** Tras una actualización de contenido (`providers.json`, `prices.json`…). */
export function resetRegistry(): void {
  registryP = null;
  pipelineP = null;
}
```
En `apps/ui/src/features/analysis/parties.ts` (subproyecto 5) añade:
```ts
export function clearPartiesCache(): void {
  cache.clear();
}
```

- [ ] **Step 2: Puente del sistema y "Novedades"**

`apps/ui/src/features/system/updates.ts`:
```ts
import { commands } from '../../ipc/commands';
import { onContentApplied, onOpenUrl } from '../../ipc/events';
import { createStore } from '../../state/store';
import { resetRegistry } from '../ai/pipeline';
import { clearPartiesCache } from '../analysis/parties';

export const systemStore = createStore<{ rolledBackFrom: string | null; whatsNew: { version: string; notes: string } | null }>({ rolledBackFrom: null, whatsNew: null });

const open = (url: string) => void commands.tabOpen({ url, activate: true });

export async function startSystemBridge(): Promise<void> {
  await onOpenUrl(open);
  await onContentApplied(() => {
    resetRegistry();
    clearPartiesCache();
  });
  const ready = await commands.appReady();
  ready.pendingUrls.forEach(open);
  const info = await commands.updateStatus();
  systemStore.set({ rolledBackFrom: ready.rolledBackFrom, whatsNew: info.whatsNew });
}
```

`apps/ui/src/features/system/WhatsNew.tsx`:
```tsx
import { useT } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { commands } from '../../ipc/commands';
import { systemStore } from './updates';

export function WhatsNew() {
  const t = useT();
  const rolled = systemStore.use((s) => s.rolledBackFrom);
  const news = systemStore.use((s) => s.whatsNew);
  if (!rolled && !news) return null;
  const close = () => {
    if (news) void commands.updateAckNotes();
    systemStore.set({ rolledBackFrom: null, whatsNew: null });
  };
  return (
    <div className="np-consent-backdrop">
      <div className="np-consent np-rise" role="dialog" aria-modal="true" aria-labelledby="np-whatsnew-t" onKeyDown={(e) => e.key === 'Escape' && close()}>
        {rolled ? (
          <>
            <h2 id="np-whatsnew-t">{t('updates.rolledBack.title')}</h2>
            <p>{t('updates.rolledBack.body', { version: rolled })}</p>
          </>
        ) : (
          <>
            <h2 id="np-whatsnew-t">{t('updates.whatsNew', { version: news!.version })}</h2>
            <pre className="np-notes">{news!.notes}</pre>
          </>
        )}
        <div className="np-consent-actions">
          <Button variant="primary" onClick={close}>{t('updates.close')}</Button>
        </div>
      </div>
    </div>
  );
}
```

> Las notas se pintan como texto (`<pre>`), nunca como HTML.

- [ ] **Step 3: Sección Ajustes › Actualizaciones**

`apps/ui/src/features/system/UpdatesSection.tsx`:
```tsx
import { useI18n } from '@newpaper/i18n/react';
import { Button, SegmentedControl } from '@newpaper/ui-kit';
import { useCallback, useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import { onUpdateStatus } from '../../ipc/events';
import type { ContentStatus, UpdateInfo, UpdateStatus } from '../../ipc/types';

export function UpdatesSection() {
  const { t, formatDate, formatNumber } = useI18n();
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [content, setContent] = useState<ContentStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    const i = await commands.updateStatus();
    setInfo(i);
    setStatus(i.status);
    setContent(await commands.contentStatus());
  }, []);
  useEffect(() => {
    void reload();
    const un = onUpdateStatus(setStatus);
    return () => void un.then((f) => f());
  }, [reload]);
  if (!info) return null;

  const statusText = (() => {
    switch (status.state) {
      case 'idle':
        return t('updates.status.idle');
      case 'checking':
        return t('updates.status.checking');
      case 'upToDate':
        return t('updates.status.upToDate', { when: formatDate(new Date(status.checkedAt), { dateStyle: 'medium', timeStyle: 'short' }) });
      case 'downloading':
        return t('updates.status.downloading', { version: status.version, percent: status.total ? Math.round((status.received / status.total) * 100) : 0 });
      case 'ready':
        return t('updates.status.ready', { version: status.version });
      case 'torUnavailable':
        return t('updates.status.torUnavailable');
      case 'error':
        return t('updates.status.error', { message: status.message });
    }
  })();

  return (
    <div className="np-updates">
      <p>{t('updates.current', { version: info.current })}</p>
      <SegmentedControl
        label={t('updates.channel.label')}
        value={info.channel}
        onChange={(c) => void commands.updateSetChannel(c).then(reload)}
        options={[{ value: 'stable', label: t('updates.channel.stable') }, { value: 'beta', label: t('updates.channel.beta') }]}
      />
      <p className="np-muted">{t(`updates.channel.${info.channel}Hint`)}</p>
      <p role="status" aria-live="polite">{statusText}</p>
      {status.state === 'ready' && status.notes ? <pre className="np-notes">{status.notes}</pre> : null}
      <div className="np-wizard-actions">
        <Button disabled={status.state === 'checking' || status.state === 'downloading'} onClick={() => void commands.updateCheck()}>{t('updates.check')}</Button>
        {status.state === 'ready' ? (
          <Button variant="primary" onClick={() => void commands.updateInstallNow()}>{t('updates.installNow')}</Button>
        ) : null}
      </div>
      <p className="np-muted">{t('updates.signedNote')}</p>

      <h3>{t('updates.content.title')}</h3>
      <p>{content?.version ? t('updates.content.version', { version: content.version }) : t('updates.content.bundled')}</p>
      {content?.lastError ? <p className="np-muted">{t('updates.content.error', { message: content.lastError })}</p> : null}
      <div className="np-wizard-actions">
        <Button disabled={busy} onClick={() => (setBusy(true), void commands.contentCheckNow().finally(() => (setBusy(false), void reload())))}>{t('updates.content.check')}</Button>
        {content?.history.some((h) => h.action === 'apply') ? (
          <Button variant="quiet" onClick={() => void commands.contentRevert().then(reload)}>{t('updates.content.revert')}</Button>
        ) : null}
      </div>
      {content?.history.length ? (
        <ul className="np-updates-history">
          {content.history.map((h) => (
            <li key={`${h.appliedAt}-${h.action}`}>
              <span className="np-mono">{formatDate(new Date(h.appliedAt), { dateStyle: 'medium' })}</span>{' '}
              {h.action === 'apply' ? t('updates.content.applied', { version: h.manifestVersion, n: formatNumber(h.resources.length) }) : t('updates.content.reverted', { version: h.manifestVersion })}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
```

`apps/ui/src/features/system/system.css`:
```css
.np-updates { display: grid; gap: 10px; font: 14px/1.5 var(--np-font-ui); }
.np-updates h3 { font: 600 11px var(--np-font-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--np-muted); margin: 12px 0 0; }
.np-notes { white-space: pre-wrap; font: 13px/1.5 var(--np-font-ui); background: var(--np-soft); padding: 10px; border-radius: var(--np-radius); max-height: 240px; overflow: auto; }
.np-updates-history { list-style: none; padding: 0; margin: 0; display: grid; gap: 4px; font-size: 13px; }
```

- [ ] **Step 4: Comprobar que compila**

Run: `pnpm --filter @newpaper/ui typecheck`
Expected: sin errores (el registro llega en la Tarea 16).

- [ ] **Step 5: Commit**

```powershell
git add apps/ui
git commit -m "feat(ui): updates settings with channels, notes, content history and revert, what's new and incoming urls"
```

---

### Task 12: UI — primer arranque con las opciones del instalador

**Files:**
- Create: `apps/ui/src/features/system/FirstRun.tsx`

**Interfaces:**
- Consumes: `commands.{firstRunStatus, firstRunApply, bookmarksScan, ollamaPull, openDefaultApps, offlineFetchHtml, savedAdd}`, `onOllamaProgress`, `extractFromHtml`, `outletName` (de la URL), `startTour` (T13).
- Produces: `FirstRun()` (overlay que aparece si `device.firstRunDone` no está): iniciar con Windows, abrir enlaces de noticias, importar marcadores (Edge/Chrome/Brave detectados), Tor desde el principio, descargar modelo local (si hay Ollama) y "Continuar" → recorrido.

- [ ] **Step 1: Implementación**

`apps/ui/src/features/system/FirstRun.tsx`:
```tsx
import { extractFromHtml } from '@newpaper/extract';
import { useI18n } from '@newpaper/i18n/react';
import { Button, Switch } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import { onOllamaProgress } from '../../ipc/events';
import type { FirstRunStatus } from '../../ipc/types';
import { navigate } from '../../shell/navigate';
import { startTour } from './tour/Tour';

const MODEL = 'qwen3:8b';

export function FirstRun() {
  const { t, formatNumber } = useI18n();
  const [st, setSt] = useState<FirstRunStatus | null>(null);
  const [autostart, setAutostart] = useState(false);
  const [tor, setTor] = useState(false);
  const [browser, setBrowser] = useState<string>('');
  const [imported, setImported] = useState<{ done: number; total: number } | null>(null);
  const [pull, setPull] = useState<{ status: string; pct: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void commands.firstRunStatus().then((s) => {
      setSt(s);
      setAutostart(s.autostart);
      setBrowser(s.browsers[0] ?? '');
    });
  }, []);
  if (!st || st.done) return null;

  const importBookmarks = async () => {
    const list = (await commands.bookmarksScan(browser)).slice(0, 50);
    setImported({ done: 0, total: list.length });
    let done = 0;
    for (const b of list) {
      try {
        const html = await commands.offlineFetchHtml(b.url);
        const a = extractFromHtml(html, b.url);
        if (a) await commands.savedAdd({ url: b.url, title: a.title || b.title, outlet: a.siteName, articleJson: JSON.stringify(a), savedAt: Date.now() });
      } catch {
        /* marcador inaccesible: se omite */
      }
      setImported({ done: ++done, total: list.length });
    }
  };
  const pullModel = async () => {
    const un = await onOllamaProgress((p) => setPull({ status: p.status, pct: p.total ? Math.round(((p.completed ?? 0) / p.total) * 100) : 0 }));
    try {
      await commands.ollamaPull(MODEL);
      setPull({ status: 'success', pct: 100 });
    } finally {
      un();
    }
  };
  const finish = async () => {
    setBusy(true);
    await commands.firstRunApply({ autostart, tor });
    setSt({ ...st, done: true });
    startTour();
  };

  return (
    <div className="np-consent-backdrop">
      <div className="np-firstrun np-rise" role="dialog" aria-modal="true" aria-labelledby="np-firstrun-t">
        <h2 id="np-firstrun-t">{t('firstRun.title')}</h2>
        <p className="np-muted">{t('firstRun.subtitle')}</p>
        <Switch checked={autostart} onChange={setAutostart} label={t('firstRun.autostart')} description={t('firstRun.autostartHint')} />
        <Switch checked={tor} onChange={setTor} label={t('firstRun.tor')} description={t('firstRun.torHint')} />
        <div className="np-firstrun-row">
          <div>
            <strong>{t('firstRun.links')}</strong>
            <p className="np-muted">{t('firstRun.linksHint')}</p>
          </div>
          <Button onClick={() => void commands.openDefaultApps()}>{t('firstRun.linksOpen')}</Button>
        </div>
        {st.browsers.length ? (
          <div className="np-firstrun-row">
            <div>
              <strong>{t('firstRun.bookmarks')}</strong>
              <p className="np-muted">{t('firstRun.bookmarksHint')}</p>
              <select aria-label={t('firstRun.browser')} value={browser} onChange={(e) => setBrowser(e.target.value)}>
                {st.browsers.map((b) => (
                  <option key={b} value={b}>{t(`firstRun.browsers.${b}`)}</option>
                ))}
              </select>
              {imported ? <p role="status">{t('firstRun.imported', { done: formatNumber(imported.done), total: formatNumber(imported.total) })}</p> : null}
            </div>
            <Button disabled={!!imported && imported.done < imported.total} onClick={() => void importBookmarks()}>{t('firstRun.import')}</Button>
          </div>
        ) : null}
        <div className="np-firstrun-row">
          <div>
            <strong>{t('firstRun.model')}</strong>
            <p className="np-muted">{st.ollama ? t('firstRun.modelHint', { model: MODEL }) : t('firstRun.noOllama')}</p>
            {pull ? <p role="status">{pull.status === 'success' ? t('firstRun.modelDone') : t('firstRun.modelProgress', { pct: pull.pct })}</p> : null}
          </div>
          {st.ollama ? (
            <Button disabled={!!pull && pull.status !== 'success'} onClick={() => void pullModel()}>{t('firstRun.modelPull')}</Button>
          ) : (
            <Button variant="quiet" onClick={() => void navigate('https://ollama.com/download', { newTab: true })}>{t('firstRun.getOllama')}</Button>
          )}
        </div>
        <div className="np-consent-actions">
          <Button variant="primary" disabled={busy} onClick={() => void finish()}>{t('firstRun.continue')}</Button>
        </div>
      </div>
    </div>
  );
}
```

Añade a `apps/ui/src/features/system/system.css`:
```css
.np-firstrun { width: min(560px, 94vw); max-height: 90vh; overflow: auto; padding: 24px; border-radius: 16px; background: var(--np-card); display: grid; gap: 12px; font: 14px/1.5 var(--np-font-ui); }
.np-firstrun h2 { font: 500 26px var(--np-font-read); margin: 0; }
.np-firstrun-row { display: flex; gap: 12px; justify-content: space-between; align-items: center; padding: 8px 0; border-top: 1px solid var(--np-line2); }
.np-firstrun-row select { min-height: var(--np-hit); border: 1px solid var(--np-line3); border-radius: 10px; background: var(--np-card); }
```

> `offlineFetchHtml` y `savedAdd` son los comandos del subproyecto 3: la importación guarda el artículo ya extraído, igual que "Leer más tarde".

- [ ] **Step 2: Comprobar que compila**

Se compila con la Tarea 13 (`startTour`).

- [ ] **Step 3: Commit**

Se hace con la Tarea 13.

---

### Task 13: UI — recorrido de bienvenida (3 pasos + 6 marcas sobre la interfaz real)

**Files:**
- Create: `apps/ui/src/features/system/tour/steps.ts`, `apps/ui/src/features/system/tour/Tour.tsx`, `apps/ui/src/features/system/SettingsButton.tsx`, `apps/ui/src/features/system/HelpSection.tsx`
- Modify: `apps/ui/src/features/analysis/AnalysisReader.tsx`, `apps/ui/src/features/analysis/AnalysisTab.tsx` (subproyecto 5), `apps/ui/src/features/privacy/TorChip.tsx` (subproyecto 2)

**Interfaces:**
- Produces:
  - `MARKS: { id: 'lens' | 'phrase' | 'score' | 'neutral' | 'tor' | 'settings'; selector: string }[]`
  - `tourStore`, `startTour()`, `Tour()` (overlay): bienvenida → temas (seguir temas) → IA (privacidad total o conectar proveedor) → red (Tor o directo) → 6 marcas con foco sobre el elemento real (si no está en pantalla, la tarjeta se centra y se explica igual) → "Listo" (`tour.done = true`)
  - `SettingsButton` (botón de barra con `data-tour="settings"`), `HelpSection` (Ajustes › Ayuda, orden 95: "Repetir el recorrido")

- [ ] **Step 1: Atributos de las marcas**

- `AnalysisReader.tsx` (5): en el botón de la lente añade `data-tour="lens"`.
- `AnalysisTab.tsx` (5): en el `Button` de "Ver la versión neutral" añade `data-tour="neutral"`.
- `TorChip.tsx` (2): en su botón raíz añade `data-tour="tor"`.

La frase cargada (`.np-lens mark`) y la nota (`.np-ring`) se localizan por su clase.

- [ ] **Step 2: Pasos**

`apps/ui/src/features/system/tour/steps.ts`:
```ts
export type MarkId = 'lens' | 'phrase' | 'score' | 'neutral' | 'tor' | 'settings';
export const MARKS: { id: MarkId; selector: string }[] = [
  { id: 'lens', selector: '[data-tour="lens"]' },
  { id: 'phrase', selector: '.np-lens mark' },
  { id: 'score', selector: '.np-ring' },
  { id: 'neutral', selector: '[data-tour="neutral"]' },
  { id: 'tor', selector: '[data-tour="tor"]' },
  { id: 'settings', selector: '[data-tour="settings"]' },
];
export type TourStep = { kind: 'welcome' } | { kind: 'topics' } | { kind: 'ai' } | { kind: 'network' } | { kind: 'mark'; mark: MarkId } | { kind: 'done' };
export const STEPS: TourStep[] = [{ kind: 'welcome' }, { kind: 'topics' }, { kind: 'ai' }, { kind: 'network' }, ...MARKS.map((m) => ({ kind: 'mark' as const, mark: m.id })), { kind: 'done' }];
```

- [ ] **Step 3: Recorrido**

`apps/ui/src/features/system/tour/Tour.tsx`:
```tsx
import { useI18n } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { useEffect, useLayoutEffect, useState } from 'react';
import { commands } from '../../../ipc/commands';
import type { TopicState } from '../../../ipc/types';
import { openInternal } from '../../../shell/navigate';
import { createStore } from '../../../state/store';
import { MARKS, STEPS } from './steps';

export const tourStore = createStore<{ index: number | null }>({ index: null });
export const startTour = () => tourStore.set({ index: 0 });

function useTargetRect(selector: string | null): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!selector) return setRect(null);
    const el = document.querySelector(selector);
    if (!el) return setRect(null);
    el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    const update = () => setRect(el.getBoundingClientRect());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [selector]);
  return rect;
}

export function Tour() {
  const { t } = useI18n();
  const index = tourStore.use((s) => s.index);
  const [topics, setTopics] = useState<TopicState[]>([]);
  const step = index === null ? null : STEPS[index]!;
  const selector = step?.kind === 'mark' ? MARKS.find((m) => m.id === step.mark)!.selector : null;
  const rect = useTargetRect(selector);

  useEffect(() => {
    if (step?.kind === 'topics') void commands.topicsList().then(setTopics).catch(() => {});
  }, [step?.kind]);
  if (index === null || !step) return null;

  const next = () => tourStore.set({ index: index + 1 < STEPS.length ? index + 1 : null });
  const finish = async () => {
    await commands.settingsSet('tour.done', true);
    tourStore.set({ index: null });
  };
  const skip = () => void finish();
  const card = (body: React.ReactNode, actions: React.ReactNode) => (
    <div
      className="np-tour-card np-rise"
      role="dialog"
      aria-modal="true"
      aria-labelledby="np-tour-t"
      style={rect ? { top: Math.min(window.innerHeight - 220, rect.bottom + 12), left: Math.max(12, Math.min(window.innerWidth - 372, rect.left)) } : undefined}
      onKeyDown={(e) => e.key === 'Escape' && skip()}
    >
      <p className="np-tour-count">{t('tour.count', { n: index + 1, total: STEPS.length })}</p>
      {body}
      <div className="np-consent-actions">
        {step.kind !== 'done' ? <Button variant="quiet" onClick={skip}>{t('tour.skip')}</Button> : null}
        {actions}
      </div>
    </div>
  );

  return (
    <div className="np-tour" aria-live="polite">
      {rect ? <div className="np-tour-spot" style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} /> : <div className="np-tour-dim" />}
      {step.kind === 'welcome'
        ? card(
            <>
              <h2 id="np-tour-t">{t('tour.welcome.title')}</h2>
              <p>{t('tour.welcome.body')}</p>
            </>,
            <Button variant="primary" onClick={next}>{t('tour.start')}</Button>,
          )
        : null}
      {step.kind === 'topics'
        ? card(
            <>
              <h2 id="np-tour-t">{t('tour.topics.title')}</h2>
              <p>{t('tour.topics.body')}</p>
              <div className="np-topics">
                {topics.map((tp) => (
                  <button key={tp.id} type="button" className="np-topic" aria-pressed={tp.following} onClick={() => void commands.topicSetFollowing(tp.id, !tp.following).then(setTopics)}>
                    {tp.name}
                  </button>
                ))}
              </div>
            </>,
            <Button variant="primary" onClick={next}>{t('tour.next')}</Button>,
          )
        : null}
      {step.kind === 'ai'
        ? card(
            <>
              <h2 id="np-tour-t">{t('tour.ai.title')}</h2>
              <p>{t('tour.ai.body')}</p>
            </>,
            <>
              <Button onClick={() => void commands.settingsSet('ai.preset', 'privacy').then(next)}>{t('tour.ai.local')}</Button>
              <Button variant="primary" onClick={() => (void openInternal('ajustes', ['ia', 'conectar']), next())}>{t('tour.ai.connect')}</Button>
            </>,
          )
        : null}
      {step.kind === 'network'
        ? card(
            <>
              <h2 id="np-tour-t">{t('tour.network.title')}</h2>
              <p>{t('tour.network.body')}</p>
            </>,
            <>
              <Button onClick={() => void commands.settingsSet('privacy.mode', 'direct').then(next)}>{t('tour.network.direct')}</Button>
              <Button variant="primary" onClick={() => void commands.settingsSet('privacy.mode', 'tor').then(next)}>{t('tour.network.tor')}</Button>
            </>,
          )
        : null}
      {step.kind === 'mark'
        ? card(
            <>
              <h2 id="np-tour-t">{t(`tour.marks.${step.mark}.title`)}</h2>
              <p>{t(`tour.marks.${step.mark}.body`)}</p>
              {!rect ? <p className="np-muted">{t('tour.notVisible')}</p> : null}
            </>,
            <Button variant="primary" onClick={next}>{t('tour.next')}</Button>,
          )
        : null}
      {step.kind === 'done'
        ? card(
            <>
              <h2 id="np-tour-t">{t('tour.done.title')}</h2>
              <p>{t('tour.done.body')}</p>
            </>,
            <Button variant="primary" onClick={() => void finish()}>{t('tour.done.cta')}</Button>,
          )
        : null}
    </div>
  );
}
```

`apps/ui/src/features/system/SettingsButton.tsx`:
```tsx
import { useT } from '@newpaper/i18n/react';
import { IconButton } from '@newpaper/ui-kit';
import { openInternal } from '../../shell/navigate';

export function SettingsButton() {
  const t = useT();
  return (
    <IconButton
      data-tour="settings"
      label={t('tour.settingsButton')}
      icon={
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" />
        </svg>
      }
      onClick={() => void openInternal('ajustes')}
    />
  );
}
```

`apps/ui/src/features/system/HelpSection.tsx`:
```tsx
import { useT } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { startTour } from './tour/Tour';

export function HelpSection() {
  const t = useT();
  return (
    <div className="np-updates">
      <p>{t('tour.repeatHint')}</p>
      <Button onClick={startTour}>{t('tour.repeat')}</Button>
    </div>
  );
}
```

Añade a `apps/ui/src/features/system/system.css`:
```css
.np-tour { position: fixed; inset: 0; z-index: 60; pointer-events: none; }
.np-tour-dim { position: absolute; inset: 0; background: rgb(23 23 26 / .45); }
.np-tour-spot { position: absolute; border-radius: 12px; box-shadow: 0 0 0 9999px rgb(23 23 26 / .45), 0 0 0 3px var(--np-accent); transition: all 280ms var(--np-ease); }
.np-tour-card { position: absolute; pointer-events: auto; width: min(360px, 92vw); padding: 18px; border-radius: 14px; background: var(--np-card); box-shadow: 0 16px 50px rgb(0 0 0 / .25); font: 14px/1.5 var(--np-font-ui); display: grid; gap: 8px; }
.np-tour > .np-tour-card:not([style]) { top: 50%; left: 50%; transform: translate(-50%, -50%); }
.np-tour-card h2 { font: 600 18px var(--np-font-ui); margin: 0; }
.np-tour-count { font: 11px var(--np-font-mono); color: var(--np-muted); margin: 0; }
@media (prefers-reduced-motion: reduce) { .np-tour-spot { transition: none; } }
```

> `IconButton` reenvía el resto de props al `<button>` (`...rest`), así que `data-tour` llega al DOM.

- [ ] **Step 4: Comprobar que compila**

Run: `pnpm --filter @newpaper/ui typecheck`
Expected: sin errores (incluye `FirstRun` de la Tarea 12).

- [ ] **Step 5: Commit**

```powershell
git add apps/ui
git commit -m "feat(ui): first run with installer options and welcome tour with three steps and six real-ui marks"
```

---

### Task 14: Páginas de error de red, cuelgue y 404 "Fe de erratas"

**Files:**
- Create: `apps/ui/src/features/pages/netError.ts`, `apps/ui/src/features/pages/NetErrorSurface.tsx`, `apps/ui/src/features/pages/CrashSurface.tsx`, `apps/ui/src/features/pages/NotFoundPage.tsx`, `apps/ui/src/features/pages/pages.css`
- Modify: `apps/ui/src/shell/BrowserShell.tsx`
- Test: `apps/ui/src/features/pages/netError.test.ts`

**Interfaces:**
- Consumes: `NavFailure` (1), `privacy` del subproyecto 2 (`requestOpenWithoutTor`, estado del modo), `commands.{tabReload, crashReportSave}`.
- Produces:
  - `NetErrorKind = 'offline' | 'dns' | 'timeout' | 'unreachable' | 'cert' | 'torBlocked' | 'notFound' | 'server' | 'unknown'`, `NetAction = 'retry' | 'offlinePage' | 'openWithoutTor' | 'archive' | 'back'`
  - `classifyFailure(f: NavFailure, ctx: { online: boolean; torBlocked: boolean }): { kind; actions: NetAction[] }` — `cert` **no** tiene acción de continuar
  - `NetErrorSurface({ tab })` (`registerTabSurface('error')`), `CrashSurface({ tab })` (`registerTabSurface('crash')`, informe local opcional), `NotFoundPage` (página interna `404` y respuestas HTTP 404)

- [ ] **Step 1: Escribir el test que falla**

`apps/ui/src/features/pages/netError.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { classifyFailure } from './netError';

const f = (webErrorStatus: number, httpStatus: number | null = null) => ({ url: 'https://d.example/a', webErrorStatus, httpStatus });
const ok = { online: true, torBlocked: false };

describe('classifyFailure', () => {
  it('never offers to continue past an invalid certificate', () => {
    for (const s of [1, 2, 3, 4, 5]) {
      const r = classifyFailure(f(s), ok);
      expect(r.kind).toBe('cert');
      expect(r.actions).toEqual(['back']);
    }
  });

  it('prefers the kill switch and offline state over the raw status', () => {
    expect(classifyFailure(f(12), { online: true, torBlocked: true })).toEqual({ kind: 'torBlocked', actions: ['openWithoutTor', 'retry'] });
    expect(classifyFailure(f(13), { online: false, torBlocked: false }).kind).toBe('offline');
    expect(classifyFailure(f(11), ok).actions).toContain('offlinePage');
  });

  it('maps dns, timeout, unreachable and http statuses', () => {
    expect(classifyFailure(f(13), ok).kind).toBe('dns');
    expect(classifyFailure(f(7), ok).kind).toBe('timeout');
    expect(classifyFailure(f(6), ok).kind).toBe('unreachable');
    expect(classifyFailure(f(0, 404), ok)).toEqual({ kind: 'notFound', actions: ['archive', 'back'] });
    expect(classifyFailure(f(0, 503), ok).kind).toBe('server');
    expect(classifyFailure(f(99), ok).kind).toBe('unknown');
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm --filter @newpaper/ui exec vitest run src/features/pages/netError.test.ts`
Expected: FAIL (`Cannot find module './netError'`).

- [ ] **Step 3: Clasificación**

`apps/ui/src/features/pages/netError.ts`:
```ts
import type { NavFailure } from '../../ipc/types';

export type NetErrorKind = 'offline' | 'dns' | 'timeout' | 'unreachable' | 'cert' | 'torBlocked' | 'notFound' | 'server' | 'unknown';
export type NetAction = 'retry' | 'offlinePage' | 'openWithoutTor' | 'archive' | 'back';

/** `COREWEBVIEW2_WEB_ERROR_STATUS`: 1–5 certificado, 6 servidor inalcanzable, 7 tiempo agotado, 9–12 conexión, 13 DNS. */
export function classifyFailure(f: NavFailure, ctx: { online: boolean; torBlocked: boolean }): { kind: NetErrorKind; actions: NetAction[] } {
  const s = f.webErrorStatus;
  if (s >= 1 && s <= 5) return { kind: 'cert', actions: ['back'] }; // §11: nunca "continuar de todos modos"
  if (ctx.torBlocked) return { kind: 'torBlocked', actions: ['openWithoutTor', 'retry'] };
  if (!ctx.online || s === 11) return { kind: 'offline', actions: ['retry', 'offlinePage'] };
  if (f.httpStatus === 404) return { kind: 'notFound', actions: ['archive', 'back'] };
  if (f.httpStatus !== null && f.httpStatus >= 500) return { kind: 'server', actions: ['retry', 'archive'] };
  if (s === 13) return { kind: 'dns', actions: ['retry'] };
  if (s === 7) return { kind: 'timeout', actions: ['retry'] };
  if (s === 6 || s === 9 || s === 10 || s === 12) return { kind: 'unreachable', actions: ['retry', 'archive'] };
  return { kind: 'unknown', actions: ['retry'] };
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm --filter @newpaper/ui exec vitest run src/features/pages/netError.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Superficies y 404**

`apps/ui/src/features/pages/NotFoundPage.tsx`:
```tsx
import { useI18n } from '@newpaper/i18n/react';
import { useEffect, useState } from 'react';

export const COLUMNS = ['erratas', 'chiste', 'necrologica', 'anuncio', 'horoscopo', 'ultimaHora'] as const;
export const ROTATE_MS = 7000;

export function NotFoundPage({ address }: { address?: string }) {
  const { t } = useI18n();
  const [i, setI] = useState(0);
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  useEffect(() => {
    if (reduced) return;
    const h = setInterval(() => setI((x) => (x + 1) % COLUMNS.length), ROTATE_MS);
    return () => clearInterval(h);
  }, [reduced]);
  const col = COLUMNS[i]!;
  return (
    <article className="np-404">
      <p className="np-404-kicker">{t('pages.notFound.kicker')}</p>
      <h1>{t('pages.notFound.title')}</h1>
      <p className="np-404-lead">{t('pages.notFound.lead', { address: address ?? '' })}</p>
      <section className="np-404-column np-rise" key={col} aria-live="polite">
        <h2>{t(`pages.notFound.columns.${col}.title`)}</h2>
        <p>{t(`pages.notFound.columns.${col}.body`)}</p>
      </section>
      <nav className="np-404-dots" aria-label={t('pages.notFound.columnsLabel')}>
        {COLUMNS.map((c, k) => (
          <button key={c} type="button" aria-label={t(`pages.notFound.columns.${c}.title`)} aria-current={k === i ? 'true' : undefined} onClick={() => setI(k)} />
        ))}
      </nav>
    </article>
  );
}
```

`apps/ui/src/features/pages/NetErrorSurface.tsx`:
```tsx
import { useT } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { TabInfo } from '../../ipc/types';
import { openInternal } from '../../shell/navigate';
import { requestOpenWithoutTor } from '../privacy/withoutTor';
import { classifyFailure, type NetAction } from './netError';
import { NotFoundPage } from './NotFoundPage';

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

export function NetErrorSurface({ tab }: { tab: TabInfo }) {
  const t = useT();
  const online = useOnline();
  const [torBlocked, setTorBlocked] = useState(false);
  useEffect(() => {
    void commands.privacyStatus().then((s) => setTorBlocked(s.killSwitchActive)).catch(() => {});
  }, [tab.failure]);
  if (!tab.failure) return null;
  const { kind, actions } = classifyFailure(tab.failure, { online, torBlocked });
  if (kind === 'notFound') return <div className="np-surface"><NotFoundPage address={tab.failure.url} /></div>;
  const run = (a: NetAction) => {
    if (a === 'retry') return void commands.tabReload(tab.id);
    if (a === 'offlinePage') return void openInternal('sin-conexion');
    if (a === 'openWithoutTor') return void requestOpenWithoutTor(tab.id);
    if (a === 'archive') return void openInternal('hemeroteca', [], { url: tab.failure!.url });
    return void commands.tabBack(tab.id);
  };
  return (
    <div className="np-surface np-neterr" role="alert">
      <p className="np-404-kicker">{t(`pages.netError.${kind}.kicker`)}</p>
      <h1>{t(`pages.netError.${kind}.title`)}</h1>
      <p>{t(`pages.netError.${kind}.body`, { host: (() => { try { return new URL(tab.failure!.url).host; } catch { return tab.failure!.url; } })() })}</p>
      <div className="np-consent-actions">
        {actions.map((a, i) => (
          <Button key={a} variant={i === 0 ? 'primary' : 'secondary'} onClick={() => run(a)}>{t(`pages.netError.actions.${a}`)}</Button>
        ))}
      </div>
      <p className="np-mono np-muted">{t('pages.netError.code', { code: tab.failure.webErrorStatus })}</p>
    </div>
  );
}
```

> `commands.privacyStatus()` (subproyecto 2) devuelve el `NetStatus` con `killSwitchActive`; si el subproyecto 2 lo nombró de otra forma, ajusta esta línea.

`apps/ui/src/features/pages/CrashSurface.tsx`:
```tsx
import { useT } from '@newpaper/i18n/react';
import { Button, Switch } from '@newpaper/ui-kit';
import { useState } from 'react';
import { commands } from '../../ipc/commands';
import type { TabInfo } from '../../ipc/types';

export function CrashSurface({ tab }: { tab: TabInfo }) {
  const t = useT();
  const [report, setReport] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const reload = async () => {
    if (report && !saved) setSaved(await commands.crashReportSave({ reason: 'process-failed', exitCode: null, tabKind: tab.private ? 'private' : 'web', at: Date.now() }));
    await commands.tabReload(tab.id);
  };
  return (
    <div className="np-surface np-neterr" role="alert">
      <p className="np-404-kicker">{t('pages.crash.kicker')}</p>
      <h1>{t('pages.crash.title')}</h1>
      <p>{t('pages.crash.body')}</p>
      <Switch checked={report} onChange={setReport} label={t('pages.crash.report')} description={t('pages.crash.reportHint')} />
      {saved ? <p className="np-muted">{t('pages.crash.saved')}</p> : null}
      <div className="np-consent-actions">
        <Button variant="primary" onClick={() => void reload()}>{t('pages.crash.reload')}</Button>
      </div>
    </div>
  );
}
```

En `apps/ui/src/shell/BrowserShell.tsx`, sustituye el texto provisional de página interna inexistente por la 404:
```tsx
import { NotFoundPage } from '../features/pages/NotFoundPage';
// …
    return <div className="np-surface">{Page && url ? <Page url={url} tab={tab} /> : <NotFoundPage address={tab.url} />}</div>;
```

`apps/ui/src/features/pages/pages.css`:
```css
.np-404, .np-neterr { max-width: 66ch; margin: 0 auto; padding: 56px 20px; font: 17px/1.6 var(--np-font-read); color: var(--np-ink); display: grid; gap: 12px; }
.np-404 h1, .np-neterr h1 { font: 500 40px/1.1 var(--np-font-read); margin: 0; }
.np-404-kicker { font: 600 11px var(--np-font-mono); letter-spacing: .1em; text-transform: uppercase; color: var(--np-accent); margin: 0; }
.np-404-lead { color: var(--np-ink2); }
.np-404-column { border-top: 3px double var(--np-ink); padding-top: 12px; min-height: 140px; }
.np-404-column h2 { font: 600 13px var(--np-font-mono); letter-spacing: .08em; text-transform: uppercase; margin: 0 0 6px; }
.np-404-dots { display: flex; gap: 6px; }
.np-404-dots button { width: 44px; height: 44px; border: 0; background: none; cursor: pointer; position: relative; }
.np-404-dots button::after { content: ''; position: absolute; inset: 18px; border-radius: 50%; background: var(--np-line3); }
.np-404-dots button[aria-current='true']::after { background: var(--np-ink); }
```

- [ ] **Step 6: Comprobar que compila**

Run: `pnpm --filter @newpaper/ui typecheck`
Expected: sin errores.

- [ ] **Step 7: Commit**

```powershell
git add apps/ui
git commit -m "feat(ui): network error classification without cert bypass, crash surface with local report and 404 errata page"
```

---

### Task 15: Página sin conexión, tres en raya y cola de acciones sin conexión

**Files:**
- Create: `apps/ui/src/features/pages/ticTacToe.ts`, `apps/ui/src/features/pages/TicTacToe.tsx`, `apps/ui/src/features/pages/OfflinePage.tsx`, `apps/ui/src/features/pages/offlineQueue.ts`
- Test: `apps/ui/src/features/pages/ticTacToe.test.ts`

**Interfaces:**
- Produces:
  - `Cell = 'X' | 'O' | null`, `Board = Cell[]` (9), `winner(b): 'X' | 'O' | 'draw' | null`, `bestMove(b, ai: 'X' | 'O'): number` (minimax con poda; juego perfecto)
  - `TicTacToe()` (persona `X`, máquina `O`, teclado: flechas y Enter)
  - `OfflinePage()` (página interna `sin-conexion`): edición del día (`newpaper://edicion`), guardados (`savedList`) y el juego
  - `offlineQueue`: `enqueue(action: QueuedAction)`, `flush()`, `startOfflineQueue()` — acciones `{ kind: 'watch'; args } | { kind: 'analyzeUrl'; url }` en `device.offlineQueue`; se ejecutan al volver la conexión

- [ ] **Step 1: Escribir el test que falla**

`apps/ui/src/features/pages/ticTacToe.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { bestMove, winner, type Board } from './ticTacToe';

const b = (s: string): Board => [...s].map((c) => (c === 'X' || c === 'O' ? c : null));

describe('tic-tac-toe minimax', () => {
  it('detects wins and draws', () => {
    expect(winner(b('XXX......'))).toBe('X');
    expect(winner(b('O...O...O'))).toBe('O');
    expect(winner(b('XOXXOOOXX'))).toBe('draw');
    expect(winner(b('X........'))).toBeNull();
  });

  it('wins when it can and blocks when it must', () => {
    expect(bestMove(b('OO.XX....'), 'O')).toBe(2);
    expect(bestMove(b('XX.O.....'), 'O')).toBe(2);
  });

  it('never loses against any sequence of moves', () => {
    const play = (board: Board, human: boolean): void => {
      const w = winner(board);
      if (w) return void expect(w).not.toBe('X');
      if (human) {
        board.forEach((c, i) => {
          if (c === null) play(board.map((x, j) => (j === i ? 'X' : x)), false);
        });
      } else {
        const m = bestMove(board, 'O');
        play(board.map((x, j) => (j === m ? 'O' : x)), true);
      }
    };
    play(b('.........'), true);
  });
});
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm --filter @newpaper/ui exec vitest run src/features/pages/ticTacToe.test.ts`
Expected: FAIL (`Cannot find module './ticTacToe'`).

- [ ] **Step 3: Minimax**

`apps/ui/src/features/pages/ticTacToe.ts`:
```ts
export type Cell = 'X' | 'O' | null;
export type Board = Cell[];
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]] as const;

export function winner(b: Board): 'X' | 'O' | 'draw' | null {
  for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a];
  return b.every((x) => x !== null) ? 'draw' : null;
}

function score(b: Board, ai: 'X' | 'O', turn: 'X' | 'O', depth: number, alpha: number, beta: number): number {
  const w = winner(b);
  if (w === ai) return 10 - depth;
  if (w === 'draw') return 0;
  if (w) return depth - 10;
  const other = turn === 'X' ? 'O' : 'X';
  let best = turn === ai ? -Infinity : Infinity;
  for (let i = 0; i < 9; i++) {
    if (b[i] !== null) continue;
    b[i] = turn;
    const s = score(b, ai, other, depth + 1, alpha, beta);
    b[i] = null;
    if (turn === ai) {
      best = Math.max(best, s);
      alpha = Math.max(alpha, s);
    } else {
      best = Math.min(best, s);
      beta = Math.min(beta, s);
    }
    if (beta <= alpha) break;
  }
  return best;
}

export function bestMove(board: Board, ai: 'X' | 'O'): number {
  const b = [...board];
  const other = ai === 'X' ? 'O' : 'X';
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < 9; i++) {
    if (b[i] !== null) continue;
    b[i] = ai;
    const s = score(b, ai, other, 1, -Infinity, Infinity);
    b[i] = null;
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }
  return best;
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm --filter @newpaper/ui exec vitest run src/features/pages/ticTacToe.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Juego, página y cola**

`apps/ui/src/features/pages/TicTacToe.tsx`:
```tsx
import { useT } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { useRef, useState, type KeyboardEvent } from 'react';
import { bestMove, winner, type Board } from './ticTacToe';

export function TicTacToe() {
  const t = useT();
  const [board, setBoard] = useState<Board>(Array(9).fill(null));
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const w = winner(board);
  const play = (i: number) => {
    if (board[i] !== null || w) return;
    const next = board.map((c, j) => (j === i ? 'X' : c));
    if (!winner(next)) {
      const m = bestMove(next, 'O');
      if (m >= 0) next[m] = 'O';
    }
    setBoard(next);
  };
  const key = (i: number) => (e: KeyboardEvent) => {
    const move = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -3, ArrowDown: 3 }[e.key as 'ArrowLeft'];
    if (move !== undefined) {
      e.preventDefault();
      refs.current[(i + move + 9) % 9]?.focus();
    }
  };
  const status = w === 'X' ? t('pages.game.youWin') : w === 'O' ? t('pages.game.iWin') : w === 'draw' ? t('pages.game.draw') : t('pages.game.yourTurn');
  return (
    <section className="np-ttt" aria-label={t('pages.game.title')}>
      <h2>{t('pages.game.title')}</h2>
      <div className="np-ttt-board" role="grid" aria-label={t('pages.game.board')}>
        {board.map((c, i) => (
          <button
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="gridcell"
            className="np-ttt-cell"
            aria-label={t('pages.game.cell', { n: i + 1, value: c ?? t('pages.game.empty') })}
            onClick={() => play(i)}
            onKeyDown={key(i)}
          >
            {c === 'X' ? '×' : c === 'O' ? '○' : ''}
          </button>
        ))}
      </div>
      <p role="status">{status}</p>
      {w ? <Button onClick={() => setBoard(Array(9).fill(null))}>{t('pages.game.again')}</Button> : null}
    </section>
  );
}
```

`apps/ui/src/features/pages/OfflinePage.tsx`:
```tsx
import { useI18n } from '@newpaper/i18n/react';
import { Button } from '@newpaper/ui-kit';
import { useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import type { Edition, SavedArticle } from '../../ipc/types';
import { navigate, openInternal } from '../../shell/navigate';
import { TicTacToe } from './TicTacToe';

export function OfflinePage() {
  const { t, formatDate } = useI18n();
  const [edition, setEdition] = useState<Edition | null>(null);
  const [saved, setSaved] = useState<SavedArticle[]>([]);
  useEffect(() => {
    void commands.offlineEditions().then((e) => setEdition(e.find((x) => x.status === 'ready') ?? null)).catch(() => {});
    void commands.savedList().then((s) => setSaved(s.slice(0, 8))).catch(() => {});
  }, []);
  return (
    <div className="np-404">
      <p className="np-404-kicker">{t('pages.offline.kicker')}</p>
      <h1>{t('pages.offline.title')}</h1>
      <p>{t('pages.offline.body')}</p>
      {edition ? (
        <Button variant="primary" onClick={() => void openInternal('edicion')}>
          {t('pages.offline.edition', { date: formatDate(new Date(edition.createdAt), { dateStyle: 'long' }) })}
        </Button>
      ) : (
        <p className="np-muted">{t('pages.offline.noEdition')}</p>
      )}
      {saved.length ? (
        <section>
          <h2>{t('pages.offline.saved')}</h2>
          <ul className="np-continue">
            {saved.map((s) => (
              <li key={s.url}>
                <button type="button" className="np-link" onClick={() => void navigate(s.url)}>{s.title}</button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <TicTacToe />
    </div>
  );
}
```

`apps/ui/src/features/pages/offlineQueue.ts`:
```ts
import { commands } from '../../ipc/commands';

export type QueuedAction = { kind: 'watch'; args: { articleUrl?: string; query?: string; eventId?: number } } | { kind: 'analyzeUrl'; url: string };
const KEY = 'device.offlineQueue';

export async function enqueue(a: QueuedAction): Promise<void> {
  const q = (await commands.settingsGet<QueuedAction[]>(KEY)) ?? [];
  await commands.settingsSet(KEY, [...q, a]);
}

/** Ejecuta lo pendiente; lo que vuelve a fallar se queda en la cola. */
export async function flush(): Promise<number> {
  const q = (await commands.settingsGet<QueuedAction[]>(KEY)) ?? [];
  const left: QueuedAction[] = [];
  for (const a of q) {
    try {
      if (a.kind === 'watch') await commands.watchAdd(a.args);
      else await commands.tabOpen({ url: a.url, activate: false });
    } catch {
      left.push(a);
    }
  }
  await commands.settingsSet(KEY, left);
  return q.length - left.length;
}

export function startOfflineQueue(): void {
  window.addEventListener('online', () => void flush());
  if (navigator.onLine) void flush();
}
```

> "Analizar una URL" en la cola abre la pestaña en segundo plano: el análisis automático (subproyecto 5) se encarga al cargar. `watchAdd` y "leer más tarde" de los subproyectos 3 y 5 llaman a `enqueue` cuando `navigator.onLine === false` (cambio de una línea en `NoCoverageBlock`, `CoverageTab` y `NewTabPage`: `if (!navigator.onLine) return void enqueue({ kind: 'watch', args })`).

Añade a `apps/ui/src/features/pages/pages.css`:
```css
.np-ttt { display: grid; gap: 8px; justify-items: start; margin-top: 24px; font: 14px var(--np-font-ui); }
.np-ttt h2 { font: 600 13px var(--np-font-mono); letter-spacing: .08em; text-transform: uppercase; margin: 0; }
.np-ttt-board { display: grid; grid-template-columns: repeat(3, 64px); gap: 4px; }
.np-ttt-cell { width: 64px; height: 64px; border: 1px solid var(--np-line3); border-radius: 10px; background: var(--np-card); font: 600 30px var(--np-font-read); color: var(--np-ink); cursor: pointer; }
.np-ttt-cell:focus-visible { outline: 2px solid var(--np-accent); outline-offset: 2px; }
```

- [ ] **Step 6: Comprobar que compila**

Run: `pnpm --filter @newpaper/ui typecheck`
Expected: sin errores.

- [ ] **Step 7: Commit**

```powershell
git add apps/ui
git commit -m "feat(ui): offline page with daily edition, saved articles, perfect tic-tac-toe and offline action queue"
```

---

### Task 16: Registro del sistema y e2e del recorrido

**Files:**
- Create: `apps/ui/src/features/system/register.ts`, `apps/ui/src/features/pages/register.ts`, `e2e/specs/tour.e2e.ts`
- Modify: `apps/ui/src/features/index.ts`, `apps/ui/src/App.tsx`

**Interfaces:**
- Produces: superficies `error` y `crash`; páginas `404` y `sin-conexion`; overlays `FirstRun`, `Tour`, `WhatsNew`; secciones `actualizaciones` (80) y `ayuda` (95); botón de Ajustes en la barra (orden 99); `startSystemBridge()` y `startOfflineQueue()` al arrancar.

- [ ] **Step 1: Registro**

`apps/ui/src/features/pages/register.ts`:
```ts
import { registerInternalPage, registerTabSurface } from '../../shell/registry';
import { CrashSurface } from './CrashSurface';
import { NetErrorSurface } from './NetErrorSurface';
import { NotFoundPage } from './NotFoundPage';
import { OfflinePage } from './OfflinePage';
import { startOfflineQueue } from './offlineQueue';
import './pages.css';

registerTabSurface('error', NetErrorSurface);
registerTabSurface('crash', CrashSurface);
registerInternalPage('404', NotFoundPage);
registerInternalPage('sin-conexion', OfflinePage);
startOfflineQueue();
```

> `NotFoundPage` acepta `{ address?: string }`; las props de página interna (`url`, `tab`) son compatibles y se ignoran.

`apps/ui/src/features/system/register.ts`:
```ts
import { registerOverlay, registerSettingsSection, registerToolbarItem } from '../../shell/registry';
import { FirstRun } from './FirstRun';
import { HelpSection } from './HelpSection';
import { SettingsButton } from './SettingsButton';
import './system.css';
import { Tour } from './tour/Tour';
import { startSystemBridge } from './updates';
import { UpdatesSection } from './UpdatesSection';
import { WhatsNew } from './WhatsNew';

registerOverlay({ id: 'first-run', Component: FirstRun });
registerOverlay({ id: 'tour', Component: Tour });
registerOverlay({ id: 'whats-new', Component: WhatsNew });
registerSettingsSection({ id: 'actualizaciones', order: 80, titleKey: 'settings.updates.title', descriptionKey: 'settings.updates.description', Component: UpdatesSection });
registerSettingsSection({ id: 'ayuda', order: 95, titleKey: 'settings.help.title', descriptionKey: 'settings.help.description', Component: HelpSection });
registerToolbarItem({ id: 'settings', order: 99, Component: SettingsButton });
void startSystemBridge();
```

Añade a `apps/ui/src/features/index.ts`: `import './pages/register';` y `import './system/register';`.

- [ ] **Step 2: Escribir el e2e**

`e2e/specs/tour.e2e.ts`:
```ts
import { switchToUi, uiInvoke } from '../helpers';

describe('first run and tour', () => {
  before(async () => {
    await uiInvoke('settings_set', { key: 'general.locale', value: 'es' });
    await uiInvoke('settings_set', { key: 'device.firstRunDone', value: false });
    await uiInvoke('settings_set', { key: 'tour.done', value: false });
    await browser.refresh();
  });

  it('goes from first run through the three steps and six marks to done', async () => {
    await switchToUi();
    await $('.np-firstrun').waitForDisplayed({ timeout: 30_000 });
    await $('button=Continuar').click();
    await $('h2=Bienvenido a newpaper').waitForDisplayed({ timeout: 10_000 });
    await $('button=Empezar').click();
    await $('#np-tour-t').waitForDisplayed();
    await $('button=Siguiente').click(); // temas
    await $('button=Solo en mi equipo').click(); // IA → preset privacidad
    await $('button=Conexión directa').click(); // red
    for (let i = 0; i < 6; i++) await $('button=Siguiente').click(); // seis marcas
    await $('button=Empezar a leer').click();
    await browser.waitUntil(async () => !(await $('.np-tour-card').isExisting()), { timeout: 5_000 });
    const done = await uiInvoke<boolean | null>('settings_get', { key: 'tour.done' });
    expect(done).toBe(true);
    expect(await uiInvoke<string | null>('settings_get', { key: 'ai.preset' })).toBe('privacy');
  });
});
```

- [ ] **Step 3: Ejecutar**

Run:
```powershell
pnpm --filter @newpaper/ui typecheck
pnpm --filter @newpaper/ui test
pnpm --filter @newpaper/i18n test
pnpm --filter @newpaper/ui build
cargo build --manifest-path src-tauri/Cargo.toml
pnpm e2e
```
Expected: todo en verde; e2e `3 passing` (lector, análisis y recorrido).

- [ ] **Step 4: Commit**

```powershell
git add apps/ui e2e
git commit -m "feat(ui): register system pages, overlays, settings and toolbar button; e2e for first run and tour"
```

---

### Task 17: Prueba manual de extremo a extremo (instalador, actualización, vuelta atrás y contenido)

**Files:** ninguno nuevo.

- [ ] **Step 1: Instalador**

Instala `newpaper_0.1.0_x64-setup.exe` en una cuenta sin permisos de administrador. Expected: selector de idioma con Español, English y Deutsch; textos y marca en el idioma elegido; se instala en `%LOCALAPPDATA%\newpaper`; Configuración › Aplicaciones predeterminadas ofrece newpaper como navegador.

- [ ] **Step 2: Actualización**

Sube la versión a `0.1.1`, compila con la clave del actualizador, publica `latest.json` en un servidor local (`npx http-server dist -p 4600`) y apunta temporalmente `channels::manifest_url(Stable)` a `http://127.0.0.1:4600/latest.json` en una build de depuración (`dangerousInsecureTransportProtocol: true` solo en esa build). Expected: Ajustes › Actualizaciones muestra la descarga y "Lista para instalar"; "Reiniciar y actualizar" instala y la app reabre con "Novedades"; con el modo Tor y Tor apagado, el estado es "Tor no disponible" y no hay tráfico directo (Monitor de recursos).

- [ ] **Step 3: Vuelta atrás**

Con `0.1.1` instalada desde `0.1.0`, provoca dos arranques sin llegar a "sano" (cierra el proceso a los 5 s dos veces). Expected: en el tercer arranque se ejecuta el instalador de `0.1.0` en modo pasivo; tras él, aviso "Se ha vuelto a la versión anterior" y la `0.1.1` no se vuelve a ofrecer.

- [ ] **Step 4: Contenido**

Firma un `sources-es.json` modificado con `np-content-sign` y súbelo a la publicación `content` (o a un servidor local, en una build de depuración). Expected: "Buscar actualizaciones de contenido" aplica la versión, el historial lo registra y "Revertir" devuelve el fichero anterior; un manifiesto con firma alterada se rechaza sin tocar `content/current`.

- [ ] **Step 5: Páginas**

Expected: `newpaper://noexiste` muestra la fe de erratas con columnas que rotan cada 7 s (y quietas con "reducir movimiento"); una web con certificado caducado (`https://expired.badssl.com`) muestra el error sin ningún botón de continuar; sin red, "Ir a la página sin conexión" lleva a la edición del día, los guardados y el tres en raya.

- [ ] **Step 6: Anotar los resultados**

Anota en el mensaje del último commit del subproyecto (o en el PR) qué comprobaciones marcadas "verificar" (soporte `socks5h` del plugin, nombres de idioma NSIS, `${MAINBINARYNAME}`, `/P`) se confirmaron.

---

## Cobertura de la spec (autorrevisión)

| Requisito | Tarea |
|---|---|
| §9 instalador NSIS por usuario, marca, idiomas (§14) | 9 |
| §9 opciones del instalador (acceso directo, iniciar con Windows, enlaces, marcadores, Tor, modelo local) | 9, 8, 12 |
| §17 updater con minisign, clave embebida, canales, 24 h, segundo plano, al reiniciar, notas | 6, 9, 11 |
| §17 vuelta atrás tras dos arranques fallidos | 2, 5, 6, 17 |
| §17 contenido con manifiesto firmado, versión por recurso, atómico y reversible | 3, 4, 7, 11 |
| §17 por Tor si está activo, nunca sin firma | 6, 7, 1 |
| §9 recorrido 3 pasos + 6 marcas, repetible | 13, 16 |
| §8/§10 errores de red, cuelgue, 404, sin conexión, tres en raya | 14, 15 |
| §11 certificado inválido sin "continuar" | 14 |
| §18 cola de acciones sin conexión | 15 |
| §14 páginas internas y chistes por idioma | 10 |

**Fuera de este plan:** instalador v2 (mini app "setup"), actualizaciones móviles por tienda/APK (subproyecto 8), firma de código Authenticode del instalador (requiere certificado; `bundle.windows.signCommand` cuando exista).

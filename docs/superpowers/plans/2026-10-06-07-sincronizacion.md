# newpaper · Subproyecto 7 — Sincronización PC↔móvil sin cuenta · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sincronizar ajustes, historial, guardados, análisis, temas y fuentes entre los dispositivos del usuario sin servidor ni cuenta: emparejamiento por QR, intercambio X25519 + HKDF y cifrado XChaCha20‑Poly1305 de extremo a extremo, descubrimiento por mDNS (`_newpaper._tcp`) o dirección de Tailscale, "el último que escribe gana" por fila con HLC, ámbitos activables, claves de API opcionales y cifradas, y copia `.npsync` protegida con Argon2id.

**Architecture:** El crate `np-sync` (sin Tauri, compilable para escritorio y móvil) tiene la identidad del dispositivo, la criptografía, el diario de cambios, la fusión LWW, el protocolo sobre cualquier `AsyncRead + AsyncWrite` (TCP en la app, `tokio::io::duplex` en los tests), el emparejamiento, el descubrimiento y la copia `.npsync`. La migración 7 añade `sync_peers`, `sync_log` y un diario local (`sync_journal`) alimentado por disparadores en cada tabla sincronizable. El módulo `sync` de la app escucha en TCP 47100 solo si la sincronización está activada, sincroniza al abrir, cada 5 minutos y bajo demanda. La UI añade Ajustes › Dispositivos.

**Tech Stack:** Rust: `x25519-dalek` 2.0.1 (`static_secrets`), `chacha20poly1305` 0.10.1, `hkdf` 0.12.4, `sha2` 0.10, `argon2` 0.5.3, `rand_core` 0.6.4 (`getrandom`), `qrcode` 0.14.1, `mdns-sd` 0.21.5, `if-addrs` 0.15.0, `base64` 0.23.1, `tokio` 1.53 (`net`, `io-util`), `rusqlite` 0.40; `tauri-plugin-dialog` 2.8.1 y `@tauri-apps/plugin-dialog` 2.8.1 (elegir el fichero `.npsync`); React 19, Vitest 5.

## Decisiones tomadas

1. **Generación de RustCrypto**: se fija la generación estable anterior (`x25519-dalek` 2.0.1, `chacha20poly1305` 0.10.1, `hkdf` 0.12.4, `sha2` 0.10, `argon2` 0.5.3, `rand_core` 0.6). Sus API se comprobaron compilando un programa de prueba el 2026-10-08 (DH, HKDF, XChaCha20‑Poly1305, Argon2id, `qrcode`, `mdns-sd` registro y búsqueda). La nueva generación (x25519 3.0, chacha20poly1305 0.11, hkdf 0.13, argon2 0.6, rand 0.10) cambia sus API y no se ha verificado; además `sha2` 0.10 ya es la que usan los subproyectos 4 y 6.
2. **Identidad**: cada dispositivo tiene un par X25519 **estático** (en el llavero, clave `sync.identity`) y un `device_id` aleatorio. Huella = 10 primeros bytes de SHA‑256 de la clave pública, en hexadecimal en grupos de 4.
3. **Emparejamiento**: el QR lleva `np1:` + base64url de `{ v, id, name, pk (estática), epk (efímera), secret (16 bytes), addrs }`. Quien escanea abre TCP, deriva claves con `DH(efímeras)` y el `secret` como sal (solo quien vio el QR puede descifrar) y manda su identidad cifrada; el PC responde con la suya y quien escanea comprueba que coincide con la `pk` del QR. La oferta caduca a los 2 minutos y sirve una sola vez. Entre escritorios se puede pegar el código `np1:` en vez de escanear.
4. **Sesión**: claves por dirección derivadas con HKDF‑SHA256 de `DH(efímera, efímera) ‖ DH(estática, estática)` (secreto hacia delante + autenticación mutua) con sal `SHA‑256(epk_a ‖ epk_b)` ordenadas por `device_id`. Cada trama: `nonce (24) ‖ texto cifrado`; nonces aleatorios (XChaCha permite nonces aleatorios de 192 bits).
5. **Qué se envía**: un **diario local** (`sync_journal`, secuencia creciente, una entrada por fila y tabla, alimentado por disparadores) en lugar de una marca HLC por par. Así una fila antigua llegada de un tercer dispositivo también se reenvía (con una marca HLC por par se perdería). Cada par confirma la última secuencia recibida (`sync_log.sent_seq`). La fusión sigue siendo LWW por `updated_at` (HLC) y lápida `deleted`.
6. **Ámbitos → tablas**: `settings` → `settings` (nunca claves `device.*`); `history` → `history`; `saved` → `saved_articles`; `analyses` → `analyses`; `topics` → `topics`, `watches`; `sources` → `custom_outlets`, `outlet_overrides`; `keys` → claves `ai.*` y `search.*` del llavero (solo si los dos lados lo activan para ese par; viajan dentro del canal cifrado y se guardan en el llavero del destino). Por defecto: todo menos `keys`.
7. **Transporte**: TCP directo en el puerto 47100 (nunca por Tor ni por el proveedor HTTP del subproyecto 2). El escritorio escucha solo con la sincronización activada (`device.sync.enabled`); el móvil es cliente. Windows mostrará su aviso de cortafuegos la primera vez.
8. **Direcciones**: mDNS anuncia `<device_id>._newpaper._tcp.local.` con TXT `fp`, `name`, `v`; las direcciones de Tailscale se detectan como IPv4 de `100.64.0.0/10` en las interfaces locales y se incluyen en el QR; además se pueden escribir a mano por par.
9. **`.npsync`**: `NPSYNC1\n` ‖ parámetros Argon2id (m, t, p) ‖ sal (16) ‖ nonce (24) ‖ JSON cifrado con todas las filas de los ámbitos elegidos. **Nunca** incluye claves de API (§11 "exportación de ajustes sin claves"). Parámetros por defecto m = 64 MiB, t = 3, p = 1.
10. **Migración**: ranura **7**.
11. **QR en la UI**: Rust devuelve la matriz de módulos y la UI dibuja rectángulos SVG (sin `data:` ni HTML inyectado, compatible con la CSP).

## Global Constraints

- §15: sin servidor ni cuenta; QR con clave pública X25519 efímera, huella y direcciones; HKDF; XChaCha20‑Poly1305 de extremo a extremo; mDNS `_newpaper._tcp`; Tailscale manual o detectado; HLC "último que escribe gana" por fila con lápida; `sync_log` con la marca de cada par; ámbitos activables (ajustes, historial, guardados, análisis y síntesis, temas seguidos, fuentes personalizadas); claves de API no por defecto, cifradas si se activan; al abrir, cada 5 minutos y "Sincronizar ahora"; revocar desde Ajustes › Dispositivos; `.npsync` con Argon2id; nunca por Tor ni terceros.
- §7: filas con `id` (UUID), `updated_at` (HLC) y `deleted`; claves `device.*` nunca se sincronizan.
- §11: claves solo en el llavero; exportación sin claves.
- Comandos nuevos en tres sitios (`build.rs::APP_COMMANDS`, `generate_handler!`, `capabilities/ui.json`) y `features.rs::setup_all`.
- **Política de tests**: llevan test la criptografía (acuerdo de claves, cifrado, manipulación, tercero sin clave), la fusión LWW con el diario (incluida la propagación desde un tercer dispositivo, lápidas, ámbitos y filas maliciosas), la migración 7 con pares y revocación, el protocolo completo de emparejamiento y sincronización sobre un canal en memoria, y el `.npsync` (ida y vuelta y frase incorrecta). Descubrimiento, servicio de la app y UI se comprueban compilando y con la prueba manual de la Tarea 11.

---

## Interfaces de subproyectos anteriores

- Subproyecto 1: `np_store::{Store (open, open_in_memory, with_conn, with_tx, clock, stamp, get_setting, set_setting, delete_setting), Hlc (FromStr), HlcClock::observe, ids::random_id, secrets::{SecretStore, MemorySecrets}, migrations::{Migration, MIGRATIONS}}`; tablas `settings`, `history`, `analyses`; `commands`, `registerSettingsSection`, `useSetting`.
- Subproyecto 3: tablas `saved_articles`, `topics`, `watches`, `custom_outlets`, `outlet_overrides` (todas con `id` único, `updated_at` y `deleted`).
- Subproyecto 6: ajuste `device.*` no sincronizable; `device.name`.

## Contratos que publica este plan

| Elemento | Lo usan |
|---|---|
| `np_sync::{identity::Identity, crypto, rows::{Scope, Row, changes_after, export_all, apply}, peers, wire, session::{serve, sync_with, pair_with, SyncContext, SyncReport}, pairing::{PairingManager, PairingOffer}, discovery, npsync}` | 8 (móvil reutiliza el crate) |
| Comandos `sync_status`, `sync_set_enabled`, `sync_set_name`, `sync_pair_start`, `sync_pair_cancel`, `sync_pair_with`, `sync_peers`, `sync_peer_update`, `sync_revoke`, `sync_now`, `sync_export`, `sync_import` | UI de este plan, 8 |
| Eventos `sync://status`, `sync://paired` | UI, 8 |

## Mapa de archivos

```
src-tauri/crates/np-sync/
  Cargo.toml  sql/0007_sync.sql
  src/lib.rs error.rs identity.rs crypto.rs rows.rs peers.rs wire.rs pairing.rs session.rs discovery.rs npsync.rs
  tests/protocol.rs
src-tauri/crates/np-store/src/migrations.rs        (Modify: ranura 7)
src-tauri/src/sync/{mod.rs, service.rs, commands.rs}
src-tauri/{Cargo.toml, build.rs, capabilities/ui.json, src/lib.rs, src/features.rs}   (Modify)
apps/ui/src/ipc/{types,commands,events}.ts          (Modify)
apps/ui/src/features/sync/{DevicesSection.tsx, QrCode.tsx, register.ts, sync.css}
packages/i18n/locales/{es,en,de}.json               (Modify: espacio `sync`)
```

Todos los comandos se ejecutan desde `E:\newpaper` en PowerShell.

---

### Task 1: Crate `np-sync` — identidad del dispositivo y criptografía de sesión y emparejamiento

**Files:**
- Create: `src-tauri/crates/np-sync/Cargo.toml`, `src/lib.rs`, `src/error.rs`, `src/identity.rs`, `src/crypto.rs`
- Test: `src-tauri/crates/np-sync/src/crypto.rs` (módulo `tests`)

**Interfaces:**
- Produces:
  - `SyncError` (`Crypto`, `Protocol(String)`, `Io`, `Json`, `Store(String)`, `Sql`, `Unauthorized`, `Expired`), `type Result<T>`
  - `identity::{Identity { device_id, name }, Identity::generate(name), Identity::load_or_create(secrets, name), public() -> PublicKey, public_b64(), fingerprint(&PublicKey) -> String, decode_pk(b64) -> Result<PublicKey>}`
  - `crypto::{SessionKeys { send: [u8; 32], recv: [u8; 32] }, ephemeral() -> (StaticSecret, PublicKey), session_keys(my: &Identity, my_eph, peer_static, peer_eph, peer_id) -> SessionKeys, pairing_keys(my_eph, peer_eph, secret: &[u8], initiator: bool) -> SessionKeys, seal(key, plaintext) -> Vec<u8>, open(key, data) -> Result<Vec<u8>>}`

- [ ] **Step 1: Crate**

`src-tauri/crates/np-sync/Cargo.toml`:
```toml
[package]
name = "np-sync"
version = "0.1.0"
edition = "2021"

[dependencies]
np-store = { path = "../np-store" }
x25519-dalek = { version = "=2.0.1", features = ["static_secrets"] }
chacha20poly1305 = "=0.10.1"
hkdf = "=0.12.4"
sha2 = "0.10"
argon2 = "=0.5.3"
rand_core = { version = "0.6.4", features = ["getrandom"] }
base64 = "=0.23.1"
qrcode = { version = "=0.14.1", default-features = false }
mdns-sd = "=0.21.5"
if-addrs = "=0.15.0"
serde = { workspace = true }
serde_json = { workspace = true }
thiserror = { workspace = true }
rusqlite = { workspace = true }
tokio = { workspace = true, features = ["net", "io-util"] }
tracing = { workspace = true }

[dev-dependencies]
tempfile = { workspace = true }
tokio = { workspace = true, features = ["net", "io-util", "macros", "rt-multi-thread"] }
```

`src-tauri/crates/np-sync/src/lib.rs`:
```rust
//! np-sync: sincronización sin cuenta entre dispositivos (§15).
pub mod crypto;
pub mod discovery;
pub mod error;
pub mod identity;
pub mod npsync;
pub mod pairing;
pub mod peers;
pub mod rows;
pub mod session;
pub mod wire;

pub use error::{Result, SyncError};
```

`src-tauri/crates/np-sync/src/error.rs`:
```rust
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SyncError {
    #[error("crypto failure")]
    Crypto,
    #[error("protocol: {0}")]
    Protocol(String),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
    #[error("store: {0}")]
    Store(String),
    #[error("sql: {0}")]
    Sql(#[from] rusqlite::Error),
    #[error("unknown or revoked device")]
    Unauthorized,
    #[error("pairing offer expired")]
    Expired,
}

impl From<np_store::StoreError> for SyncError {
    fn from(e: np_store::StoreError) -> Self {
        SyncError::Store(e.to_string())
    }
}

pub type Result<T> = std::result::Result<T, SyncError>;
```

> Mientras no existan, deja `discovery.rs`, `npsync.rs`, `pairing.rs`, `peers.rs`, `rows.rs`, `session.rs` y `wire.rs` con solo su comentario de módulo.

- [ ] **Step 2: Identidad**

`src-tauri/crates/np-sync/src/identity.rs`:
```rust
//! Identidad X25519 estática del dispositivo (llavero `sync.identity`).
use base64::Engine;
use np_store::secrets::SecretStore;
use rand_core::OsRng;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use x25519_dalek::{PublicKey, StaticSecret};

use crate::{Result, SyncError};

const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::URL_SAFE_NO_PAD;
pub const SECRET_KEY: &str = "sync.identity";

pub struct Identity {
    pub device_id: String,
    pub name: String,
    pub(crate) secret: StaticSecret,
}

#[derive(Serialize, Deserialize)]
struct Stored {
    id: String,
    sk: String,
}

impl Identity {
    pub fn generate(name: &str) -> Self {
        Self { device_id: np_store::ids::random_id(), name: name.into(), secret: StaticSecret::random_from_rng(OsRng) }
    }

    pub fn load_or_create(secrets: &dyn SecretStore, name: &str) -> Result<Self> {
        if let Some(raw) = secrets.get(SECRET_KEY)? {
            let s: Stored = serde_json::from_str(&raw)?;
            let bytes: [u8; 32] = B64.decode(&s.sk).map_err(|_| SyncError::Crypto)?.try_into().map_err(|_| SyncError::Crypto)?;
            return Ok(Self { device_id: s.id, name: name.into(), secret: StaticSecret::from(bytes) });
        }
        let me = Self::generate(name);
        secrets.set(SECRET_KEY, &serde_json::to_string(&Stored { id: me.device_id.clone(), sk: B64.encode(me.secret.to_bytes()) })?)?;
        Ok(me)
    }

    pub fn public(&self) -> PublicKey {
        PublicKey::from(&self.secret)
    }

    pub fn public_b64(&self) -> String {
        B64.encode(self.public().as_bytes())
    }
}

pub fn encode_pk(pk: &PublicKey) -> String {
    B64.encode(pk.as_bytes())
}

pub fn decode_pk(b64: &str) -> Result<PublicKey> {
    let bytes: [u8; 32] = B64.decode(b64).map_err(|_| SyncError::Crypto)?.try_into().map_err(|_| SyncError::Crypto)?;
    Ok(PublicKey::from(bytes))
}

pub fn fingerprint(pk: &PublicKey) -> String {
    let h = Sha256::digest(pk.as_bytes());
    let hex: String = h[..10].iter().map(|b| format!("{b:02X}")).collect();
    hex.as_bytes().chunks(4).map(|c| std::str::from_utf8(c).unwrap_or_default()).collect::<Vec<_>>().join("-")
}
```

- [ ] **Step 3: Escribir el test que falla**

`src-tauri/crates/np-sync/src/crypto.rs`:
```rust
//! X25519 + HKDF-SHA256 + XChaCha20-Poly1305 (§15).

#[cfg(test)]
mod tests {
    use super::*;
    use crate::identity::Identity;

    fn session(a: &Identity, b: &Identity) -> (SessionKeys, SessionKeys) {
        let (ae, aep) = ephemeral();
        let (be, bep) = ephemeral();
        (session_keys(a, &ae, &b.public(), &bep, &b.device_id), session_keys(b, &be, &a.public(), &aep, &a.device_id))
    }

    #[test]
    fn both_sides_derive_matching_directional_keys() {
        let (a, b) = (Identity::generate("pc"), Identity::generate("móvil"));
        let (ka, kb) = session(&a, &b);
        assert_eq!(ka.send, kb.recv);
        assert_eq!(ka.recv, kb.send);
        assert_ne!(ka.send, ka.recv);
        let sealed = seal(&ka.send, b"hola");
        assert_eq!(open(&kb.recv, &sealed).unwrap(), b"hola");
        assert_ne!(seal(&ka.send, b"hola"), sealed, "nonces must be random");
    }

    #[test]
    fn tampering_and_unknown_identities_fail() {
        let (a, b, eve) = (Identity::generate("pc"), Identity::generate("móvil"), Identity::generate("eve"));
        let (ka, _) = session(&a, &b);
        let mut sealed = seal(&ka.send, b"secreto");
        let last = sealed.len() - 1;
        sealed[last] ^= 1;
        let (_, kb) = session(&a, &b);
        assert!(open(&kb.recv, &sealed).is_err());
        // Eve se hace pasar por B con la clave pública de B pero sin su secreto estático.
        let (ae, _aep) = ephemeral();
        let (ee, eep) = ephemeral();
        let ka2 = session_keys(&a, &ae, &b.public(), &eep, &b.device_id);
        let ke = session_keys(&eve, &ee, &a.public(), &PublicKey::from(&ae), &a.device_id);
        assert!(open(&ka2.recv, &seal(&ke.send, b"soy B")).is_err());
    }

    #[test]
    fn pairing_keys_need_the_qr_secret() {
        let (ie, iep) = ephemeral();
        let (re, rep) = ephemeral();
        let ki = pairing_keys(&ie, &rep, b"0123456789abcdef", true);
        let kr = pairing_keys(&re, &iep, b"0123456789abcdef", false);
        assert_eq!(open(&kr.recv, &seal(&ki.send, b"id")).unwrap(), b"id");
        let wrong = pairing_keys(&re, &iep, b"fedcba9876543210", false);
        assert!(open(&wrong.recv, &seal(&ki.send, b"id")).is_err());
    }
}
```

- [ ] **Step 4: Ejecutar y ver que falla**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-sync crypto`
Expected: FAIL de compilación (`cannot find function ephemeral`).

- [ ] **Step 5: Implementación**

Añade encima de los tests en `crypto.rs`:
```rust
use chacha20poly1305::{
    aead::{Aead, AeadCore, KeyInit},
    XChaCha20Poly1305, XNonce,
};
use hkdf::Hkdf;
use rand_core::OsRng;
use sha2::{Digest, Sha256};
pub use x25519_dalek::{PublicKey, StaticSecret};

use crate::{identity::Identity, Result, SyncError};

#[derive(Clone)]
pub struct SessionKeys {
    pub send: [u8; 32],
    pub recv: [u8; 32],
}

/// Clave efímera por sesión (se descarta al terminar).
pub fn ephemeral() -> (StaticSecret, PublicKey) {
    let s = StaticSecret::random_from_rng(OsRng);
    let p = PublicKey::from(&s);
    (s, p)
}

fn expand(salt: &[u8], ikm: &[u8], label: &str) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(Some(salt), ikm);
    let mut out = [0u8; 32];
    hk.expand(label.as_bytes(), &mut out).expect("32 bytes is a valid HKDF length");
    out
}

/// `DH(efímera, efímera) ‖ DH(estática, estática)`: secreto hacia delante y autenticación mutua.
pub fn session_keys(me: &Identity, my_eph: &StaticSecret, peer_static: &PublicKey, peer_eph: &PublicKey, peer_id: &str) -> SessionKeys {
    let ee = my_eph.diffie_hellman(peer_eph);
    let ss = me.secret.diffie_hellman(peer_static);
    let my_eph_pub = PublicKey::from(my_eph);
    let i_am_a = me.device_id.as_str() < peer_id;
    let (a_epk, b_epk) = if i_am_a { (my_eph_pub, *peer_eph) } else { (*peer_eph, my_eph_pub) };
    let mut salt = Sha256::new();
    salt.update(a_epk.as_bytes());
    salt.update(b_epk.as_bytes());
    let salt = salt.finalize();
    let ikm = [ee.as_bytes().as_slice(), ss.as_bytes().as_slice()].concat();
    let ab = expand(&salt, &ikm, "np-sync-v1 a->b");
    let ba = expand(&salt, &ikm, "np-sync-v1 b->a");
    if i_am_a { SessionKeys { send: ab, recv: ba } } else { SessionKeys { send: ba, recv: ab } }
}

/// Emparejamiento: solo `DH(efímera, efímera)` con el secreto del QR como sal.
pub fn pairing_keys(my_eph: &StaticSecret, peer_eph: &PublicKey, secret: &[u8], initiator: bool) -> SessionKeys {
    let ee = my_eph.diffie_hellman(peer_eph);
    let ir = expand(secret, ee.as_bytes(), "np-pair-v1 i->r");
    let ri = expand(secret, ee.as_bytes(), "np-pair-v1 r->i");
    if initiator { SessionKeys { send: ir, recv: ri } } else { SessionKeys { send: ri, recv: ir } }
}

pub fn seal(key: &[u8; 32], plaintext: &[u8]) -> Vec<u8> {
    let cipher = XChaCha20Poly1305::new(key.into());
    let nonce = XChaCha20Poly1305::generate_nonce(&mut OsRng);
    let ct = cipher.encrypt(&nonce, plaintext).expect("encryption cannot fail for in-memory buffers");
    [nonce.as_slice(), ct.as_slice()].concat()
}

pub fn open(key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>> {
    if data.len() < 24 + 16 {
        return Err(SyncError::Crypto);
    }
    let cipher = XChaCha20Poly1305::new(key.into());
    cipher.decrypt(XNonce::from_slice(&data[..24]), &data[24..]).map_err(|_| SyncError::Crypto)
}
```

- [ ] **Step 6: Ejecutar y ver que pasa**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-sync crypto`
Expected: `test result: ok. 3 passed`.

- [ ] **Step 7: Commit**

```powershell
git add src-tauri/crates/np-sync
git commit -m "feat(np-sync): device identity and x25519/hkdf/xchacha20-poly1305 session and pairing crypto"
```

---

### Task 2: Migración 7 — pares, registro y diario de cambios con disparadores

**Files:**
- Create: `src-tauri/crates/np-sync/sql/0007_sync.sql`
- Modify: `src-tauri/crates/np-sync/src/peers.rs`, `src-tauri/crates/np-store/src/migrations.rs`
- Test: `src-tauri/crates/np-sync/src/peers.rs` (módulo `tests`)

**Interfaces:**
- Produces:
  - Tablas `sync_peers`, `sync_log (peer_id, sent_seq, last_error)`, `sync_journal (seq AUTOINCREMENT, tbl, row_id, UNIQUE(tbl, row_id))` y disparadores `AFTER INSERT`/`AFTER UPDATE` en `settings`, `history`, `saved_articles`, `analyses`, `topics`, `watches`, `custom_outlets`, `outlet_overrides`
  - `peers::{Peer { id, name, public_key, addresses: Vec<String>, scopes: Vec<Scope>, send_keys, paired_at, last_sync_at, revoked }, upsert, get, list, set_scopes, set_addresses, revoke, sent_seq, set_sent_seq, set_error, touch}`

- [ ] **Step 1: Esquema**

`src-tauri/crates/np-sync/sql/0007_sync.sql`:
```sql
CREATE TABLE IF NOT EXISTS sync_peers (
  id           TEXT PRIMARY KEY NOT NULL,
  name         TEXT NOT NULL,
  public_key   TEXT NOT NULL,
  addresses    TEXT NOT NULL DEFAULT '[]',
  scopes       TEXT NOT NULL DEFAULT '[]',
  send_keys    INTEGER NOT NULL DEFAULT 0,
  paired_at    INTEGER NOT NULL,
  last_sync_at INTEGER,
  revoked      INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sync_log (
  peer_id    TEXT PRIMARY KEY NOT NULL REFERENCES sync_peers(id) ON DELETE CASCADE,
  sent_seq   INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);
-- Diario local: la última modificación de cada fila sincronizable, con una secuencia creciente.
CREATE TABLE IF NOT EXISTS sync_journal (
  seq    INTEGER PRIMARY KEY AUTOINCREMENT,
  tbl    TEXT NOT NULL,
  row_id TEXT NOT NULL,
  UNIQUE (tbl, row_id)
);
CREATE TRIGGER IF NOT EXISTS sj_settings_i AFTER INSERT ON settings BEGIN INSERT OR REPLACE INTO sync_journal(tbl, row_id) VALUES ('settings', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_settings_u AFTER UPDATE ON settings BEGIN INSERT OR REPLACE INTO sync_journal(tbl, row_id) VALUES ('settings', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_history_i AFTER INSERT ON history BEGIN INSERT OR REPLACE INTO sync_journal(tbl, row_id) VALUES ('history', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_history_u AFTER UPDATE ON history BEGIN INSERT OR REPLACE INTO sync_journal(tbl, row_id) VALUES ('history', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_saved_i AFTER INSERT ON saved_articles BEGIN INSERT OR REPLACE INTO sync_journal(tbl, row_id) VALUES ('saved_articles', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_saved_u AFTER UPDATE ON saved_articles BEGIN INSERT OR REPLACE INTO sync_journal(tbl, row_id) VALUES ('saved_articles', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_analyses_i AFTER INSERT ON analyses BEGIN INSERT OR REPLACE INTO sync_journal(tbl, row_id) VALUES ('analyses', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_analyses_u AFTER UPDATE ON analyses BEGIN INSERT OR REPLACE INTO sync_journal(tbl, row_id) VALUES ('analyses', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_topics_i AFTER INSERT ON topics BEGIN INSERT OR REPLACE INTO sync_journal(tbl, row_id) VALUES ('topics', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_topics_u AFTER UPDATE ON topics BEGIN INSERT OR REPLACE INTO sync_journal(tbl, row_id) VALUES ('topics', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_watches_i AFTER INSERT ON watches BEGIN INSERT OR REPLACE INTO sync_journal(tbl, row_id) VALUES ('watches', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_watches_u AFTER UPDATE ON watches BEGIN INSERT OR REPLACE INTO sync_journal(tbl, row_id) VALUES ('watches', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_custom_i AFTER INSERT ON custom_outlets BEGIN INSERT OR REPLACE INTO sync_journal(tbl, row_id) VALUES ('custom_outlets', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_custom_u AFTER UPDATE ON custom_outlets BEGIN INSERT OR REPLACE INTO sync_journal(tbl, row_id) VALUES ('custom_outlets', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_overrides_i AFTER INSERT ON outlet_overrides BEGIN INSERT OR REPLACE INTO sync_journal(tbl, row_id) VALUES ('outlet_overrides', NEW.id); END;
CREATE TRIGGER IF NOT EXISTS sj_overrides_u AFTER UPDATE ON outlet_overrides BEGIN INSERT OR REPLACE INTO sync_journal(tbl, row_id) VALUES ('outlet_overrides', NEW.id); END;
-- Las filas ya existentes entran en el diario una vez.
INSERT OR IGNORE INTO sync_journal(tbl, row_id) SELECT 'settings', id FROM settings;
INSERT OR IGNORE INTO sync_journal(tbl, row_id) SELECT 'history', id FROM history;
INSERT OR IGNORE INTO sync_journal(tbl, row_id) SELECT 'saved_articles', id FROM saved_articles;
INSERT OR IGNORE INTO sync_journal(tbl, row_id) SELECT 'analyses', id FROM analyses;
INSERT OR IGNORE INTO sync_journal(tbl, row_id) SELECT 'topics', id FROM topics;
INSERT OR IGNORE INTO sync_journal(tbl, row_id) SELECT 'watches', id FROM watches;
INSERT OR IGNORE INTO sync_journal(tbl, row_id) SELECT 'custom_outlets', id FROM custom_outlets;
INSERT OR IGNORE INTO sync_journal(tbl, row_id) SELECT 'outlet_overrides', id FROM outlet_overrides;
```

En `src-tauri/crates/np-store/src/migrations.rs`, añade a `MIGRATIONS` (tras la 6):
```rust
    Migration { version: 7, name: "sync", sql: include_str!("../../np-sync/sql/0007_sync.sql") },
```

> `INSERT OR REPLACE` sobre `UNIQUE(tbl, row_id)` borra la entrada anterior y crea otra con secuencia nueva: el diario guarda una sola entrada por fila, siempre la más reciente.

- [ ] **Step 2: Escribir el test que falla**

`src-tauri/crates/np-sync/src/peers.rs`:
```rust
//! Pares emparejados y su registro (`sync_peers`, `sync_log`).

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rows::Scope;

    #[test]
    fn migration_7_journals_changes_and_peers_can_be_revoked() {
        let store = np_store::Store::open_in_memory().unwrap();
        store.set_setting("general.locale", &"es").unwrap();
        let n: i64 = store.with_conn(|c| c.query_row("SELECT count(*) FROM sync_journal WHERE tbl = 'settings'", [], |r| r.get(0))).unwrap();
        assert_eq!(n, 1);
        store.set_setting("general.locale", &"en").unwrap();
        let (n, seq): (i64, i64) = store.with_conn(|c| c.query_row("SELECT count(*), max(seq) FROM sync_journal WHERE tbl = 'settings'", [], |r| Ok((r.get(0)?, r.get(1)?)))).unwrap();
        assert_eq!(n, 1, "one journal entry per row");
        assert!(seq >= 2);

        let p = Peer { id: "m1".into(), name: "Pixel".into(), public_key: "pk".into(), addresses: vec!["192.168.1.9:47100".into()], scopes: vec![Scope::Settings, Scope::Saved], send_keys: false, paired_at: 1, last_sync_at: None, revoked: false };
        upsert(&store, &p).unwrap();
        assert_eq!(get(&store, "m1").unwrap().unwrap().scopes, vec![Scope::Settings, Scope::Saved]);
        assert_eq!(sent_seq(&store, "m1").unwrap(), 0);
        set_sent_seq(&store, "m1", 42).unwrap();
        assert_eq!(sent_seq(&store, "m1").unwrap(), 42);
        revoke(&store, "m1").unwrap();
        let r = get(&store, "m1").unwrap().unwrap();
        assert!(r.revoked);
        assert!(r.addresses.is_empty());
        assert!(list(&store).unwrap().iter().all(|x| x.id != "m1" || x.revoked));
    }
}
```

> `Store::open_in_memory()` aplica todas las migraciones registradas (1–7), así que las tablas de los subproyectos 1 y 3 existen.

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-sync peers`
Expected: FAIL de compilación (falta `Peer` y `rows::Scope`; la Tarea 3 define `Scope`: crea ya en `rows.rs` el enum del Step 4 de la Tarea 3 para poder compilar).

- [ ] **Step 4: Implementación**

Añade encima de los tests en `peers.rs`:
```rust
use np_store::Store;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

use crate::{rows::Scope, Result};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Peer {
    pub id: String,
    pub name: String,
    pub public_key: String,
    pub addresses: Vec<String>,
    pub scopes: Vec<Scope>,
    pub send_keys: bool,
    pub paired_at: i64,
    pub last_sync_at: Option<i64>,
    pub revoked: bool,
}

const COLS: &str = "id, name, public_key, addresses, scopes, send_keys, paired_at, last_sync_at, revoked";

fn from_row(r: &rusqlite::Row<'_>) -> rusqlite::Result<Peer> {
    let addresses: String = r.get(3)?;
    let scopes: String = r.get(4)?;
    Ok(Peer {
        id: r.get(0)?,
        name: r.get(1)?,
        public_key: r.get(2)?,
        addresses: serde_json::from_str(&addresses).unwrap_or_default(),
        scopes: serde_json::from_str(&scopes).unwrap_or_default(),
        send_keys: r.get::<_, i64>(5)? != 0,
        paired_at: r.get(6)?,
        last_sync_at: r.get(7)?,
        revoked: r.get::<_, i64>(8)? != 0,
    })
}

pub fn upsert(store: &Store, p: &Peer) -> Result<()> {
    let addresses = serde_json::to_string(&p.addresses)?;
    let scopes = serde_json::to_string(&p.scopes)?;
    store.with_tx(|tx| {
        tx.execute(
            &format!("INSERT INTO sync_peers({COLS}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
              ON CONFLICT(id) DO UPDATE SET name = excluded.name, public_key = excluded.public_key, addresses = excluded.addresses,
                scopes = excluded.scopes, send_keys = excluded.send_keys, revoked = excluded.revoked"),
            params![p.id, p.name, p.public_key, addresses, scopes, p.send_keys as i64, p.paired_at, p.last_sync_at, p.revoked as i64],
        )?;
        tx.execute("INSERT OR IGNORE INTO sync_log(peer_id) VALUES (?1)", [&p.id])?;
        Ok(())
    })?;
    Ok(())
}

pub fn get(store: &Store, id: &str) -> Result<Option<Peer>> {
    Ok(store.with_conn(|c| c.query_row(&format!("SELECT {COLS} FROM sync_peers WHERE id = ?1"), [id], from_row).optional())?)
}

pub fn list(store: &Store) -> Result<Vec<Peer>> {
    Ok(store.with_conn(|c| {
        let mut st = c.prepare(&format!("SELECT {COLS} FROM sync_peers ORDER BY revoked, paired_at DESC"))?;
        let rows = st.query_map([], from_row)?;
        rows.collect()
    })?)
}

pub fn set_scopes(store: &Store, id: &str, scopes: &[Scope], send_keys: bool) -> Result<()> {
    let s = serde_json::to_string(scopes)?;
    store.with_conn(|c| c.execute("UPDATE sync_peers SET scopes = ?2, send_keys = ?3 WHERE id = ?1", params![id, s, send_keys as i64]))?;
    Ok(())
}

pub fn set_addresses(store: &Store, id: &str, addresses: &[String]) -> Result<()> {
    let a = serde_json::to_string(addresses)?;
    store.with_conn(|c| c.execute("UPDATE sync_peers SET addresses = ?2 WHERE id = ?1", params![id, a]))?;
    Ok(())
}

/// Revocar: el par deja de ser aceptado; se olvidan sus direcciones y su marca.
pub fn revoke(store: &Store, id: &str) -> Result<()> {
    store.with_tx(|tx| {
        tx.execute("UPDATE sync_peers SET revoked = 1, addresses = '[]', send_keys = 0 WHERE id = ?1", [id])?;
        tx.execute("UPDATE sync_log SET sent_seq = 0 WHERE peer_id = ?1", [id])?;
        Ok(())
    })?;
    Ok(())
}

pub fn sent_seq(store: &Store, id: &str) -> Result<i64> {
    Ok(store.with_conn(|c| c.query_row("SELECT sent_seq FROM sync_log WHERE peer_id = ?1", [id], |r| r.get(0)).optional())?.unwrap_or(0))
}

pub fn set_sent_seq(store: &Store, id: &str, seq: i64) -> Result<()> {
    store.with_conn(|c| c.execute("UPDATE sync_log SET sent_seq = max(sent_seq, ?2), last_error = NULL WHERE peer_id = ?1", params![id, seq]))?;
    Ok(())
}

pub fn set_error(store: &Store, id: &str, error: Option<&str>) -> Result<()> {
    store.with_conn(|c| c.execute("UPDATE sync_log SET last_error = ?2 WHERE peer_id = ?1", params![id, error]))?;
    Ok(())
}

pub fn touch(store: &Store, id: &str, at: i64) -> Result<()> {
    store.with_conn(|c| c.execute("UPDATE sync_peers SET last_sync_at = ?2 WHERE id = ?1", params![id, at]))?;
    Ok(())
}
```

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-sync peers`
Expected: `test result: ok. 1 passed`.

- [ ] **Step 6: Commit**

```powershell
git add src-tauri/crates/np-sync src-tauri/crates/np-store/src/migrations.rs
git commit -m "feat(np-sync): migration 7 with peers, sync log and trigger-fed change journal"
```

---

### Task 3: Fusión LWW por fila con HLC, lápidas, ámbitos y filas maliciosas

**Files:**
- Modify: `src-tauri/crates/np-sync/src/rows.rs`
- Test: `src-tauri/crates/np-sync/src/rows.rs` (módulo `tests`)

**Interfaces:**
- Produces:
  - `Scope { Settings, History, Saved, Analyses, Topics, Sources, Keys }` (serde en minúsculas), `Scope::ALL_DATA`, `Scope::DEFAULT` (todo menos `Keys`)
  - `TABLES: &[(&str, Scope)]`
  - `Row { seq: i64, table: String, data: serde_json::Map<String, Value> }` (`data` incluye `id`, `updated_at`, `deleted`)
  - `changes_after(store, scopes, after_seq, limit) -> Result<(Vec<Row>, i64 /* última seq leída */)>` — en orden de diario; filtra ámbitos y `device.*`
  - `export_all(store, scopes) -> Result<Vec<Row>>`
  - `apply(store, rows, scopes) -> Result<usize>` — LWW por `updated_at` (cadena HLC ordenable), observa cada HLC remoto en el reloj local; descarta tablas desconocidas, columnas inexistentes y `device.*`

- [ ] **Step 1: Escribir el test que falla**

`src-tauri/crates/np-sync/src/rows.rs`:
```rust
//! Filas sincronizables: diario, exportación y fusión "el último que escribe gana" (§15).

#[cfg(test)]
mod tests {
    use super::*;
    use np_store::Store;

    fn all(s: &Store) -> Vec<Row> {
        changes_after(s, Scope::DEFAULT, 0, 10_000).unwrap().0
    }

    #[test]
    fn last_writer_wins_with_tombstones_and_without_device_keys() {
        let (a, b) = (Store::open_in_memory().unwrap(), Store::open_in_memory().unwrap());
        a.set_setting("general.locale", &"en").unwrap();
        a.set_setting("device.updates.channel", &"beta").unwrap();
        let rows = all(&a);
        assert!(rows.iter().all(|r| r.data.get("key").and_then(|k| k.as_str()).map_or(true, |k| !k.starts_with("device."))));
        assert!(apply(&b, &rows, Scope::DEFAULT).unwrap() >= 1);
        assert_eq!(b.get_setting::<String>("general.locale").unwrap().as_deref(), Some("en"));
        assert_eq!(b.get_setting::<String>("device.updates.channel").unwrap(), None);

        // B escribe después (su reloj ya observó el de A): gana B y reaplicar lo viejo no cambia nada.
        b.set_setting("general.locale", &"de").unwrap();
        assert_eq!(apply(&b, &rows, Scope::DEFAULT).unwrap(), 0);
        assert_eq!(b.get_setting::<String>("general.locale").unwrap().as_deref(), Some("de"));
        apply(&a, &all(&b), Scope::DEFAULT).unwrap();
        assert_eq!(a.get_setting::<String>("general.locale").unwrap().as_deref(), Some("de"));

        // Lápida.
        a.delete_setting("general.locale").unwrap();
        apply(&b, &all(&a), Scope::DEFAULT).unwrap();
        assert_eq!(b.get_setting::<String>("general.locale").unwrap(), None);
    }

    #[test]
    fn journal_forwards_rows_from_a_third_device_even_with_older_clocks() {
        let (a, b, c) = (Store::open_in_memory().unwrap(), Store::open_in_memory().unwrap(), Store::open_in_memory().unwrap());
        c.set_setting("reader.autoOpen", &false).unwrap(); // C escribe primero (HLC antiguo)
        a.set_setting("general.locale", &"en").unwrap();
        apply(&b, &all(&a), Scope::DEFAULT).unwrap();
        let (_, a_mark) = changes_after(&b, Scope::DEFAULT, 0, 10_000).unwrap(); // A ya recibió todo lo de B hasta aquí
        apply(&b, &all(&c), Scope::DEFAULT).unwrap(); // llega lo de C, más antiguo que lo de A
        let (rows, _) = changes_after(&b, Scope::DEFAULT, a_mark, 10_000).unwrap();
        apply(&a, &rows, Scope::DEFAULT).unwrap();
        assert_eq!(a.get_setting::<bool>("reader.autoOpen").unwrap(), Some(false));
    }

    #[test]
    fn scopes_and_malicious_rows_are_filtered() {
        let (a, b) = (Store::open_in_memory().unwrap(), Store::open_in_memory().unwrap());
        a.set_setting("general.locale", &"en").unwrap();
        assert_eq!(apply(&b, &all(&a), &[Scope::History]).unwrap(), 0);
        let mut evil = all(&a)[0].clone();
        evil.table = "local_meta".into();
        assert_eq!(apply(&b, &[evil], Scope::DEFAULT).unwrap(), 0);
        let mut evil = all(&a)[0].clone();
        evil.data.insert("value\"); DROP TABLE settings; --".into(), serde_json::json!(1));
        assert!(apply(&b, &[evil], Scope::DEFAULT).is_err() || b.get_setting::<String>("general.locale").unwrap().is_none());
        let mut dev = all(&a)[0].clone();
        dev.data.insert("key".into(), serde_json::json!("device.name"));
        assert_eq!(apply(&b, &[dev], Scope::DEFAULT).unwrap(), 0);
    }
}
```

> El test usa `Store::delete_setting` (subproyecto 1), que deja la fila con `deleted = 1` y un `updated_at` nuevo.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-sync rows`
Expected: FAIL de compilación (`cannot find function changes_after`).

- [ ] **Step 3: Implementación**

Añade encima de los tests en `rows.rs`:
```rust
use std::{collections::HashSet, str::FromStr};

use np_store::{Hlc, Store};
use rusqlite::{types::ValueRef, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::{Result, SyncError};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Scope {
    Settings,
    History,
    Saved,
    Analyses,
    Topics,
    Sources,
    Keys,
}

impl Scope {
    pub const DEFAULT: &'static [Scope] = &[Scope::Settings, Scope::History, Scope::Saved, Scope::Analyses, Scope::Topics, Scope::Sources];
}

pub const TABLES: &[(&str, Scope)] = &[
    ("settings", Scope::Settings),
    ("history", Scope::History),
    ("saved_articles", Scope::Saved),
    ("analyses", Scope::Analyses),
    ("topics", Scope::Topics),
    ("watches", Scope::Topics),
    ("custom_outlets", Scope::Sources),
    ("outlet_overrides", Scope::Sources),
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Row {
    pub seq: i64,
    pub table: String,
    pub data: Map<String, Value>,
}

fn scope_of(table: &str) -> Option<Scope> {
    TABLES.iter().find(|(t, _)| *t == table).map(|(_, s)| *s)
}

fn is_device_setting(table: &str, data: &Map<String, Value>) -> bool {
    table == "settings" && data.get("key").and_then(|k| k.as_str()).is_some_and(|k| k.starts_with("device."))
}

fn to_json(v: ValueRef<'_>) -> Value {
    match v {
        ValueRef::Null => Value::Null,
        ValueRef::Integer(i) => Value::from(i),
        ValueRef::Real(f) => Value::from(f),
        ValueRef::Text(t) => Value::from(String::from_utf8_lossy(t).to_string()),
        ValueRef::Blob(_) => Value::Null, // ninguna tabla sincronizable guarda blobs
    }
}

fn read_row(c: &rusqlite::Connection, table: &str, id: &str) -> rusqlite::Result<Option<Map<String, Value>>> {
    let mut st = c.prepare(&format!("SELECT * FROM {table} WHERE id = ?1"))?;
    let names: Vec<String> = st.column_names().iter().map(|s| s.to_string()).collect();
    st.query_row([id], |r| {
        let mut m = Map::new();
        for (i, n) in names.iter().enumerate() {
            m.insert(n.clone(), to_json(r.get_ref(i)?));
        }
        Ok(m)
    })
    .optional()
}

pub fn changes_after(store: &Store, scopes: &[Scope], after_seq: i64, limit: usize) -> Result<(Vec<Row>, i64)> {
    let wanted: HashSet<Scope> = scopes.iter().copied().collect();
    Ok(store.with_conn(|c| {
        let mut st = c.prepare("SELECT seq, tbl, row_id FROM sync_journal WHERE seq > ?1 ORDER BY seq LIMIT ?2")?;
        let entries: Vec<(i64, String, String)> = st.query_map(rusqlite::params![after_seq, limit as i64], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?.collect::<rusqlite::Result<_>>()?;
        let mut last = after_seq;
        let mut out = Vec::new();
        for (seq, tbl, id) in entries {
            last = seq;
            if !scope_of(&tbl).is_some_and(|s| wanted.contains(&s)) {
                continue;
            }
            if let Some(data) = read_row(c, &tbl, &id)? {
                if !is_device_setting(&tbl, &data) {
                    out.push(Row { seq, table: tbl, data });
                }
            }
        }
        Ok((out, last))
    })?)
}

pub fn export_all(store: &Store, scopes: &[Scope]) -> Result<Vec<Row>> {
    let mut all = Vec::new();
    let mut after = 0;
    loop {
        let (rows, last) = changes_after(store, scopes, after, 1000)?;
        if last == after {
            break;
        }
        all.extend(rows);
        after = last;
    }
    Ok(all)
}

fn columns(c: &rusqlite::Connection, table: &str) -> rusqlite::Result<HashSet<String>> {
    let mut st = c.prepare(&format!("PRAGMA table_info({table})"))?;
    let cols = st.query_map([], |r| r.get::<_, String>(1))?.collect::<rusqlite::Result<HashSet<_>>>()?;
    Ok(cols)
}

fn to_sql(v: &Value) -> rusqlite::types::Value {
    match v {
        Value::Null => rusqlite::types::Value::Null,
        Value::Bool(b) => rusqlite::types::Value::Integer(*b as i64),
        Value::Number(n) => n.as_i64().map(rusqlite::types::Value::Integer).unwrap_or_else(|| rusqlite::types::Value::Real(n.as_f64().unwrap_or(0.0))),
        Value::String(s) => rusqlite::types::Value::Text(s.clone()),
        other => rusqlite::types::Value::Text(other.to_string()),
    }
}

/// Aplica filas remotas: gana el `updated_at` (HLC) mayor; los empates no cambian nada.
pub fn apply(store: &Store, rows: &[Row], scopes: &[Scope]) -> Result<usize> {
    let wanted: HashSet<Scope> = scopes.iter().copied().collect();
    for r in rows {
        if let Some(h) = r.data.get("updated_at").and_then(|v| v.as_str()).and_then(|s| Hlc::from_str(s).ok()) {
            store.clock().observe(&h);
        }
    }
    let applied = store.with_tx(|tx| {
        let mut n = 0;
        for r in rows {
            let Some(scope) = scope_of(&r.table) else { continue };
            if !wanted.contains(&scope) || is_device_setting(&r.table, &r.data) {
                continue;
            }
            let (Some(id), Some(remote)) = (r.data.get("id").and_then(|v| v.as_str()), r.data.get("updated_at").and_then(|v| v.as_str())) else { continue };
            let cols = columns(tx, &r.table)?;
            if r.data.keys().any(|k| !cols.contains(k)) {
                return Err(rusqlite::Error::InvalidColumnName("unknown column in remote row".into()));
            }
            let local: Option<String> = tx.query_row(&format!("SELECT updated_at FROM {} WHERE id = ?1", r.table), [id], |x| x.get(0)).optional()?;
            if local.as_deref().is_some_and(|l| l >= remote) {
                continue;
            }
            let names: Vec<&String> = r.data.keys().collect();
            let sql = format!(
                "INSERT OR REPLACE INTO {} ({}) VALUES ({})",
                r.table,
                names.iter().map(|n| format!("\"{n}\"")).collect::<Vec<_>>().join(", "),
                (1..=names.len()).map(|i| format!("?{i}")).collect::<Vec<_>>().join(", ")
            );
            let values: Vec<rusqlite::types::Value> = names.iter().map(|n| to_sql(&r.data[*n])).collect();
            tx.execute(&sql, rusqlite::params_from_iter(values))?;
            n += 1;
        }
        Ok(n)
    });
    applied.map_err(|e| SyncError::Store(e.to_string()))
}
```

> Los nombres de tabla salen de `TABLES` (constantes) y las columnas se comprueban contra `PRAGMA table_info` antes de construir el SQL: una fila con una columna inventada se rechaza entera. `Hlc` debe estar reexportado en la raíz de `np_store` (el subproyecto 1 lo hace); si está en `np_store::hlc::Hlc`, ajusta el `use`.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-sync`
Expected: `crypto` 3, `peers` 1 y `rows` 3 tests en verde.

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/crates/np-sync
git commit -m "feat(np-sync): journal-driven changes and last-writer-wins merge with tombstones, scopes and row validation"
```

---
### Task 4: Protocolo — tramas, emparejamiento por QR y sesión de sincronización con claves opcionales

**Files:**
- Modify: `src-tauri/crates/np-sync/src/wire.rs`, `src-tauri/crates/np-sync/src/pairing.rs`, `src-tauri/crates/np-sync/src/session.rs`
- Test: `src-tauri/crates/np-sync/tests/protocol.rs`

**Interfaces:**
- Produces:
  - `wire::{MAX_FRAME (16 MiB), read_frame, write_frame, Hello { Sync { id, epk } | Pair { id, name, epk } | Reject { reason } }, Msg { Who | Scopes | Changes | Done | Ack | Keys | Error }, Channel::{new, send, recv}}`
  - `pairing::{PairingOffer { v, id, name, pk, epk, secret, addrs }, PairingOffer::{encode() -> "np1:…", decode(&str), qr_modules() -> (usize, Vec<bool>)}, PairingManager::{new, start(identity, addrs, ttl) -> PairingOffer, cancel, take_valid}}` (oferta de un solo uso)
  - `session::{SyncContext { store, identity, secrets, pairing }, SyncReport { peer_id, peer_name, sent, received, applied, keys, paired }, serve(io, ctx), sync_with(io, ctx, peer), pair_with(io, ctx, offer) -> Peer}`
  - Ámbitos efectivos de una sesión = intersección de los de cada lado para ese par; las claves (`ai.*`, `search.*`) solo viajan si los dos lados activan `keys` y `send_keys`

- [ ] **Step 1: Escribir el test que falla**

`src-tauri/crates/np-sync/tests/protocol.rs`:
```rust
use std::{sync::Arc, time::Duration};

use np_store::{secrets::MemorySecrets, secrets::SecretStore, Store};
use np_sync::{
    identity::Identity,
    pairing::{PairingManager, PairingOffer},
    peers,
    rows::Scope,
    session::{pair_with, serve, sync_with, SyncContext},
    SyncError,
};

fn ctx(name: &str) -> SyncContext {
    SyncContext {
        store: Arc::new(Store::open_in_memory().unwrap()),
        identity: Arc::new(Identity::generate(name)),
        secrets: Arc::new(MemorySecrets::default()),
        pairing: Arc::new(PairingManager::new()),
    }
}

#[tokio::test]
async fn pairs_by_qr_then_syncs_both_ways_and_rejects_revoked_devices() {
    let (pc, mobile) = (ctx("pc"), ctx("móvil"));
    let offer = pc.pairing.start(&pc.identity, vec!["127.0.0.1:47100".into()], Duration::from_secs(120));
    let scanned = PairingOffer::decode(&offer.encode()).unwrap();
    assert!(offer.qr_modules().0 >= 21);

    let (mut a, mut b) = tokio::io::duplex(1 << 20);
    let (srv, cli) = tokio::join!(serve(&mut a, &pc), pair_with(&mut b, &mobile, &scanned));
    assert!(srv.unwrap().paired);
    let pc_as_peer = cli.unwrap();
    assert_eq!(pc_as_peer.id, pc.identity.device_id);
    assert!(peers::get(&pc.store, &mobile.identity.device_id).unwrap().is_some());

    // La oferta sirve una sola vez.
    let (mut a, mut b) = tokio::io::duplex(1 << 20);
    let (srv, cli) = tokio::join!(serve(&mut a, &pc), pair_with(&mut b, &ctx("intruso"), &scanned));
    assert!(srv.is_err() && cli.is_err());

    pc.store.set_setting("general.locale", &"en").unwrap();
    mobile.store.set_setting("reader.autoOpen", &false).unwrap();
    let (mut a, mut b) = tokio::io::duplex(1 << 20);
    let (s, c) = tokio::join!(serve(&mut a, &pc), sync_with(&mut b, &mobile, &pc_as_peer));
    let (s, c) = (s.unwrap(), c.unwrap());
    assert!(s.applied >= 1 && c.applied >= 1);
    assert_eq!(pc.store.get_setting::<bool>("reader.autoOpen").unwrap(), Some(false));
    assert_eq!(mobile.store.get_setting::<String>("general.locale").unwrap().as_deref(), Some("en"));

    // Segunda sesión: nada nuevo que aplicar.
    let (mut a, mut b) = tokio::io::duplex(1 << 20);
    let (s, c) = tokio::join!(serve(&mut a, &pc), sync_with(&mut b, &mobile, &pc_as_peer));
    assert_eq!(s.unwrap().applied + c.unwrap().applied, 0);

    peers::revoke(&pc.store, &mobile.identity.device_id).unwrap();
    let (mut a, mut b) = tokio::io::duplex(1 << 20);
    let (s, c) = tokio::join!(serve(&mut a, &pc), sync_with(&mut b, &mobile, &pc_as_peer));
    assert!(matches!(s, Err(SyncError::Unauthorized)));
    assert!(matches!(c, Err(SyncError::Unauthorized)));
}

#[tokio::test]
async fn api_keys_travel_only_when_both_sides_opt_in() {
    let (pc, mobile) = (ctx("pc"), ctx("móvil"));
    let offer = pc.pairing.start(&pc.identity, vec![], Duration::from_secs(120));
    let (mut a, mut b) = tokio::io::duplex(1 << 20);
    let (_, cli) = tokio::join!(serve(&mut a, &pc), pair_with(&mut b, &mobile, &offer));
    let mut pc_as_peer = cli.unwrap();
    pc.store.set_setting("ai.connected", &vec!["openai"]).unwrap();
    pc.secrets.set("ai.openai", "sk-proj-test-value").unwrap();

    // Solo el móvil lo activa: no viaja.
    let mut with_keys: Vec<Scope> = Scope::DEFAULT.to_vec();
    with_keys.push(Scope::Keys);
    peers::set_scopes(&mobile.store, &pc_as_peer.id, &with_keys, true).unwrap();
    pc_as_peer = peers::get(&mobile.store, &pc_as_peer.id).unwrap().unwrap();
    let (mut a, mut b) = tokio::io::duplex(1 << 20);
    let (s, c) = tokio::join!(serve(&mut a, &pc), sync_with(&mut b, &mobile, &pc_as_peer));
    s.unwrap();
    c.unwrap();
    assert_eq!(mobile.secrets.get("ai.openai").unwrap(), None);

    // Los dos lo activan: viaja cifrada y queda en el llavero del móvil.
    peers::set_scopes(&pc.store, &mobile.identity.device_id, &with_keys, true).unwrap();
    let (mut a, mut b) = tokio::io::duplex(1 << 20);
    let (s, c) = tokio::join!(serve(&mut a, &pc), sync_with(&mut b, &mobile, &pc_as_peer));
    assert!(s.unwrap().keys >= 1 || c.as_ref().unwrap().keys >= 1);
    assert_eq!(mobile.secrets.get("ai.openai").unwrap().as_deref(), Some("sk-proj-test-value"));
}
```

> El valor `sk-proj-test-value` es un dato de prueba en memoria (`MemorySecrets`), no una clave real.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-sync --test protocol`
Expected: FAIL de compilación.

- [ ] **Step 3: Tramas y mensajes**

`src-tauri/crates/np-sync/src/wire.rs`:
```rust
//! Tramas `u32 BE ‖ cuerpo`. El saludo va en claro; todo lo demás, cifrado con la clave de sesión.
use serde::{Deserialize, Serialize};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};

use crate::{
    crypto::{open, seal, SessionKeys},
    rows::{Row, Scope},
    Result, SyncError,
};

pub const MAX_FRAME: usize = 16 * 1024 * 1024;

pub async fn write_frame<W: AsyncWrite + Unpin>(w: &mut W, body: &[u8]) -> Result<()> {
    if body.len() > MAX_FRAME {
        return Err(SyncError::Protocol("frame too large".into()));
    }
    w.write_all(&(body.len() as u32).to_be_bytes()).await?;
    w.write_all(body).await?;
    w.flush().await?;
    Ok(())
}

pub async fn read_frame<R: AsyncRead + Unpin>(r: &mut R) -> Result<Vec<u8>> {
    let mut len = [0u8; 4];
    r.read_exact(&mut len).await?;
    let len = u32::from_be_bytes(len) as usize;
    if len > MAX_FRAME {
        return Err(SyncError::Protocol("frame too large".into()));
    }
    let mut buf = vec![0u8; len];
    r.read_exact(&mut buf).await?;
    Ok(buf)
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "t", rename_all = "camelCase")]
pub enum Hello {
    Sync { id: String, epk: String },
    Pair { id: String, name: String, epk: String },
    Reject { reason: String },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "t", rename_all = "camelCase")]
pub enum Msg {
    Who { id: String, name: String, pk: String },
    Scopes { scopes: Vec<Scope>, send_keys: bool },
    Changes { rows: Vec<Row> },
    Done { last_seq: i64 },
    Ack { seq: i64 },
    Keys { entries: Vec<(String, String)> },
    Error { message: String },
}

pub async fn send_hello<W: AsyncWrite + Unpin>(w: &mut W, h: &Hello) -> Result<()> {
    write_frame(w, &serde_json::to_vec(h)?).await
}

pub async fn recv_hello<R: AsyncRead + Unpin>(r: &mut R) -> Result<Hello> {
    Ok(serde_json::from_slice(&read_frame(r).await?)?)
}

pub struct Channel<'a, S> {
    io: &'a mut S,
    keys: SessionKeys,
}

impl<'a, S: AsyncRead + AsyncWrite + Unpin> Channel<'a, S> {
    pub fn new(io: &'a mut S, keys: SessionKeys) -> Self {
        Self { io, keys }
    }
    pub async fn send(&mut self, m: &Msg) -> Result<()> {
        write_frame(self.io, &seal(&self.keys.send, &serde_json::to_vec(m)?)).await
    }
    pub async fn recv(&mut self) -> Result<Msg> {
        let frame = read_frame(self.io).await?;
        Ok(serde_json::from_slice(&open(&self.keys.recv, &frame)?)?)
    }
}
```

- [ ] **Step 4: Ofertas de emparejamiento**

`src-tauri/crates/np-sync/src/pairing.rs`:
```rust
//! Oferta de emparejamiento que muestra el QR (§15): clave estática, efímera, secreto y direcciones.
use std::{
    sync::Mutex,
    time::{Duration, Instant},
};

use base64::Engine;
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};

use crate::{
    crypto::{ephemeral, StaticSecret},
    identity::{encode_pk, Identity},
    Result, SyncError,
};

const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::URL_SAFE_NO_PAD;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PairingOffer {
    pub v: u8,
    pub id: String,
    pub name: String,
    pub pk: String,
    pub epk: String,
    pub secret: String,
    pub addrs: Vec<String>,
}

impl PairingOffer {
    pub fn encode(&self) -> String {
        format!("np1:{}", B64.encode(serde_json::to_vec(self).expect("serializable")))
    }

    pub fn decode(s: &str) -> Result<Self> {
        let body = s.trim().strip_prefix("np1:").ok_or_else(|| SyncError::Protocol("not a newpaper pairing code".into()))?;
        let bytes = B64.decode(body).map_err(|_| SyncError::Protocol("bad pairing code".into()))?;
        let o: PairingOffer = serde_json::from_slice(&bytes)?;
        if o.v != 1 {
            return Err(SyncError::Protocol("unsupported pairing version".into()));
        }
        Ok(o)
    }

    pub fn secret_bytes(&self) -> Result<Vec<u8>> {
        B64.decode(&self.secret).map_err(|_| SyncError::Crypto)
    }

    /// Matriz del QR (fila a fila, `true` = módulo oscuro) para dibujarla en la UI.
    pub fn qr_modules(&self) -> (usize, Vec<bool>) {
        let code = qrcode::QrCode::new(self.encode().as_bytes()).expect("pairing code fits in a QR");
        let width = code.width();
        let modules = code.to_colors().into_iter().map(|c| c == qrcode::Color::Dark).collect();
        (width, modules)
    }
}

pub struct ActiveOffer {
    pub offer: PairingOffer,
    pub eph: StaticSecret,
    pub secret: Vec<u8>,
    pub expires: Instant,
}

#[derive(Default)]
pub struct PairingManager {
    active: Mutex<Option<ActiveOffer>>,
}

impl PairingManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn start(&self, me: &Identity, addrs: Vec<String>, ttl: Duration) -> PairingOffer {
        let (eph, epk) = ephemeral();
        let mut secret = vec![0u8; 16];
        OsRng.fill_bytes(&mut secret);
        let offer = PairingOffer { v: 1, id: me.device_id.clone(), name: me.name.clone(), pk: me.public_b64(), epk: encode_pk(&epk), secret: B64.encode(&secret), addrs };
        *self.active.lock().expect("lock") = Some(ActiveOffer { offer: offer.clone(), eph, secret, expires: Instant::now() + ttl });
        offer
    }

    pub fn cancel(&self) {
        *self.active.lock().expect("lock") = None;
    }

    /// Un solo uso: la oferta se consume aunque luego falle el emparejamiento.
    pub fn take_valid(&self) -> Result<ActiveOffer> {
        let a = self.active.lock().expect("lock").take().ok_or(SyncError::Unauthorized)?;
        if Instant::now() > a.expires {
            return Err(SyncError::Expired);
        }
        Ok(a)
    }
}
```

- [ ] **Step 5: Sesión**

`src-tauri/crates/np-sync/src/session.rs`:
```rust
//! Emparejamiento y sesión de sincronización sobre cualquier flujo de bytes.
use std::sync::Arc;

use np_store::{secrets::SecretStore, Store};
use serde::Serialize;
use tokio::io::{AsyncRead, AsyncWrite};

use crate::{
    crypto::{ephemeral, pairing_keys, session_keys},
    identity::{decode_pk, encode_pk, Identity},
    pairing::{PairingManager, PairingOffer},
    peers::{self, Peer},
    rows::{apply, changes_after, Scope},
    wire::{recv_hello, send_hello, Channel, Hello, Msg},
    Result, SyncError,
};

pub struct SyncContext {
    pub store: Arc<Store>,
    pub identity: Arc<Identity>,
    pub secrets: Arc<dyn SecretStore>,
    pub pairing: Arc<PairingManager>,
}

#[derive(Debug, Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    pub peer_id: String,
    pub peer_name: String,
    pub sent: usize,
    pub received: usize,
    pub applied: usize,
    pub keys: usize,
    pub paired: bool,
}

const PAGE: usize = 500;

fn now() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

fn shareable_key(k: &str) -> bool {
    (k.starts_with("ai.") || k.starts_with("search.")) && np_store::secrets::validate_secret_key(k).is_ok()
}

fn key_names(store: &Store) -> Vec<String> {
    let connected: Vec<String> = store.get_setting("ai.connected").ok().flatten().unwrap_or_default();
    let mut names: Vec<String> = connected.into_iter().map(|p| format!("ai.{p}")).collect();
    names.extend(["search.brave", "search.tavily", "search.exa"].map(String::from));
    names
}

async fn send_all<S: AsyncRead + AsyncWrite + Unpin>(ch: &mut Channel<'_, S>, ctx: &SyncContext, peer: &Peer, scopes: &[Scope], keys_ok: bool, rep: &mut SyncReport) -> Result<()> {
    let mut after = peers::sent_seq(&ctx.store, &peer.id)?;
    loop {
        let (rows, last) = changes_after(&ctx.store, scopes, after, PAGE)?;
        if last == after {
            break;
        }
        rep.sent += rows.len();
        if !rows.is_empty() {
            ch.send(&Msg::Changes { rows }).await?;
        }
        after = last;
    }
    if keys_ok {
        let mut entries = Vec::new();
        for k in key_names(&ctx.store) {
            if let Some(v) = ctx.secrets.get(&k)? {
                entries.push((k, v));
            }
        }
        rep.keys += entries.len();
        ch.send(&Msg::Keys { entries }).await?;
    }
    ch.send(&Msg::Done { last_seq: after }).await?;
    match ch.recv().await? {
        Msg::Ack { seq } => peers::set_sent_seq(&ctx.store, &peer.id, seq),
        other => Err(SyncError::Protocol(format!("expected ack, got {other:?}"))),
    }
}

async fn recv_all<S: AsyncRead + AsyncWrite + Unpin>(ch: &mut Channel<'_, S>, ctx: &SyncContext, scopes: &[Scope], keys_ok: bool, rep: &mut SyncReport) -> Result<()> {
    loop {
        match ch.recv().await? {
            Msg::Changes { rows } => {
                rep.received += rows.len();
                rep.applied += apply(&ctx.store, &rows, scopes)?;
            }
            Msg::Keys { entries } if keys_ok => {
                for (k, v) in entries.into_iter().filter(|(k, _)| shareable_key(k)) {
                    ctx.secrets.set(&k, &v)?;
                    rep.keys += 1;
                }
            }
            Msg::Keys { .. } => return Err(SyncError::Protocol("keys not allowed for this device".into())),
            Msg::Done { last_seq } => {
                ch.send(&Msg::Ack { seq: last_seq }).await?;
                return Ok(());
            }
            Msg::Error { message } => return Err(SyncError::Protocol(message)),
            other => return Err(SyncError::Protocol(format!("unexpected {other:?}"))),
        }
    }
}

async fn exchange<S: AsyncRead + AsyncWrite + Unpin>(ch: &mut Channel<'_, S>, ctx: &SyncContext, peer: &Peer, client: bool) -> Result<SyncReport> {
    let mut rep = SyncReport { peer_id: peer.id.clone(), peer_name: peer.name.clone(), ..Default::default() };
    ch.send(&Msg::Scopes { scopes: peer.scopes.clone(), send_keys: peer.send_keys }).await?;
    let (theirs, their_keys) = match ch.recv().await? {
        Msg::Scopes { scopes, send_keys } => (scopes, send_keys),
        other => return Err(SyncError::Protocol(format!("expected scopes, got {other:?}"))),
    };
    let scopes: Vec<Scope> = peer.scopes.iter().copied().filter(|s| theirs.contains(s)).collect();
    let keys_ok = peer.send_keys && their_keys && scopes.contains(&Scope::Keys);
    if client {
        send_all(ch, ctx, peer, &scopes, keys_ok, &mut rep).await?;
        recv_all(ch, ctx, &scopes, keys_ok, &mut rep).await?;
    } else {
        recv_all(ch, ctx, &scopes, keys_ok, &mut rep).await?;
        send_all(ch, ctx, peer, &scopes, keys_ok, &mut rep).await?;
    }
    peers::touch(&ctx.store, &peer.id, now())?;
    Ok(rep)
}

/// Lado que escucha (escritorio): atiende un emparejamiento o una sesión de sincronización.
pub async fn serve<S: AsyncRead + AsyncWrite + Unpin>(io: &mut S, ctx: &SyncContext) -> Result<SyncReport> {
    match recv_hello(io).await? {
        Hello::Pair { id, name, epk } => {
            let active = match ctx.pairing.take_valid() {
                Ok(a) => a,
                Err(e) => {
                    send_hello(io, &Hello::Reject { reason: "no pairing in progress".into() }).await?;
                    return Err(e);
                }
            };
            let keys = pairing_keys(&active.eph, &decode_pk(&epk)?, &active.secret, false);
            let mut ch = Channel::new(io, keys);
            let (cid, cname, cpk) = match ch.recv().await? {
                Msg::Who { id: cid, name: cname, pk } if cid == id => (cid, cname, pk),
                _ => return Err(SyncError::Unauthorized),
            };
            ch.send(&Msg::Who { id: ctx.identity.device_id.clone(), name: ctx.identity.name.clone(), pk: ctx.identity.public_b64() }).await?;
            let _ = name;
            peers::upsert(&ctx.store, &Peer { id: cid.clone(), name: cname.clone(), public_key: cpk, addresses: vec![], scopes: Scope::DEFAULT.to_vec(), send_keys: false, paired_at: now(), last_sync_at: None, revoked: false })?;
            Ok(SyncReport { peer_id: cid, peer_name: cname, paired: true, ..Default::default() })
        }
        Hello::Sync { id, epk } => {
            let Some(peer) = peers::get(&ctx.store, &id)?.filter(|p| !p.revoked) else {
                send_hello(io, &Hello::Reject { reason: "unknown or revoked device".into() }).await?;
                return Err(SyncError::Unauthorized);
            };
            let (e, ep) = ephemeral();
            send_hello(io, &Hello::Sync { id: ctx.identity.device_id.clone(), epk: encode_pk(&ep) }).await?;
            let keys = session_keys(&ctx.identity, &e, &decode_pk(&peer.public_key)?, &decode_pk(&epk)?, &peer.id);
            let mut ch = Channel::new(io, keys);
            exchange(&mut ch, ctx, &peer, false).await
        }
        Hello::Reject { .. } => Err(SyncError::Protocol("unexpected reject".into())),
    }
}

/// Lado que conecta: sincroniza con un par ya emparejado.
pub async fn sync_with<S: AsyncRead + AsyncWrite + Unpin>(io: &mut S, ctx: &SyncContext, peer: &Peer) -> Result<SyncReport> {
    let (e, ep) = ephemeral();
    send_hello(io, &Hello::Sync { id: ctx.identity.device_id.clone(), epk: encode_pk(&ep) }).await?;
    let epk = match recv_hello(io).await? {
        Hello::Sync { id, epk } if id == peer.id => epk,
        Hello::Reject { .. } => return Err(SyncError::Unauthorized),
        _ => return Err(SyncError::Unauthorized),
    };
    let keys = session_keys(&ctx.identity, &e, &decode_pk(&peer.public_key)?, &decode_pk(&epk)?, &peer.id);
    let mut ch = Channel::new(io, keys);
    exchange(&mut ch, ctx, peer, true).await
}

/// Quien escanea el QR (móvil u otro escritorio con el código pegado).
pub async fn pair_with<S: AsyncRead + AsyncWrite + Unpin>(io: &mut S, ctx: &SyncContext, offer: &PairingOffer) -> Result<Peer> {
    let (e, ep) = ephemeral();
    send_hello(io, &Hello::Pair { id: ctx.identity.device_id.clone(), name: ctx.identity.name.clone(), epk: encode_pk(&ep) }).await?;
    let keys = pairing_keys(&e, &decode_pk(&offer.epk)?, &offer.secret_bytes()?, true);
    let mut ch = Channel::new(io, keys);
    ch.send(&Msg::Who { id: ctx.identity.device_id.clone(), name: ctx.identity.name.clone(), pk: ctx.identity.public_b64() }).await?;
    let (id, name, pk) = match ch.recv().await {
        Ok(Msg::Who { id, name, pk }) => (id, name, pk),
        _ => return Err(SyncError::Unauthorized),
    };
    // Autentica al PC: debe ser exactamente la identidad del QR.
    if id != offer.id || pk != offer.pk {
        return Err(SyncError::Unauthorized);
    }
    let peer = Peer { id, name, public_key: pk, addresses: offer.addrs.clone(), scopes: Scope::DEFAULT.to_vec(), send_keys: false, paired_at: now(), last_sync_at: None, revoked: false };
    peers::upsert(&ctx.store, &peer)?;
    Ok(peer)
}
```

> Si la oferta ya se usó, el servidor responde `Reject` en claro; el cliente, que espera una trama cifrada, falla al descifrarla y devuelve `Unauthorized`. Con un `secret` incorrecto, el servidor no puede descifrar el `Who` del cliente y corta.

- [ ] **Step 6: Ejecutar y ver que pasa**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-sync --test protocol`
Expected: `test result: ok. 2 passed`.

- [ ] **Step 7: Commit**

```powershell
git add src-tauri/crates/np-sync
git commit -m "feat(np-sync): framed encrypted protocol with single-use qr pairing, two-way sync and opt-in key transfer"
```

---

### Task 5: Copia `.npsync` cifrada con frase de paso (Argon2id)

**Files:**
- Modify: `src-tauri/crates/np-sync/src/npsync.rs`
- Test: `src-tauri/crates/np-sync/src/npsync.rs` (módulo `tests`)

**Interfaces:**
- Produces:
  - `KdfParams { m_kib: u32, t: u32, p: u32 }` (`Default`: 65 536 KiB, 3, 1)
  - `export(store, scopes, passphrase, params) -> Result<Vec<u8>>` (nunca exporta `Scope::Keys`)
  - `import(store, bytes, passphrase, scopes) -> Result<usize>` (fusión LWW; parámetros fuera de límites → error)

- [ ] **Step 1: Escribir el test que falla**

`src-tauri/crates/np-sync/src/npsync.rs`:
```rust
//! Respaldo sin red: fichero `.npsync` cifrado con una frase de paso (Argon2id + XChaCha20-Poly1305).

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rows::Scope;
    use np_store::Store;

    const FAST: KdfParams = KdfParams { m_kib: 1024, t: 1, p: 1 };

    #[test]
    fn round_trips_and_rejects_wrong_passphrases_and_garbage() {
        let (a, b) = (Store::open_in_memory().unwrap(), Store::open_in_memory().unwrap());
        a.set_setting("general.locale", &"de").unwrap();
        let mut scopes = Scope::DEFAULT.to_vec();
        scopes.push(Scope::Keys);
        let file = export(&a, &scopes, "correct horse battery staple", FAST).unwrap();
        assert!(file.starts_with(MAGIC));
        assert!(!String::from_utf8_lossy(&file).contains("general.locale"), "content must be encrypted");
        assert!(matches!(import(&b, &file, "wrong", Scope::DEFAULT), Err(crate::SyncError::Crypto)));
        assert!(import(&b, &file[..20], "correct horse battery staple", Scope::DEFAULT).is_err());
        assert!(import(&b, &file, "correct horse battery staple", Scope::DEFAULT).unwrap() >= 1);
        assert_eq!(b.get_setting::<String>("general.locale").unwrap().as_deref(), Some("de"));
    }
}
```

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-sync npsync`
Expected: FAIL de compilación.

- [ ] **Step 3: Implementación**

Añade encima de los tests en `npsync.rs`:
```rust
use argon2::{Algorithm, Argon2, Params, Version};
use np_store::Store;
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};

use crate::{
    crypto::{open, seal},
    rows::{apply, export_all, Row, Scope},
    Result, SyncError,
};

pub const MAGIC: &[u8; 8] = b"NPSYNC1\n";

#[derive(Debug, Clone, Copy)]
pub struct KdfParams {
    pub m_kib: u32,
    pub t: u32,
    pub p: u32,
}

impl Default for KdfParams {
    fn default() -> Self {
        Self { m_kib: 65_536, t: 3, p: 1 }
    }
}

#[derive(Serialize, Deserialize)]
struct Payload {
    v: u8,
    rows: Vec<Row>,
}

fn derive(passphrase: &str, salt: &[u8], k: KdfParams) -> Result<[u8; 32]> {
    let params = Params::new(k.m_kib, k.t, k.p, Some(32)).map_err(|_| SyncError::Crypto)?;
    let mut key = [0u8; 32];
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params).hash_password_into(passphrase.as_bytes(), salt, &mut key).map_err(|_| SyncError::Crypto)?;
    Ok(key)
}

pub fn export(store: &Store, scopes: &[Scope], passphrase: &str, k: KdfParams) -> Result<Vec<u8>> {
    let data_scopes: Vec<Scope> = scopes.iter().copied().filter(|s| *s != Scope::Keys).collect(); // §11: nunca claves
    let payload = serde_json::to_vec(&Payload { v: 1, rows: export_all(store, &data_scopes)? })?;
    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);
    let key = derive(passphrase, &salt, k)?;
    let mut out = Vec::with_capacity(payload.len() + 80);
    out.extend_from_slice(MAGIC);
    for n in [k.m_kib, k.t, k.p] {
        out.extend_from_slice(&n.to_le_bytes());
    }
    out.extend_from_slice(&salt);
    out.extend_from_slice(&seal(&key, &payload));
    Ok(out)
}

pub fn import(store: &Store, bytes: &[u8], passphrase: &str, scopes: &[Scope]) -> Result<usize> {
    const HEAD: usize = 8 + 12 + 16;
    if bytes.len() < HEAD + 40 || &bytes[..8] != MAGIC {
        return Err(SyncError::Protocol("not a .npsync file".into()));
    }
    let n = |i: usize| u32::from_le_bytes(bytes[8 + i * 4..12 + i * 4].try_into().expect("4 bytes"));
    let k = KdfParams { m_kib: n(0), t: n(1), p: n(2) };
    if k.m_kib > 1_048_576 || k.t == 0 || k.t > 10 || k.p == 0 || k.p > 8 {
        return Err(SyncError::Protocol("unreasonable key derivation parameters".into()));
    }
    let key = derive(passphrase, &bytes[20..36], k)?;
    let payload: Payload = serde_json::from_slice(&open(&key, &bytes[HEAD..])?)?;
    apply(store, &payload.rows, scopes)
}
```

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -p np-sync npsync`
Expected: `test result: ok. 1 passed`.

- [ ] **Step 5: Commit**

```powershell
git add src-tauri/crates/np-sync
git commit -m "feat(np-sync): argon2id-protected .npsync export and import without api keys"
```

---

### Task 6: Descubrimiento mDNS y direcciones locales y de Tailscale

**Files:**
- Modify: `src-tauri/crates/np-sync/src/discovery.rs`

**Interfaces:**
- Produces:
  - `SERVICE = "_newpaper._tcp.local."`, `DEFAULT_PORT = 47100`
  - `is_tailscale(Ipv4Addr) -> bool` (100.64.0.0/10)
  - `local_addresses(port) -> Vec<String>` (IPv4 no loopback, primero las de LAN y después las de Tailscale)
  - `Discovery::start(identity, port, advertise: bool) -> Result<Discovery>`, `addresses_of(device_id) -> Vec<String>`, `visible() -> Vec<String>`, `stop()`

- [ ] **Step 1: Implementación**

`src-tauri/crates/np-sync/src/discovery.rs`:
```rust
//! mDNS `_newpaper._tcp` (§15). Solo anuncia el id y la huella; nunca datos.
use std::{
    collections::HashMap,
    net::{IpAddr, Ipv4Addr},
    sync::{Arc, Mutex},
};

use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};

use crate::{
    identity::{fingerprint, Identity},
    Result, SyncError,
};

pub const SERVICE: &str = "_newpaper._tcp.local.";
pub const DEFAULT_PORT: u16 = 47100;

pub fn is_tailscale(ip: Ipv4Addr) -> bool {
    let o = ip.octets();
    o[0] == 100 && (o[1] & 0xC0) == 64
}

pub fn local_addresses(port: u16) -> Vec<String> {
    let mut lan = Vec::new();
    let mut ts = Vec::new();
    for iface in if_addrs::get_if_addrs().unwrap_or_default() {
        if iface.is_loopback() {
            continue;
        }
        if let IpAddr::V4(v4) = iface.ip() {
            if v4.is_link_local() {
                continue;
            }
            if is_tailscale(v4) { ts.push(format!("{v4}:{port}")) } else { lan.push(format!("{v4}:{port}")) }
        }
    }
    lan.extend(ts);
    lan
}

pub struct Discovery {
    daemon: ServiceDaemon,
    found: Arc<Mutex<HashMap<String, Vec<String>>>>,
}

impl Discovery {
    pub fn start(me: &Identity, port: u16, advertise: bool) -> Result<Self> {
        let daemon = ServiceDaemon::new().map_err(|e| SyncError::Protocol(e.to_string()))?;
        if advertise {
            let fp = fingerprint(&me.public());
            let props = [("fp", fp.as_str()), ("name", me.name.as_str()), ("v", "1")];
            let info = ServiceInfo::new(SERVICE, &me.device_id, &format!("{}.local.", me.device_id), "", port, &props[..])
                .map_err(|e| SyncError::Protocol(e.to_string()))?
                .enable_addr_auto();
            daemon.register(info).map_err(|e| SyncError::Protocol(e.to_string()))?;
        }
        let rx = daemon.browse(SERVICE).map_err(|e| SyncError::Protocol(e.to_string()))?;
        let found: Arc<Mutex<HashMap<String, Vec<String>>>> = Arc::default();
        let sink = found.clone();
        let my_id = me.device_id.clone();
        std::thread::Builder::new().name("np-mdns".into()).spawn(move || {
            while let Ok(ev) = rx.recv() {
                match ev {
                    ServiceEvent::ServiceResolved(r) => {
                        let id = r.fullname.split('.').next().unwrap_or_default().to_string();
                        if id == my_id || id.is_empty() {
                            continue;
                        }
                        let addrs = r.get_addresses().iter().map(|a| a.to_string()).filter(|a| !a.contains(':')).map(|a| format!("{a}:{}", r.port)).collect();
                        sink.lock().expect("lock").insert(id, addrs);
                    }
                    ServiceEvent::ServiceRemoved(_, fullname) => {
                        let id = fullname.split('.').next().unwrap_or_default().to_string();
                        sink.lock().expect("lock").remove(&id);
                    }
                    _ => {}
                }
            }
        })?;
        Ok(Self { daemon, found })
    }

    pub fn addresses_of(&self, device_id: &str) -> Vec<String> {
        self.found.lock().expect("lock").get(device_id).cloned().unwrap_or_default()
    }

    pub fn visible(&self) -> Vec<String> {
        self.found.lock().expect("lock").keys().cloned().collect()
    }

    pub fn stop(self) {
        let _ = self.daemon.shutdown();
    }
}
```

> `get_addresses()` devuelve las IP (en 0.21 son `ScopedIp`/`IpAddr` según la plataforma, ambas con `Display`); se descartan las IPv6 (contienen `:`) para no tener que poner corchetes al conectar. La API se comprobó compilando con mdns-sd 0.21.5.

- [ ] **Step 2: Comprobar que compila**

Run: `cargo check --manifest-path src-tauri/Cargo.toml -p np-sync`
Expected: compila sin errores.

- [ ] **Step 3: Commit**

```powershell
git add src-tauri/crates/np-sync
git commit -m "feat(np-sync): mdns advertisement and browsing plus lan and tailscale address detection"
```

---
### Task 7: Módulo `sync` de la app — escucha, descubrimiento y sincronización al abrir y cada 5 minutos

**Files:**
- Create: `src-tauri/src/sync/mod.rs`, `src-tauri/src/sync/service.rs`
- Modify: `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/src/features.rs`

**Interfaces:**
- Consumes: `np_sync::*` (T1–T6), `Arc<Store>`, `Arc<dyn SecretStore>` (1).
- Produces:
  - Estado `Arc<SyncService>`: `ctx: Arc<SyncContext>`, `start()`, `stop()`, `sync_all() -> Vec<SyncReport>`, `sync_peer(id)`, `pair_with_code(code) -> Peer`, `status() -> SyncStatus`
  - `SyncStatus { enabled, listening, deviceId, name, fingerprint, addresses, visible: string[], last: LastSync | null }`
  - Eventos `sync://status` (`SyncStatus`) y `sync://paired` (`{ peerId, name }`)
  - Ajustes: `device.sync.enabled` (por defecto `false`), `device.name` (por defecto el nombre del equipo)

- [ ] **Step 1: Dependencias**

En `src-tauri/Cargo.toml`, `[dependencies]`: `np-sync = { path = "crates/np-sync" }` y `tauri-plugin-dialog = "=2.8.1"`; en `lib.rs`, `.plugin(tauri_plugin_dialog::init())` y `pub mod sync;`; en `features.rs::setup_all`, `crate::sync::setup(app)?;`. En `capabilities/ui.json` añade `"dialog:allow-open"`, `"dialog:allow-save"`.

- [ ] **Step 2: Servicio**

`src-tauri/src/sync/mod.rs`:
```rust
//! Subproyecto 7: sincronización sin cuenta entre dispositivos.
pub mod commands;
pub mod service;

pub use service::setup;
```

`src-tauri/src/sync/service.rs`:
```rust
use std::{sync::Arc, time::Duration};

use np_store::{secrets::SecretStore, Store};
use np_sync::{
    discovery::{local_addresses, Discovery, DEFAULT_PORT},
    identity::{fingerprint, Identity},
    pairing::{PairingManager, PairingOffer},
    peers::{self, Peer},
    session::{pair_with, serve, sync_with, SyncContext, SyncReport},
};
use serde::Serialize;
use tauri::{App, AppHandle, Emitter, Manager};
use tokio::{net::TcpStream, sync::Mutex, task::JoinHandle, time::timeout};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LastSync {
    pub at: i64,
    pub peer_name: String,
    pub sent: usize,
    pub received: usize,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatus {
    pub enabled: bool,
    pub listening: bool,
    pub device_id: String,
    pub name: String,
    pub fingerprint: String,
    pub addresses: Vec<String>,
    pub visible: Vec<String>,
    pub last: Option<LastSync>,
}

pub struct SyncService {
    pub ctx: Arc<SyncContext>,
    app: AppHandle,
    listener: Mutex<Option<JoinHandle<()>>>,
    discovery: std::sync::Mutex<Option<Discovery>>,
    last: std::sync::Mutex<Option<LastSync>>,
    busy: Mutex<()>,
}

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

impl SyncService {
    fn enabled(&self) -> bool {
        self.ctx.store.get_setting::<bool>("device.sync.enabled").ok().flatten().unwrap_or(false)
    }

    pub fn status(&self) -> SyncStatus {
        SyncStatus {
            enabled: self.enabled(),
            listening: self.discovery.lock().expect("lock").is_some(),
            device_id: self.ctx.identity.device_id.clone(),
            name: self.ctx.identity.name.clone(),
            fingerprint: fingerprint(&self.ctx.identity.public()),
            addresses: local_addresses(DEFAULT_PORT),
            visible: self.discovery.lock().expect("lock").as_ref().map(|d| d.visible()).unwrap_or_default(),
            last: self.last.lock().expect("lock").clone(),
        }
    }

    fn emit(&self) {
        let _ = self.app.emit_to("ui", "sync://status", self.status());
    }

    /// Solo con la sincronización activada: escucha TCP directo (nunca Tor) y se anuncia por mDNS.
    pub async fn start(self: &Arc<Self>) -> Result<(), String> {
        if self.listener.lock().await.is_some() {
            return Ok(());
        }
        let listener = tokio::net::TcpListener::bind(("0.0.0.0", DEFAULT_PORT)).await.map_err(|e| e.to_string())?;
        let me = self.clone();
        let handle = tokio::spawn(async move {
            while let Ok((mut stream, addr)) = listener.accept().await {
                let me = me.clone();
                tokio::spawn(async move {
                    let r = timeout(Duration::from_secs(120), serve(&mut stream, &me.ctx)).await;
                    match r {
                        Ok(Ok(rep)) => {
                            if rep.paired {
                                let _ = me.app.emit_to("ui", "sync://paired", serde_json::json!({ "peerId": rep.peer_id, "name": rep.peer_name }));
                            }
                            me.record(&rep, None);
                        }
                        Ok(Err(e)) => tracing::info!(%addr, error = %e, "sync session refused or failed"),
                        Err(_) => tracing::info!(%addr, "sync session timed out"),
                    }
                });
            }
        });
        *self.listener.lock().await = Some(handle);
        let d = Discovery::start(&self.ctx.identity, DEFAULT_PORT, true).map_err(|e| e.to_string())?;
        *self.discovery.lock().expect("lock") = Some(d);
        self.emit();
        Ok(())
    }

    pub async fn stop(&self) {
        if let Some(h) = self.listener.lock().await.take() {
            h.abort();
        }
        if let Some(d) = self.discovery.lock().expect("lock").take() {
            d.stop();
        }
        self.emit();
    }

    fn record(&self, rep: &SyncReport, error: Option<String>) {
        *self.last.lock().expect("lock") = Some(LastSync { at: now(), peer_name: rep.peer_name.clone(), sent: rep.sent, received: rep.received, error });
        self.emit();
    }

    fn candidates(&self, peer: &Peer) -> Vec<String> {
        let mut out = self.discovery.lock().expect("lock").as_ref().map(|d| d.addresses_of(&peer.id)).unwrap_or_default();
        out.extend(peer.addresses.iter().cloned());
        out.dedup();
        out
    }

    pub async fn sync_peer(&self, peer: &Peer) -> Result<SyncReport, String> {
        let mut last_err = "no address".to_string();
        for addr in self.candidates(peer) {
            match timeout(Duration::from_secs(3), TcpStream::connect(&addr)).await {
                Ok(Ok(mut s)) => match timeout(Duration::from_secs(120), sync_with(&mut s, &self.ctx, peer)).await {
                    Ok(Ok(rep)) => {
                        self.record(&rep, None);
                        return Ok(rep);
                    }
                    Ok(Err(e)) => last_err = e.to_string(),
                    Err(_) => last_err = "timeout".into(),
                },
                Ok(Err(e)) => last_err = e.to_string(),
                Err(_) => last_err = "connect timeout".into(),
            }
        }
        let _ = peers::set_error(&self.ctx.store, &peer.id, Some(&last_err));
        Err(last_err)
    }

    pub async fn sync_all(&self) -> Vec<Result<SyncReport, String>> {
        let Ok(_g) = self.busy.try_lock() else { return vec![] };
        let list = peers::list(&self.ctx.store).unwrap_or_default();
        let mut out = Vec::new();
        for p in list.into_iter().filter(|p| !p.revoked) {
            out.push(self.sync_peer(&p).await);
        }
        out
    }

    /// Emparejar pegando el código `np1:` (escritorio ↔ escritorio) o desde el escáner del móvil.
    pub async fn pair_with_code(&self, code: &str) -> Result<Peer, String> {
        let offer = PairingOffer::decode(code).map_err(|e| e.to_string())?;
        let mut last_err = "no address".to_string();
        for addr in &offer.addrs {
            if let Ok(Ok(mut s)) = timeout(Duration::from_secs(3), TcpStream::connect(addr)).await {
                match timeout(Duration::from_secs(30), pair_with(&mut s, &self.ctx, &offer)).await {
                    Ok(Ok(peer)) => {
                        let _ = self.app.emit_to("ui", "sync://paired", serde_json::json!({ "peerId": peer.id, "name": peer.name }));
                        let _ = self.sync_peer(&peer).await;
                        return Ok(peer);
                    }
                    Ok(Err(e)) => last_err = e.to_string(),
                    Err(_) => last_err = "timeout".into(),
                }
            }
        }
        Err(last_err)
    }
}

pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let store = app.state::<Arc<Store>>().inner().clone();
    let secrets = app.state::<Arc<dyn SecretStore>>().inner().clone();
    let name = store
        .get_setting::<String>("device.name")?
        .unwrap_or_else(|| std::env::var("COMPUTERNAME").unwrap_or_else(|_| "newpaper".into()));
    let identity = Arc::new(Identity::load_or_create(secrets.as_ref(), &name)?);
    let ctx = Arc::new(SyncContext { store, identity, secrets, pairing: Arc::new(PairingManager::new()) });
    let svc = Arc::new(SyncService {
        ctx,
        app: app.handle().clone(),
        listener: Mutex::new(None),
        discovery: std::sync::Mutex::new(None),
        last: std::sync::Mutex::new(None),
        busy: Mutex::new(()),
    });
    app.manage(svc.clone());
    tauri::async_runtime::spawn(async move {
        if svc.enabled() {
            if let Err(e) = svc.start().await {
                tracing::warn!(error = %e, "sync listener not started");
            }
            tokio::time::sleep(Duration::from_secs(10)).await; // al abrir
        }
        loop {
            if svc.enabled() {
                svc.sync_all().await;
            }
            tokio::time::sleep(Duration::from_secs(300)).await; // cada 5 minutos
        }
    });
    Ok(())
}
```

> `Arc<dyn SecretStore>` es el estado que gestiona el subproyecto 1 (`app.manage(secrets)`). El nombre del dispositivo se lee al arrancar; cambiarlo (`sync_set_name`) se aplica en el siguiente arranque y en los anuncios mDNS tras reactivar.

- [ ] **Step 3: Comprobar que compila**

Crea `src-tauri/src/sync/commands.rs` vacío (solo `//! Comandos de sincronización.`); la Tarea 8 lo rellena.

Run: `cargo check --manifest-path src-tauri/Cargo.toml -p np-app`
Expected: compila sin errores.

- [ ] **Step 4: Commit**

```powershell
git add src-tauri
git commit -m "feat(sync): direct tcp listener with mdns, sync on open and every five minutes, pairing by code"
```

---

### Task 8: Comandos de sincronización

**Files:**
- Modify: `src-tauri/src/sync/commands.rs`, `src-tauri/build.rs`, `src-tauri/src/lib.rs`, `src-tauri/capabilities/ui.json`

**Interfaces:**
- Produces:

| Comando | Args | Devuelve |
|---|---|---|
| `sync_status` | — | `SyncStatus` |
| `sync_set_enabled` | `{ enabled }` | `SyncStatus` |
| `sync_set_name` | `{ name }` | `null` |
| `sync_pair_start` | — | `{ code, size, modules: boolean[], expiresInSecs, fingerprint }` |
| `sync_pair_cancel` | — | `null` |
| `sync_pair_with` | `{ code }` | `Peer` |
| `sync_peers` | — | `PeerView[]` (`Peer` + `fingerprint` + `lastError`) |
| `sync_peer_update` | `{ peerId, scopes, sendKeys, addresses }` | `PeerView[]` |
| `sync_revoke` | `{ peerId }` | `PeerView[]` |
| `sync_now` | `{ peerId? }` | `SyncReport[]` |
| `sync_export` | `{ path, passphrase, scopes }` | `number` (bytes) |
| `sync_import` | `{ path, passphrase }` | `number` (filas aplicadas) |

- [ ] **Step 1: Implementación**

`src-tauri/src/sync/commands.rs`:
```rust
//! Comandos de sincronización.
use std::{sync::Arc, time::Duration};

use np_sync::{
    discovery::{local_addresses, DEFAULT_PORT},
    identity::{decode_pk, fingerprint},
    npsync::{self, KdfParams},
    peers::{self, Peer},
    rows::Scope,
    session::SyncReport,
};
use serde::Serialize;
use tauri::State;

use super::service::{SyncService, SyncStatus};
use crate::commands::{CmdError, CmdResult};

fn e(err: impl ToString) -> CmdError {
    CmdError::new("sync", err.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeerView {
    #[serde(flatten)]
    pub peer: Peer,
    pub fingerprint: String,
    pub last_error: Option<String>,
}

fn views(svc: &SyncService) -> CmdResult<Vec<PeerView>> {
    let store = &svc.ctx.store;
    peers::list(store)
        .map_err(e)?
        .into_iter()
        .map(|p| {
            let fp = decode_pk(&p.public_key).map(|k| fingerprint(&k)).unwrap_or_default();
            let last_error = store
                .with_conn(|c| c.query_row("SELECT last_error FROM sync_log WHERE peer_id = ?1", [&p.id], |r| r.get(0)))
                .ok()
                .flatten();
            Ok(PeerView { peer: p, fingerprint: fp, last_error })
        })
        .collect()
}

#[tauri::command]
pub async fn sync_status(svc: State<'_, Arc<SyncService>>) -> CmdResult<SyncStatus> {
    Ok(svc.status())
}

#[tauri::command]
pub async fn sync_set_enabled(svc: State<'_, Arc<SyncService>>, enabled: bool) -> CmdResult<SyncStatus> {
    svc.ctx.store.set_setting("device.sync.enabled", &enabled)?;
    if enabled {
        svc.start().await.map_err(e)?;
        let s = svc.inner().clone();
        tauri::async_runtime::spawn(async move { s.sync_all().await });
    } else {
        svc.stop().await;
    }
    Ok(svc.status())
}

#[tauri::command]
pub async fn sync_set_name(svc: State<'_, Arc<SyncService>>, name: String) -> CmdResult<()> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 40 {
        return Err(CmdError::new("invalid", "name must have 1-40 characters"));
    }
    svc.ctx.store.set_setting("device.name", &name)?;
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PairStart {
    pub code: String,
    pub size: usize,
    pub modules: Vec<bool>,
    pub expires_in_secs: u64,
    pub fingerprint: String,
}

#[tauri::command]
pub async fn sync_pair_start(svc: State<'_, Arc<SyncService>>) -> CmdResult<PairStart> {
    if !svc.status().enabled {
        svc.ctx.store.set_setting("device.sync.enabled", &true)?;
        svc.start().await.map_err(e)?;
    }
    let offer = svc.ctx.pairing.start(&svc.ctx.identity, local_addresses(DEFAULT_PORT), Duration::from_secs(120));
    let (size, modules) = offer.qr_modules();
    Ok(PairStart { code: offer.encode(), size, modules, expires_in_secs: 120, fingerprint: fingerprint(&svc.ctx.identity.public()) })
}

#[tauri::command]
pub async fn sync_pair_cancel(svc: State<'_, Arc<SyncService>>) -> CmdResult<()> {
    svc.ctx.pairing.cancel();
    Ok(())
}

#[tauri::command]
pub async fn sync_pair_with(svc: State<'_, Arc<SyncService>>, code: String) -> CmdResult<Peer> {
    svc.pair_with_code(&code).await.map_err(e)
}

#[tauri::command]
pub async fn sync_peers(svc: State<'_, Arc<SyncService>>) -> CmdResult<Vec<PeerView>> {
    views(&svc)
}

#[tauri::command]
pub async fn sync_peer_update(svc: State<'_, Arc<SyncService>>, peer_id: String, scopes: Vec<Scope>, send_keys: bool, addresses: Vec<String>) -> CmdResult<Vec<PeerView>> {
    let addresses: Vec<String> = addresses.into_iter().map(|a| a.trim().to_string()).filter(|a| a.parse::<std::net::SocketAddr>().is_ok()).collect();
    peers::set_scopes(&svc.ctx.store, &peer_id, &scopes, send_keys && scopes.contains(&Scope::Keys)).map_err(e)?;
    peers::set_addresses(&svc.ctx.store, &peer_id, &addresses).map_err(e)?;
    views(&svc)
}

#[tauri::command]
pub async fn sync_revoke(svc: State<'_, Arc<SyncService>>, peer_id: String) -> CmdResult<Vec<PeerView>> {
    peers::revoke(&svc.ctx.store, &peer_id).map_err(e)?;
    views(&svc)
}

#[tauri::command]
pub async fn sync_now(svc: State<'_, Arc<SyncService>>, peer_id: Option<String>) -> CmdResult<Vec<SyncReport>> {
    let results = match peer_id {
        Some(id) => {
            let peer = peers::get(&svc.ctx.store, &id).map_err(e)?.filter(|p| !p.revoked).ok_or_else(|| CmdError::new("sync", "unknown device"))?;
            vec![svc.sync_peer(&peer).await]
        }
        None => svc.sync_all().await,
    };
    let mut ok = Vec::new();
    for r in results {
        match r {
            Ok(rep) => ok.push(rep),
            Err(err) if ok.is_empty() => return Err(e(err)),
            Err(_) => {}
        }
    }
    Ok(ok)
}

#[tauri::command]
pub async fn sync_export(svc: State<'_, Arc<SyncService>>, path: String, passphrase: String, scopes: Vec<Scope>) -> CmdResult<usize> {
    if passphrase.chars().count() < 8 {
        return Err(CmdError::new("invalid", "passphrase too short"));
    }
    let store = svc.ctx.store.clone();
    let bytes = tauri::async_runtime::spawn_blocking(move || npsync::export(&store, &scopes, &passphrase, KdfParams::default())).await.map_err(e)?.map_err(e)?;
    std::fs::write(&path, &bytes).map_err(e)?;
    Ok(bytes.len())
}

#[tauri::command]
pub async fn sync_import(svc: State<'_, Arc<SyncService>>, path: String, passphrase: String) -> CmdResult<usize> {
    let bytes = std::fs::read(&path).map_err(e)?;
    let store = svc.ctx.store.clone();
    tauri::async_runtime::spawn_blocking(move || npsync::import(&store, &bytes, &passphrase, Scope::DEFAULT)).await.map_err(e)?.map_err(|err| match err {
        np_sync::SyncError::Crypto => CmdError::new("wrong_passphrase", "wrong passphrase or damaged file"),
        other => e(other),
    })
}
```

- [ ] **Step 2: Registro**

`APP_COMMANDS`: `"sync_status", "sync_set_enabled", "sync_set_name", "sync_pair_start", "sync_pair_cancel", "sync_pair_with", "sync_peers", "sync_peer_update", "sync_revoke", "sync_now", "sync_export", "sync_import"`; en `generate_handler!` los mismos con el prefijo `sync::commands::`; en `capabilities/ui.json` los `allow-sync-*` correspondientes (`allow-sync-status`, `allow-sync-set-enabled`, `allow-sync-set-name`, `allow-sync-pair-start`, `allow-sync-pair-cancel`, `allow-sync-pair-with`, `allow-sync-peers`, `allow-sync-peer-update`, `allow-sync-revoke`, `allow-sync-now`, `allow-sync-export`, `allow-sync-import`).

- [ ] **Step 3: Comprobar que compila**

Run: `cargo check --manifest-path src-tauri/Cargo.toml -p np-app`
Expected: compila sin errores.

- [ ] **Step 4: Commit**

```powershell
git add src-tauri
git commit -m "feat(sync): tauri commands for status, pairing, peers, scopes, revoke, sync now and .npsync files"
```

---
### Task 9: Textos de Dispositivos (es, en, de)

**Files:**
- Modify: `packages/i18n/locales/es.json`, `packages/i18n/locales/en.json`, `packages/i18n/locales/de.json`

**Interfaces:**
- Produces: espacio `sync` y `settings.devices`.

- [ ] **Step 1: Español**

Añade al nivel raíz de `es.json`:
```json
"sync": {
  "thisDevice": "Este dispositivo",
  "name": "Nombre",
  "fingerprint": "Huella: {fp}",
  "enable": "Sincronizar con mis dispositivos",
  "enableHint": "Solo en tu red local o por Tailscale, cifrado de extremo a extremo.",
  "never": "Nunca pasa por Tor, ni por servidores de terceros, ni necesita cuenta.",
  "last": "Última sincronización a las {when} con {name}: {sent} enviados, {received} recibidos",
  "pair": {
    "title": "Emparejar",
    "start": "Emparejar un dispositivo",
    "qr": "Código QR para emparejar",
    "scan": "Escanéalo con newpaper en el móvil o copia el código en otro ordenador.",
    "expires": "Caduca en {s} s",
    "copy": "Copiar el código",
    "cancel": "Cancelar",
    "haveCode": "¿Tienes un código de otro dispositivo?",
    "useCode": "Emparejar con este código"
  },
  "devices": "Dispositivos emparejados",
  "noDevices": "Aún no hay dispositivos emparejados.",
  "syncAll": "Sincronizar todo ahora",
  "scopes": {
    "title": "Qué se sincroniza",
    "settings": "Ajustes",
    "history": "Historial",
    "saved": "Guardados",
    "analyses": "Análisis y síntesis",
    "topics": "Temas seguidos",
    "sources": "Fuentes personalizadas",
    "keys": "Claves de API",
    "keysWarning": "Las claves viajan cifradas y se guardan en el llavero del otro dispositivo. Actívalo en los dos."
  },
  "peer": {
    "last": "Última vez: {when}",
    "never": "Todavía no se ha sincronizado.",
    "error": "Último error: {message}",
    "addresses": "Direcciones (Tailscale u otras)",
    "addressesHint": "IP y puerto separados por comas. En casa basta con el descubrimiento automático.",
    "now": "Sincronizar ahora",
    "syncing": "Sincronizando…",
    "done": "{sent} enviados, {received} recibidos",
    "failed": "No se ha podido sincronizar: {message}",
    "revoke": "Revocar",
    "revoked": "Revocado"
  },
  "backup": {
    "title": "Copia sin red",
    "hint": "Un fichero .npsync cifrado con tu frase de paso. Nunca incluye claves de API.",
    "passphrase": "Frase de paso (8 caracteres o más)",
    "export": "Exportar",
    "import": "Importar",
    "exported": "Copia guardada.",
    "imported": "{n, plural, one {# elemento importado} other {# elementos importados}}",
    "wrongPassphrase": "Frase de paso incorrecta o fichero dañado.",
    "failed": "No se ha podido completar: {message}"
  }
}
```
Y dentro de `settings`: `"devices": { "title": "Dispositivos", "description": "Sincronizar sin cuenta entre tus equipos" }`.

- [ ] **Step 2: Inglés**

Añade al nivel raíz de `en.json`:
```json
"sync": {
  "thisDevice": "This device",
  "name": "Name",
  "fingerprint": "Fingerprint: {fp}",
  "enable": "Sync with my devices",
  "enableHint": "Only on your local network or over Tailscale, end-to-end encrypted.",
  "never": "It never goes through Tor or third-party servers, and needs no account.",
  "last": "Last sync at {when} with {name}: {sent} sent, {received} received",
  "pair": {
    "title": "Pair",
    "start": "Pair a device",
    "qr": "QR code for pairing",
    "scan": "Scan it with newpaper on your phone or copy the code to another computer.",
    "expires": "Expires in {s} s",
    "copy": "Copy the code",
    "cancel": "Cancel",
    "haveCode": "Have a code from another device?",
    "useCode": "Pair with this code"
  },
  "devices": "Paired devices",
  "noDevices": "No paired devices yet.",
  "syncAll": "Sync everything now",
  "scopes": {
    "title": "What is synced",
    "settings": "Settings",
    "history": "History",
    "saved": "Saved articles",
    "analyses": "Analyses and syntheses",
    "topics": "Followed topics",
    "sources": "Custom sources",
    "keys": "API keys",
    "keysWarning": "Keys travel encrypted and are stored in the other device’s keychain. Turn it on on both."
  },
  "peer": {
    "last": "Last time: {when}",
    "never": "Not synced yet.",
    "error": "Last error: {message}",
    "addresses": "Addresses (Tailscale or others)",
    "addressesHint": "IP and port separated by commas. At home, automatic discovery is enough.",
    "now": "Sync now",
    "syncing": "Syncing…",
    "done": "{sent} sent, {received} received",
    "failed": "Could not sync: {message}",
    "revoke": "Revoke",
    "revoked": "Revoked"
  },
  "backup": {
    "title": "Offline backup",
    "hint": "A .npsync file encrypted with your passphrase. It never includes API keys.",
    "passphrase": "Passphrase (8 characters or more)",
    "export": "Export",
    "import": "Import",
    "exported": "Backup saved.",
    "imported": "{n, plural, one {# item imported} other {# items imported}}",
    "wrongPassphrase": "Wrong passphrase or damaged file.",
    "failed": "Could not finish: {message}"
  }
}
```
Y dentro de `settings`: `"devices": { "title": "Devices", "description": "Sync between your computers without an account" }`.

- [ ] **Step 3: Alemán**

Añade al nivel raíz de `de.json`:
```json
"sync": {
  "thisDevice": "Dieses Gerät",
  "name": "Name",
  "fingerprint": "Fingerabdruck: {fp}",
  "enable": "Mit meinen Geräten synchronisieren",
  "enableHint": "Nur im lokalen Netz oder über Tailscale, Ende-zu-Ende-verschlüsselt.",
  "never": "Läuft nie über Tor oder fremde Server und braucht kein Konto.",
  "last": "Letzte Synchronisierung um {when} mit {name}: {sent} gesendet, {received} empfangen",
  "pair": {
    "title": "Koppeln",
    "start": "Gerät koppeln",
    "qr": "QR-Code zum Koppeln",
    "scan": "Scanne ihn mit newpaper auf dem Handy oder kopiere den Code auf einen anderen Rechner.",
    "expires": "Läuft in {s} s ab",
    "copy": "Code kopieren",
    "cancel": "Abbrechen",
    "haveCode": "Hast du einen Code von einem anderen Gerät?",
    "useCode": "Mit diesem Code koppeln"
  },
  "devices": "Gekoppelte Geräte",
  "noDevices": "Noch keine gekoppelten Geräte.",
  "syncAll": "Jetzt alles synchronisieren",
  "scopes": {
    "title": "Was synchronisiert wird",
    "settings": "Einstellungen",
    "history": "Verlauf",
    "saved": "Gespeicherte Artikel",
    "analyses": "Analysen und Zusammenfassungen",
    "topics": "Gefolgte Themen",
    "sources": "Eigene Quellen",
    "keys": "API-Schlüssel",
    "keysWarning": "Schlüssel werden verschlüsselt übertragen und im Schlüsselbund des anderen Geräts gespeichert. Auf beiden Geräten aktivieren."
  },
  "peer": {
    "last": "Zuletzt: {when}",
    "never": "Noch nicht synchronisiert.",
    "error": "Letzter Fehler: {message}",
    "addresses": "Adressen (Tailscale oder andere)",
    "addressesHint": "IP und Port, durch Kommas getrennt. Zu Hause reicht die automatische Erkennung.",
    "now": "Jetzt synchronisieren",
    "syncing": "Wird synchronisiert…",
    "done": "{sent} gesendet, {received} empfangen",
    "failed": "Synchronisierung fehlgeschlagen: {message}",
    "revoke": "Widerrufen",
    "revoked": "Widerrufen"
  },
  "backup": {
    "title": "Sicherung ohne Netz",
    "hint": "Eine mit deiner Passphrase verschlüsselte .npsync-Datei. Enthält nie API-Schlüssel.",
    "passphrase": "Passphrase (mindestens 8 Zeichen)",
    "export": "Exportieren",
    "import": "Importieren",
    "exported": "Sicherung gespeichert.",
    "imported": "{n, plural, one {# Element importiert} other {# Elemente importiert}}",
    "wrongPassphrase": "Falsche Passphrase oder beschädigte Datei.",
    "failed": "Konnte nicht abgeschlossen werden: {message}"
  }
}
```
Y dentro de `settings`: `"devices": { "title": "Geräte", "description": "Ohne Konto zwischen deinen Rechnern synchronisieren" }`.

- [ ] **Step 4: Comprobar los catálogos**

Run: `pnpm --filter @newpaper/i18n test`
Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/i18n/locales
git commit -m "feat(i18n): devices and sync strings"
```

---
### Task 10: UI — Ajustes › Dispositivos (QR, pares, ámbitos, revocar, copia `.npsync`)

**Files:**
- Create: `apps/ui/src/features/sync/QrCode.tsx`, `apps/ui/src/features/sync/DevicesSection.tsx`, `apps/ui/src/features/sync/register.ts`, `apps/ui/src/features/sync/sync.css`
- Modify: `apps/ui/src/ipc/types.ts`, `apps/ui/src/ipc/commands.ts`, `apps/ui/src/ipc/events.ts`, `apps/ui/src/features/index.ts`, `apps/ui/package.json`

**Interfaces:**
- Consumes: comandos de la Tarea 8, `@tauri-apps/plugin-dialog` (`open`, `save`).
- Produces: sección `dispositivos` (orden 85) con: este dispositivo (nombre editable, huella, direcciones, activar), "Emparejar un dispositivo" (QR de 2 minutos con cuenta atrás y código `np1:` para copiar), "Tengo un código" (pegar código de otro escritorio), lista de pares con ámbitos, claves de API (aviso), direcciones manuales (Tailscale), "Sincronizar ahora" y "Revocar", y exportar/importar `.npsync` con frase de paso.

- [ ] **Step 1: IPC**

En `apps/ui/package.json`, `dependencies`: `"@tauri-apps/plugin-dialog": "2.8.1"`.

Añade a `apps/ui/src/ipc/types.ts`:
```ts
export type SyncScope = 'settings' | 'history' | 'saved' | 'analyses' | 'topics' | 'sources' | 'keys';
export interface LastSync { at: number; peerName: string; sent: number; received: number; error: string | null }
export interface SyncStatus { enabled: boolean; listening: boolean; deviceId: string; name: string; fingerprint: string; addresses: string[]; visible: string[]; last: LastSync | null }
export interface PairStart { code: string; size: number; modules: boolean[]; expiresInSecs: number; fingerprint: string }
export interface PeerView {
  id: string; name: string; publicKey: string; addresses: string[]; scopes: SyncScope[]; sendKeys: boolean;
  pairedAt: number; lastSyncAt: number | null; revoked: boolean; fingerprint: string; lastError: string | null;
}
export interface SyncReport { peerId: string; peerName: string; sent: number; received: number; applied: number; keys: number; paired: boolean }
```

Añade al objeto `commands`:
```ts
  syncStatus: () => invoke<SyncStatus>('sync_status'),
  syncSetEnabled: (enabled: boolean) => invoke<SyncStatus>('sync_set_enabled', { enabled }),
  syncSetName: (name: string) => invoke<void>('sync_set_name', { name }),
  syncPairStart: () => invoke<PairStart>('sync_pair_start'),
  syncPairCancel: () => invoke<void>('sync_pair_cancel'),
  syncPairWith: (code: string) => invoke<PeerView>('sync_pair_with', { code }),
  syncPeers: () => invoke<PeerView[]>('sync_peers'),
  syncPeerUpdate: (peerId: string, scopes: SyncScope[], sendKeys: boolean, addresses: string[]) => invoke<PeerView[]>('sync_peer_update', { peerId, scopes, sendKeys, addresses }),
  syncRevoke: (peerId: string) => invoke<PeerView[]>('sync_revoke', { peerId }),
  syncNow: (peerId?: string) => invoke<SyncReport[]>('sync_now', { peerId }),
  syncExport: (path: string, passphrase: string, scopes: SyncScope[]) => invoke<number>('sync_export', { path, passphrase, scopes }),
  syncImport: (path: string, passphrase: string) => invoke<number>('sync_import', { path, passphrase }),
```

Añade a `apps/ui/src/ipc/events.ts`:
```ts
import type { SyncStatus } from './types';

export const onSyncStatus = (cb: (s: SyncStatus) => void) => listen<SyncStatus>('sync://status', (e) => cb(e.payload));
export const onSyncPaired = (cb: (p: { peerId: string; name: string }) => void) => listen<{ peerId: string; name: string }>('sync://paired', (e) => cb(e.payload));
```

- [ ] **Step 2: QR**

`apps/ui/src/features/sync/QrCode.tsx`:
```tsx
/** Dibuja la matriz del QR que calcula Rust (sin `data:` ni HTML inyectado). */
export function QrCode({ size, modules, label }: { size: number; modules: boolean[]; label: string }) {
  const q = 4; // zona tranquila
  const rects: string[] = [];
  modules.forEach((dark, i) => {
    if (dark) rects.push(`M${(i % size) + q} ${Math.floor(i / size) + q}h1v1h-1z`);
  });
  return (
    <svg className="np-qr" viewBox={`0 0 ${size + q * 2} ${size + q * 2}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width="100%" height="100%" fill="#fff" />
      <path d={rects.join('')} fill="#17171A" />
    </svg>
  );
}
```

> El QR se dibuja siempre en negro sobre blanco, también con el tema Tinta: los lectores de QR lo necesitan.

- [ ] **Step 3: Sección**

`apps/ui/src/features/sync/DevicesSection.tsx`:
```tsx
import { useI18n } from '@newpaper/i18n/react';
import { Button, Switch } from '@newpaper/ui-kit';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { useCallback, useEffect, useState } from 'react';
import { commands } from '../../ipc/commands';
import { onSyncPaired, onSyncStatus } from '../../ipc/events';
import type { PairStart, PeerView, SyncScope, SyncStatus } from '../../ipc/types';
import { QrCode } from './QrCode';

const SCOPES: SyncScope[] = ['settings', 'history', 'saved', 'analyses', 'topics', 'sources', 'keys'];

function PeerCard({ p, onChange }: { p: PeerView; onChange(list: PeerView[]): void }) {
  const { t, formatDate } = useI18n();
  const [addr, setAddr] = useState(p.addresses.join(', '));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const update = (scopes: SyncScope[], sendKeys: boolean) =>
    void commands.syncPeerUpdate(p.id, scopes, sendKeys, addr.split(',').map((s) => s.trim()).filter(Boolean)).then(onChange);
  const toggle = (s: SyncScope) => {
    const next = p.scopes.includes(s) ? p.scopes.filter((x) => x !== s) : [...p.scopes, s];
    update(next, s === 'keys' ? !p.scopes.includes('keys') : p.sendKeys);
  };
  const now = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const [r] = await commands.syncNow(p.id);
      setMsg(r ? t('sync.peer.done', { sent: r.sent, received: r.received }) : null);
    } catch (e) {
      setMsg(t('sync.peer.failed', { message: String((e as { message?: string }).message ?? e) }));
    } finally {
      setBusy(false);
    }
  };
  if (p.revoked) {
    return (
      <li className="np-peer np-peer--revoked">
        <strong>{p.name}</strong> <span className="np-tag np-tag--muted">{t('sync.peer.revoked')}</span>
      </li>
    );
  }
  return (
    <li className="np-peer">
      <div className="np-peer-head">
        <strong>{p.name}</strong>
        <span className="np-mono np-muted">{p.fingerprint}</span>
      </div>
      <p className="np-muted">{p.lastSyncAt ? t('sync.peer.last', { when: formatDate(new Date(p.lastSyncAt), { dateStyle: 'medium', timeStyle: 'short' }) }) : t('sync.peer.never')}</p>
      {p.lastError ? <p className="np-agent-error">{t('sync.peer.error', { message: p.lastError })}</p> : null}
      <fieldset className="np-peer-scopes">
        <legend>{t('sync.scopes.title')}</legend>
        {SCOPES.map((s) => (
          <label key={s} className="np-check">
            <input type="checkbox" checked={p.scopes.includes(s)} onChange={() => toggle(s)} />
            <span>{t(`sync.scopes.${s}`)}</span>
          </label>
        ))}
        {p.scopes.includes('keys') ? <p className="np-hint">{t('sync.scopes.keysWarning')}</p> : null}
      </fieldset>
      <label className="np-field">
        <span>{t('sync.peer.addresses')}</span>
        <input value={addr} placeholder="100.101.102.103:47100" onChange={(e) => setAddr(e.target.value)} onBlur={() => update(p.scopes, p.sendKeys)} />
        <span className="np-muted">{t('sync.peer.addressesHint')}</span>
      </label>
      <div className="np-wizard-actions">
        <Button disabled={busy} onClick={() => void now()}>{busy ? t('sync.peer.syncing') : t('sync.peer.now')}</Button>
        <Button variant="danger" onClick={() => void commands.syncRevoke(p.id).then(onChange)}>{t('sync.peer.revoke')}</Button>
      </div>
      {msg ? <p role="status">{msg}</p> : null}
    </li>
  );
}

export function DevicesSection() {
  const { t, formatDate } = useI18n();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [peers, setPeers] = useState<PeerView[]>([]);
  const [pair, setPair] = useState<PairStart | null>(null);
  const [left, setLeft] = useState(0);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [pass, setPass] = useState('');
  const [fileMsg, setFileMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const s = await commands.syncStatus();
    setStatus(s);
    setName(s.name);
    setPeers(await commands.syncPeers());
  }, []);
  useEffect(() => {
    void reload();
    const a = onSyncStatus(setStatus);
    const b = onSyncPaired(() => {
      setPair(null);
      void reload();
    });
    return () => {
      void a.then((f) => f());
      void b.then((f) => f());
    };
  }, [reload]);
  useEffect(() => {
    if (!pair) return;
    setLeft(pair.expiresInSecs);
    const h = setInterval(() => setLeft((x) => (x <= 1 ? (clearInterval(h), setPair(null), 0) : x - 1)), 1000);
    return () => clearInterval(h);
  }, [pair]);
  if (!status) return null;

  const exportFile = async () => {
    const path = await saveDialog({ defaultPath: 'newpaper.npsync', filters: [{ name: 'newpaper', extensions: ['npsync'] }] });
    if (!path) return;
    try {
      await commands.syncExport(path, pass, ['settings', 'history', 'saved', 'analyses', 'topics', 'sources']);
      setFileMsg(t('sync.backup.exported'));
    } catch (e) {
      setFileMsg(t('sync.backup.failed', { message: String((e as { message?: string }).message ?? e) }));
    }
  };
  const importFile = async () => {
    const path = await openDialog({ multiple: false, filters: [{ name: 'newpaper', extensions: ['npsync'] }] });
    if (!path || Array.isArray(path)) return;
    try {
      const n = await commands.syncImport(path, pass);
      setFileMsg(t('sync.backup.imported', { n }));
    } catch (e) {
      const c = (e as { code?: string }).code;
      setFileMsg(c === 'wrong_passphrase' ? t('sync.backup.wrongPassphrase') : t('sync.backup.failed', { message: String((e as { message?: string }).message ?? e) }));
    }
  };

  return (
    <div className="np-devices">
      <section>
        <h3>{t('sync.thisDevice')}</h3>
        <label className="np-field">
          <span>{t('sync.name')}</span>
          <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onBlur={() => void commands.syncSetName(name)} />
        </label>
        <p className="np-mono np-muted">{t('sync.fingerprint', { fp: status.fingerprint })}</p>
        <Switch checked={status.enabled} onChange={(v) => void commands.syncSetEnabled(v).then(setStatus)} label={t('sync.enable')} description={t('sync.enableHint')} />
        {status.last ? (
          <p className="np-muted">
            {t('sync.last', { when: formatDate(new Date(status.last.at), { timeStyle: 'short' }), name: status.last.peerName, sent: status.last.sent, received: status.last.received })}
          </p>
        ) : null}
        <p className="np-muted">{t('sync.never')}</p>
      </section>

      <section>
        <h3>{t('sync.pair.title')}</h3>
        {pair ? (
          <div className="np-pair">
            <QrCode size={pair.size} modules={pair.modules} label={t('sync.pair.qr')} />
            <p>{t('sync.pair.scan')}</p>
            <p className="np-mono np-muted">{t('sync.pair.expires', { s: left })}</p>
            <Button variant="quiet" onClick={() => void navigator.clipboard.writeText(pair.code)}>{t('sync.pair.copy')}</Button>
            <Button onClick={() => void commands.syncPairCancel().then(() => setPair(null))}>{t('sync.pair.cancel')}</Button>
          </div>
        ) : (
          <Button variant="primary" onClick={() => void commands.syncPairStart().then(setPair)}>{t('sync.pair.start')}</Button>
        )}
        <label className="np-field">
          <span>{t('sync.pair.haveCode')}</span>
          <input value={code} spellCheck={false} onChange={(e) => setCode(e.target.value)} />
        </label>
        <Button disabled={!code.startsWith('np1:')} onClick={() => void commands.syncPairWith(code.trim()).then(() => (setCode(''), void reload()))}>{t('sync.pair.useCode')}</Button>
      </section>

      <section>
        <h3>{t('sync.devices')}</h3>
        {peers.length === 0 ? <p className="np-muted">{t('sync.noDevices')}</p> : null}
        <ul className="np-peers">
          {peers.map((p) => (
            <PeerCard key={p.id} p={p} onChange={setPeers} />
          ))}
        </ul>
        {peers.some((p) => !p.revoked) ? <Button onClick={() => void commands.syncNow().then(reload)}>{t('sync.syncAll')}</Button> : null}
      </section>

      <section>
        <h3>{t('sync.backup.title')}</h3>
        <p className="np-muted">{t('sync.backup.hint')}</p>
        <label className="np-field">
          <span>{t('sync.backup.passphrase')}</span>
          <input type="password" value={pass} autoComplete="new-password" onChange={(e) => setPass(e.target.value)} />
        </label>
        <div className="np-wizard-actions">
          <Button disabled={pass.length < 8} onClick={() => void exportFile()}>{t('sync.backup.export')}</Button>
          <Button disabled={pass.length < 1} onClick={() => void importFile()}>{t('sync.backup.import')}</Button>
        </div>
        {fileMsg ? <p role="status">{fileMsg}</p> : null}
      </section>
    </div>
  );
}
```

> El `placeholder` con una dirección de ejemplo (`100.101.102.103:47100`) solo tiene cifras y signos, así que el escaneo i18n no lo marca.

`apps/ui/src/features/sync/sync.css`:
```css
.np-devices { display: grid; gap: 18px; font: 14px/1.5 var(--np-font-ui); }
.np-devices h3 { font: 600 11px var(--np-font-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--np-muted); margin: 0 0 6px; }
.np-devices section { display: grid; gap: 8px; }
.np-qr { width: 220px; height: 220px; border-radius: 12px; }
.np-pair { display: grid; gap: 6px; justify-items: start; }
.np-peers { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
.np-peer { padding: 12px; border: 1px solid var(--np-line); border-radius: var(--np-radius); background: var(--np-card); display: grid; gap: 6px; }
.np-peer--revoked { opacity: .6; }
.np-peer-head { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.np-peer-scopes { border: 0; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 4px 12px; }
.np-peer-scopes legend { font: 12px var(--np-font-ui); color: var(--np-muted); margin-bottom: 4px; }
.np-check { display: inline-flex; gap: 6px; align-items: center; min-height: var(--np-hit); }
.np-check input { width: 18px; height: 18px; }
```

`apps/ui/src/features/sync/register.ts`:
```ts
import { registerSettingsSection } from '../../shell/registry';
import { DevicesSection } from './DevicesSection';
import './sync.css';

registerSettingsSection({ id: 'dispositivos', order: 85, titleKey: 'settings.devices.title', descriptionKey: 'settings.devices.description', Component: DevicesSection });
```

Añade a `apps/ui/src/features/index.ts`: `import './sync/register';`

- [ ] **Step 4: Comprobar que compila**

Run:
```powershell
pnpm install
pnpm --filter @newpaper/ui typecheck
pnpm --filter @newpaper/i18n test
```
Expected: sin errores; catálogos completos.

- [ ] **Step 5: Commit**

```powershell
git add apps/ui pnpm-lock.yaml
git commit -m "feat(ui): devices settings with qr pairing, per-device scopes, revoke, sync now and encrypted backup"
```

---

### Task 11: Prueba manual entre dos equipos

**Files:** ninguno nuevo.

- [ ] **Step 1: Emparejar**

En el PC A: Ajustes › Dispositivos → "Emparejar un dispositivo". En el PC B (o en el móvil cuando exista el subproyecto 8): pegar el código `np1:` en "Tengo un código". Expected: los dos muestran al otro con la misma huella que aparece en su pantalla de "Este dispositivo"; A deja de mostrar el QR; pasados 2 minutos sin usarlo, el QR caduca.

- [ ] **Step 2: Sincronizar**

Cambia el idioma de la interfaz en A, guarda un artículo en B y pulsa "Sincronizar ahora". Expected: el cambio aparece en el otro equipo; Wireshark en el puerto 47100 solo muestra el saludo JSON en claro (id y clave efímera) y el resto como datos cifrados; no hay tráfico por Tor ni a ningún servidor externo.

- [ ] **Step 3: Tailscale**

Con los dos equipos en la misma red de Tailscale y en redes locales distintas, escribe en el par la dirección `100.x.y.z:47100`. Expected: "Sincronizar ahora" funciona sin mDNS.

- [ ] **Step 4: Claves y revocación**

Activa "Claves de API" en los dos lados. Expected: la clave de un proveedor conectado en A aparece en el llavero de B (Administrador de credenciales de Windows, entrada `newpaper` / `ai.<proveedor>`). Revoca B en A. Expected: la siguiente sincronización de B falla con "dispositivo desconocido o revocado".

- [ ] **Step 5: `.npsync`**

Exporta con una frase de 8 o más caracteres, borra un ajuste e importa. Expected: el ajuste vuelve; con otra frase, "Frase de paso incorrecta o fichero dañado"; abrir el `.npsync` con un editor no muestra texto legible ni claves.

---

## Cobertura de la spec (autorrevisión)

| Requisito | Tarea |
|---|---|
| §15 QR con clave X25519 efímera, huella y direcciones | 4, 8, 10 |
| §15 HKDF + XChaCha20‑Poly1305 de extremo a extremo | 1, 4 |
| §15 mDNS `_newpaper._tcp` y Tailscale | 6, 7, 10 |
| §15 HLC LWW por fila con lápida; `sync_log` por par; solo cambios nuevos | 2, 3, 4 |
| §15 ámbitos activables | 3, 4, 10 |
| §15 claves de API opcionales, cifradas, al llavero del destino | 4, 10 |
| §15 al abrir, cada 5 min, "Sincronizar ahora"; revocar | 7, 8, 10 |
| §15 `.npsync` con Argon2id | 5, 8, 10 |
| §15 nunca por Tor ni terceros | 7 (TCP directo) |
| §11 exportación sin claves | 5 |
| §16 el historial se sincroniza solo con su ámbito activo | 3 |

**Fuera de este plan:** el escáner de QR y el cliente móvil (subproyecto 8), que reutilizan `np-sync` y `sync_pair_with`.

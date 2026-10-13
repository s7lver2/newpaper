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
    name: std::sync::RwLock<String>,
    pub(crate) secret: StaticSecret,
}

#[derive(Serialize, Deserialize)]
struct Stored {
    id: String,
    sk: String,
}

impl Identity {
    pub fn generate(name: &str) -> Self {
        Self { device_id: np_store::ids::random_id(), name: std::sync::RwLock::new(clean_name(name)), secret: StaticSecret::random_from_rng(OsRng) }
    }

    pub fn load_or_create(secrets: &dyn SecretStore, name: &str) -> Result<Self> {
        if let Some(raw) = secrets.get(SECRET_KEY)? {
            let raw = zeroize::Zeroizing::new(raw);
            let s: Stored = serde_json::from_str(&raw)?;
            let bytes: [u8; 32] = B64.decode(&s.sk).map_err(|_| SyncError::Crypto)?.try_into().map_err(|_| SyncError::Crypto)?;
            return Ok(Self { device_id: s.id, name: std::sync::RwLock::new(clean_name(name)), secret: StaticSecret::from(bytes) });
        }
        let me = Self::generate(name);
        secrets.set(SECRET_KEY, &serde_json::to_string(&Stored { id: me.device_id.clone(), sk: B64.encode(me.secret.to_bytes()) })?)?;
        Ok(me)
    }

    /// Nombre visible de este equipo (editable sin reiniciar).
    pub fn name(&self) -> String {
        self.name.read().map(|n| n.clone()).unwrap_or_default()
    }

    pub fn set_name(&self, name: &str) {
        if let Ok(mut n) = self.name.write() {
            *n = clean_name(name);
        }
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

/// Un identificador de dispositivo remoto: corto y solo caracteres seguros (se usa en nombres mDNS y en SQL como valor).
pub fn valid_device_id(id: &str) -> bool {
    (8..=64).contains(&id.len()) && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
}

/// Nombre visible de un dispositivo remoto: sin caracteres de control, recortado y no vacío.
pub fn clean_name(name: &str) -> String {
    let cleaned: String = name.chars().filter(|c| !c.is_control()).collect::<String>().trim().chars().take(40).collect();
    if cleaned.is_empty() {
        "device".into()
    } else {
        cleaned
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn remote_ids_and_names_are_sanitised() {
        assert!(valid_device_id(&np_store::ids::random_id()));
        assert!(!valid_device_id("short"));
        assert!(!valid_device_id("a'; DROP TABLE x;--aaaa"));
        assert!(!valid_device_id(&"a".repeat(65)));
        assert_eq!(clean_name("  Pixel\u{0}\n 7  "), "Pixel 7");
        assert_eq!(clean_name("\u{7}"), "device");
        assert_eq!(clean_name(&"x".repeat(100)).chars().count(), 40);
    }
}

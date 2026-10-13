//! Respaldo sin red: fichero `.npsync` cifrado con una frase de paso (Argon2id + XChaCha20-Poly1305).
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

/// Cabecera: `MAGIC ‖ m, t, p (u32 LE) ‖ sal (16) ‖ nonce (24) ‖ texto cifrado`.
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

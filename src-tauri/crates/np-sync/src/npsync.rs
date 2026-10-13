//! Respaldo sin red: fichero `.npsync` cifrado con una frase de paso (Argon2id + XChaCha20-Poly1305).
use argon2::{Algorithm, Argon2, Params, Version};
use np_store::Store;
use rand_core::{OsRng, RngCore};
use serde::{Deserialize, Serialize};
use zeroize::Zeroize;

use crate::{
    crypto::{open_aad, seal_aad},
    rows::{apply_report, export_all, ApplyReport, Row, Scope},
    Result, SyncError,
};

pub const MAGIC: &[u8; 8] = b"NPSYNC1\n";
/// Tamaño máximo de un `.npsync` que se intenta abrir (un fichero ajeno no debe agotar la memoria).
pub const MAX_FILE_BYTES: u64 = 256 * 1024 * 1024;
/// Topes de los parámetros de Argon2id que declara un fichero: sin ellos, un fichero malicioso pide 1 GiB y minutos de CPU.
const MAX_M_KIB: u32 = 262_144;
const MAX_T: u32 = 6;
const MAX_P: u32 = 4;

#[derive(Debug, Clone, Copy)]
pub struct KdfParams {
    pub m_kib: u32,
    pub t: u32,
    pub p: u32,
}

/// 64 MiB, 3 pasadas, 1 carril: por encima del mínimo de OWASP para Argon2id (19 MiB, t = 2).
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

const HEAD: usize = 8 + 12 + 16;

/// Cabecera: `MAGIC ‖ m, t, p (u32 LE) ‖ sal (16) ‖ nonce (24) ‖ texto cifrado`. La cabecera completa es dato
/// asociado del AEAD: no se pueden cambiar los parámetros ni la sal sin que falle el descifrado.
pub fn export(store: &Store, scopes: &[Scope], passphrase: &str, k: KdfParams) -> Result<Vec<u8>> {
    let data_scopes: Vec<Scope> = scopes.iter().copied().filter(|s| *s != Scope::Keys).collect(); // §11: nunca claves
    let mut payload = serde_json::to_vec(&Payload { v: 1, rows: export_all(store, &data_scopes)? })?;
    let mut salt = [0u8; 16];
    OsRng.fill_bytes(&mut salt);
    let mut key = derive(passphrase, &salt, k)?;
    let mut out = Vec::with_capacity(payload.len() + 80);
    out.extend_from_slice(MAGIC);
    for n in [k.m_kib, k.t, k.p] {
        out.extend_from_slice(&n.to_le_bytes());
    }
    out.extend_from_slice(&salt);
    let sealed = seal_aad(&key, &payload, &out[..HEAD]);
    out.extend_from_slice(&sealed);
    key.zeroize();
    payload.zeroize();
    Ok(out)
}

pub fn import_report(store: &Store, bytes: &[u8], passphrase: &str, scopes: &[Scope]) -> Result<ApplyReport> {
    if bytes.len() < HEAD + 40 || &bytes[..8] != MAGIC {
        return Err(SyncError::Protocol("not a .npsync file".into()));
    }
    let n = |i: usize| u32::from_le_bytes(bytes[8 + i * 4..12 + i * 4].try_into().expect("4 bytes"));
    let k = KdfParams { m_kib: n(0), t: n(1), p: n(2) };
    if !(8..=MAX_M_KIB).contains(&k.m_kib) || !(1..=MAX_T).contains(&k.t) || !(1..=MAX_P).contains(&k.p) {
        return Err(SyncError::Protocol("unreasonable key derivation parameters".into()));
    }
    let mut key = derive(passphrase, &bytes[20..36], k)?;
    let opened = open_aad(&key, &bytes[HEAD..], &bytes[..HEAD]);
    key.zeroize();
    let mut plain = opened?;
    let payload: std::result::Result<Payload, _> = serde_json::from_slice(&plain);
    plain.zeroize();
    let payload = payload?;
    if payload.v != 1 {
        return Err(SyncError::Protocol("unsupported backup version".into()));
    }
    apply_report(store, &payload.rows, scopes)
}

pub fn import(store: &Store, bytes: &[u8], passphrase: &str, scopes: &[Scope]) -> Result<usize> {
    Ok(import_report(store, bytes, passphrase, scopes)?.applied)
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

#[cfg(test)]
mod security_tests {
    use super::*;
    use np_store::Store;

    const FAST: KdfParams = KdfParams { m_kib: 1024, t: 1, p: 1 };

    #[test]
    fn hostile_files_are_refused_before_any_expensive_work() {
        let (a, b) = (Store::open_in_memory().unwrap(), Store::open_in_memory().unwrap());
        a.set_setting("general.locale", &"de").unwrap();
        let mut file = export(&a, Scope::DEFAULT, "correct horse battery", FAST).unwrap();
        // Un fichero que pide 1 GiB / 100 pasadas se rechaza sin ejecutar Argon2.
        let mut greedy = file.clone();
        greedy[8..12].copy_from_slice(&1_048_576u32.to_le_bytes());
        assert!(matches!(import(&b, &greedy, "correct horse battery", Scope::DEFAULT), Err(SyncError::Protocol(_))));
        let mut slow = file.clone();
        slow[12..16].copy_from_slice(&100u32.to_le_bytes());
        assert!(matches!(import(&b, &slow, "correct horse battery", Scope::DEFAULT), Err(SyncError::Protocol(_))));
        // Cambiar un parámetro razonable cambia la clave o rompe la cabecera autenticada: nunca descifra.
        file[12..16].copy_from_slice(&2u32.to_le_bytes());
        assert!(matches!(import(&b, &file, "correct horse battery", Scope::DEFAULT), Err(SyncError::Crypto)));
        assert!(b.get_setting::<String>("general.locale").unwrap().is_none());
    }

    #[test]
    fn a_backup_cannot_smuggle_local_only_settings() {
        use crate::rows::Row;
        let b = Store::open_in_memory().unwrap();
        let stamp = format!("{:013}-00000-abcd1234", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis());
        let mut data = serde_json::Map::new();
        for (k, v) in [
            ("key", serde_json::json!("privacy.mode")),
            ("id", serde_json::json!(np_store::ids::stable_id("settings", "privacy.mode"))),
            ("value", serde_json::json!("\"direct\"")),
            ("updated_at", serde_json::json!(stamp)),
            ("deleted", serde_json::json!(0)),
        ] {
            data.insert(k.into(), v);
        }
        let payload = serde_json::to_vec(&Payload { v: 1, rows: vec![Row { seq: 1, table: "settings".into(), data }] }).unwrap();
        let mut salt = [9u8; 16];
        salt[0] = 1;
        let key = derive("correct horse battery", &salt, FAST).unwrap();
        let mut out = MAGIC.to_vec();
        for n in [FAST.m_kib, FAST.t, FAST.p] {
            out.extend_from_slice(&n.to_le_bytes());
        }
        out.extend_from_slice(&salt);
        let sealed = seal_aad(&key, &payload, &out[..HEAD]);
        out.extend_from_slice(&sealed);
        assert_eq!(import(&b, &out, "correct horse battery", Scope::DEFAULT).unwrap(), 0);
        assert!(b.get_setting::<String>("privacy.mode").unwrap().is_none());
    }
}

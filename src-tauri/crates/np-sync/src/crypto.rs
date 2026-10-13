//! X25519 + HKDF-SHA256 + XChaCha20-Poly1305 (§15).
use chacha20poly1305::{
    aead::{Aead, AeadCore, KeyInit, Payload},
    XChaCha20Poly1305, XNonce,
};
use hkdf::Hkdf;
use rand_core::OsRng;
use sha2::{Digest, Sha256};
pub use x25519_dalek::{PublicKey, StaticSecret};
use x25519_dalek::SharedSecret;
use zeroize::Zeroize;

use crate::{identity::Identity, Result, SyncError};

/// Claves direccionales de una sesión. Se borran de memoria al soltarlas.
#[derive(Clone)]
pub struct SessionKeys {
    pub send: [u8; 32],
    pub recv: [u8; 32],
}

impl Drop for SessionKeys {
    fn drop(&mut self) {
        self.send.zeroize();
        self.recv.zeroize();
    }
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

/// Un punto de orden pequeño (p. ej. todo ceros) da un secreto compartido conocido: se rechaza.
fn contributory(ss: SharedSecret) -> Result<SharedSecret> {
    if ss.was_contributory() {
        Ok(ss)
    } else {
        Err(SyncError::Crypto)
    }
}

/// `DH(efímera, efímera) ‖ DH(estática, estática)`: secreto hacia delante y autenticación mutua.
/// La sal liga las dos claves estáticas y las dos efímeras (transcripción), ordenadas por clave
/// pública para que ambos lados calculen lo mismo sin depender de identificadores de texto.
pub fn session_keys(me: &Identity, my_eph: &StaticSecret, peer_static: &PublicKey, peer_eph: &PublicKey) -> Result<SessionKeys> {
    let ee = contributory(my_eph.diffie_hellman(peer_eph))?;
    let ss = contributory(me.secret.diffie_hellman(peer_static))?;
    let my_static = me.public();
    let my_eph_pub = PublicKey::from(my_eph);
    let i_am_a = my_static.as_bytes() < peer_static.as_bytes();
    let (a_pk, b_pk, a_epk, b_epk) = if i_am_a { (my_static, *peer_static, my_eph_pub, *peer_eph) } else { (*peer_static, my_static, *peer_eph, my_eph_pub) };
    let mut salt = Sha256::new();
    salt.update(b"np-sync-v1 transcript");
    for k in [&a_pk, &b_pk, &a_epk, &b_epk] {
        salt.update(k.as_bytes());
    }
    let salt = salt.finalize();
    let mut ikm = [ee.as_bytes().as_slice(), ss.as_bytes().as_slice()].concat();
    let ab = expand(&salt, &ikm, "np-sync-v1 a->b");
    let ba = expand(&salt, &ikm, "np-sync-v1 b->a");
    ikm.zeroize();
    Ok(if i_am_a { SessionKeys { send: ab, recv: ba } } else { SessionKeys { send: ba, recv: ab } })
}

/// Emparejamiento: solo `DH(efímera, efímera)` con el secreto del QR como sal.
pub fn pairing_keys(my_eph: &StaticSecret, peer_eph: &PublicKey, secret: &[u8], initiator: bool) -> Result<SessionKeys> {
    let ee = contributory(my_eph.diffie_hellman(peer_eph))?;
    let ir = expand(secret, ee.as_bytes(), "np-pair-v1 i->r");
    let ri = expand(secret, ee.as_bytes(), "np-pair-v1 r->i");
    Ok(if initiator { SessionKeys { send: ir, recv: ri } } else { SessionKeys { send: ri, recv: ir } })
}

/// Cifra con nonce aleatorio de 192 bits (sin riesgo práctico de repetición) y datos asociados.
pub fn seal_aad(key: &[u8; 32], plaintext: &[u8], aad: &[u8]) -> Vec<u8> {
    let cipher = XChaCha20Poly1305::new(key.into());
    let nonce = XChaCha20Poly1305::generate_nonce(&mut OsRng);
    let ct = cipher.encrypt(&nonce, Payload { msg: plaintext, aad }).expect("encryption cannot fail for in-memory buffers");
    [nonce.as_slice(), ct.as_slice()].concat()
}

pub fn open_aad(key: &[u8; 32], data: &[u8], aad: &[u8]) -> Result<Vec<u8>> {
    if data.len() < 24 + 16 {
        return Err(SyncError::Crypto);
    }
    let cipher = XChaCha20Poly1305::new(key.into());
    cipher.decrypt(XNonce::from_slice(&data[..24]), Payload { msg: &data[24..], aad }).map_err(|_| SyncError::Crypto)
}

pub fn seal(key: &[u8; 32], plaintext: &[u8]) -> Vec<u8> {
    seal_aad(key, plaintext, &[])
}

pub fn open(key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>> {
    open_aad(key, data, &[])
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::identity::Identity;

    fn session(a: &Identity, b: &Identity) -> (SessionKeys, SessionKeys) {
        let (ae, aep) = ephemeral();
        let (be, bep) = ephemeral();
        (session_keys(a, &ae, &b.public(), &bep).unwrap(), session_keys(b, &be, &a.public(), &aep).unwrap())
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
        let ka2 = session_keys(&a, &ae, &b.public(), &eep).unwrap();
        let ke = session_keys(&eve, &ee, &a.public(), &PublicKey::from(&ae)).unwrap();
        assert!(open(&ka2.recv, &seal(&ke.send, b"soy B")).is_err());
    }

    #[test]
    fn pairing_keys_need_the_qr_secret() {
        let (ie, iep) = ephemeral();
        let (re, rep) = ephemeral();
        let ki = pairing_keys(&ie, &rep, b"0123456789abcdef", true).unwrap();
        let kr = pairing_keys(&re, &iep, b"0123456789abcdef", false).unwrap();
        assert_eq!(open(&kr.recv, &seal(&ki.send, b"id")).unwrap(), b"id");
        let wrong = pairing_keys(&re, &iep, b"fedcba9876543210", false).unwrap();
        assert!(open(&wrong.recv, &seal(&ki.send, b"id")).is_err());
    }

    #[test]
    fn low_order_public_keys_are_rejected() {
        let (a, _b) = (Identity::generate("pc"), Identity::generate("móvil"));
        let (ae, _) = ephemeral();
        let zero = PublicKey::from([0u8; 32]);
        assert!(session_keys(&a, &ae, &a.public(), &zero).is_err(), "all-zero ephemeral key");
        assert!(session_keys(&a, &ae, &zero, &PublicKey::from(&ae)).is_err(), "all-zero static key");
        assert!(pairing_keys(&ae, &zero, b"0123456789abcdef", true).is_err());
    }

    #[test]
    fn associated_data_binds_the_ciphertext_to_its_position() {
        let key = [7u8; 32];
        let sealed = seal_aad(&key, b"msg", &1u64.to_be_bytes());
        assert!(open_aad(&key, &sealed, &1u64.to_be_bytes()).is_ok());
        assert!(open_aad(&key, &sealed, &2u64.to_be_bytes()).is_err(), "replay at another position must fail");
    }
}

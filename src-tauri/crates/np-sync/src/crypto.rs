//! X25519 + HKDF-SHA256 + XChaCha20-Poly1305 (§15).
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

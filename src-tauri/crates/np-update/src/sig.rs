//! Verificación minisign (Ed25519). Nunca se instala ni aplica nada sin firma válida (§17).

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

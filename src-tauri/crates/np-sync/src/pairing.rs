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

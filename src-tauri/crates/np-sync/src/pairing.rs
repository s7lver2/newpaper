//! Oferta de emparejamiento que muestra el QR (§15): clave estática, efímera, secreto y direcciones.
use std::{
    sync::Mutex,
    time::{Duration, Instant},
};

use base64::Engine;
use rand_core::{OsRng, RngCore};
use zeroize::Zeroize;
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


/// Intentos fallidos (sin conocer el secreto del QR) que tolera una oferta antes de invalidarse.
pub const MAX_FAILED_ATTEMPTS: u8 = 5;

struct ActiveOffer {
    epk: String,
    eph: [u8; 32],
    secret: Vec<u8>,
    expires: Instant,
    fails: u8,
}

impl Drop for ActiveOffer {
    fn drop(&mut self) {
        self.eph.zeroize();
        self.secret.zeroize();
    }
}

/// Lo que necesita un intento de emparejamiento. No consume la oferta: solo `complete` lo hace.
pub struct Attempt {
    pub eph: StaticSecret,
    pub secret: Vec<u8>,
    epk: String,
}

impl Drop for Attempt {
    fn drop(&mut self) {
        self.secret.zeroize();
    }
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
        let offer = PairingOffer { v: 1, id: me.device_id.clone(), name: me.name(), pk: me.public_b64(), epk: encode_pk(&epk), secret: B64.encode(&secret), addrs };
        *self.active.lock().expect("lock") = Some(ActiveOffer { epk: offer.epk.clone(), eph: eph.to_bytes(), secret, expires: Instant::now() + ttl, fails: 0 });
        offer
    }

    pub fn cancel(&self) {
        *self.active.lock().expect("lock") = None;
    }

    /// Hay una oferta vigente (no caducada ni agotada).
    pub fn is_active(&self) -> bool {
        self.active.lock().expect("lock").as_ref().is_some_and(|a| Instant::now() <= a.expires)
    }

    /// Empieza un intento. Un desconocido que se conecta sin saber el secreto no puede quemar la oferta:
    /// solo los intentos fallidos cuentan (máximo `MAX_FAILED_ATTEMPTS`) y la caducidad la invalida.
    pub fn begin(&self) -> Result<Attempt> {
        let mut g = self.active.lock().expect("lock");
        let Some(a) = g.as_ref() else { return Err(SyncError::Unauthorized) };
        if Instant::now() > a.expires {
            *g = None;
            return Err(SyncError::Expired);
        }
        Ok(Attempt { eph: StaticSecret::from(a.eph), secret: a.secret.clone(), epk: a.epk.clone() })
    }

    /// Un intento no demostró conocer el secreto.
    pub fn fail(&self, attempt: &Attempt) {
        let mut g = self.active.lock().expect("lock");
        if let Some(a) = g.as_mut().filter(|a| a.epk == attempt.epk) {
            a.fails += 1;
            if a.fails >= MAX_FAILED_ATTEMPTS {
                *g = None;
            }
        }
    }

    /// Un solo uso: consume la oferta. Falla si otro intento la consumió antes o caducó entre medias.
    pub fn complete(&self, attempt: &Attempt) -> Result<()> {
        let mut g = self.active.lock().expect("lock");
        match g.as_ref() {
            Some(a) if a.epk == attempt.epk && Instant::now() <= a.expires => {
                *g = None;
                Ok(())
            }
            Some(a) if a.epk == attempt.epk => {
                *g = None;
                Err(SyncError::Expired)
            }
            _ => Err(SyncError::Unauthorized),
        }
    }
}

impl PairingOffer {
    /// Direcciones del código como `SocketAddr` (nunca nombres de dominio: no hay resolución DNS) y solo de redes
    /// privadas, CGNAT (Tailscale), enlace local o bucle local. Máximo 8.
    pub fn socket_addrs(&self) -> Vec<std::net::SocketAddr> {
        self.addrs
            .iter()
            .filter_map(|a| a.parse::<std::net::SocketAddr>().ok())
            .filter(|a| match a.ip() {
                std::net::IpAddr::V4(v4) => v4.is_private() || v4.is_loopback() || v4.is_link_local() || crate::discovery::is_tailscale(v4),
                std::net::IpAddr::V6(v6) => v6.is_loopback(),
            })
            .take(8)
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strangers_cannot_burn_an_offer_but_the_winner_consumes_it_once() {
        let me = Identity::generate("pc");
        let m = PairingManager::new();
        assert!(m.begin().is_err(), "no offer yet");
        m.start(&me, vec![], Duration::from_secs(120));
        for _ in 0..MAX_FAILED_ATTEMPTS - 1 {
            let a = m.begin().unwrap();
            m.fail(&a);
        }
        let a = m.begin().unwrap();
        let b = m.begin().unwrap(); // dos conexiones a la vez
        m.complete(&a).unwrap();
        assert!(m.complete(&b).is_err(), "single use, also under a race");
        assert!(m.begin().is_err());
        m.start(&me, vec![], Duration::from_secs(120));
        for _ in 0..MAX_FAILED_ATTEMPTS {
            let a = m.begin().unwrap_or_else(|_| panic!("still alive"));
            m.fail(&a);
        }
        assert!(m.begin().is_err(), "too many failures invalidate the offer");
    }

    #[test]
    fn offers_expire() {
        let me = Identity::generate("pc");
        let m = PairingManager::new();
        m.start(&me, vec![], Duration::from_millis(0));
        std::thread::sleep(Duration::from_millis(5));
        assert!(matches!(m.begin(), Err(SyncError::Expired)));
        assert!(!m.is_active());
    }

    #[test]
    fn offer_addresses_are_ip_literals_on_private_networks_only() {
        let mut o = PairingOffer { v: 1, id: "x".into(), name: "n".into(), pk: String::new(), epk: String::new(), secret: String::new(), addrs: vec![] };
        o.addrs = ["192.168.1.9:47100", "evil.example.com:80", "8.8.8.8:47100", "100.101.102.103:47100", "127.0.0.1:1", "10.0.0.1"].map(String::from).to_vec();
        let got: Vec<String> = o.socket_addrs().iter().map(|a| a.to_string()).collect();
        assert_eq!(got, ["192.168.1.9:47100", "100.101.102.103:47100", "127.0.0.1:1"]);
    }
}

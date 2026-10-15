//! Proxy de la webview nativa: lo decide Rust; nunca hay vuelta silenciosa a directo (§4.2).
use np_net::{NetMode, TorState};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProxyDecision {
    Direct,
    Socks { port: u16 },
    /// Proxy a un puerto cerrado: la webview no puede salir.
    Block,
}

pub fn decide(mode: NetMode, tor: &TorState, socks_port: u16) -> ProxyDecision {
    match mode {
        NetMode::Direct => ProxyDecision::Direct,
        NetMode::Tor if matches!(tor, TorState::Ready) && socks_port != 0 => ProxyDecision::Socks { port: socks_port },
        NetMode::Tor => ProxyDecision::Block,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tor_mode_never_falls_back_to_direct() {
        assert_eq!(decide(NetMode::Direct, &TorState::Off, 9150), ProxyDecision::Direct);
        assert_eq!(decide(NetMode::Tor, &TorState::Ready, 9150), ProxyDecision::Socks { port: 9150 });
        for t in [TorState::Off, TorState::Bootstrapping { percent: 40 }, TorState::Failed { message: "x".into() }] {
            assert_eq!(decide(NetMode::Tor, &t, 9150), ProxyDecision::Block);
        }
        assert_eq!(decide(NetMode::Tor, &TorState::Ready, 0), ProxyDecision::Block);
    }
}

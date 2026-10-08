//! Orquesta modo de red, Tor, proxy SOCKS y clientes HTTP por tipo de tráfico.

use std::{
    sync::{Arc, RwLock},
    time::Duration,
};

use tokio::sync::watch;

use crate::{
    compose_status,
    mode::normalize_country,
    route,
    server::{SocksServer, TorBackend},
    NetError, NetMode, NetSettings, NetStatus, Route, Traffic,
};

pub fn tor_browser_args(port: u16) -> String {
    format!(
        "--proxy-server=socks5://127.0.0.1:{port} --host-resolver-rules=\"MAP * ~NOTFOUND , EXCLUDE 127.0.0.1\" --force-webrtc-ip-handling-policy=disable_non_proxied_udp"
    )
}

fn build_client(socks_port: Option<u16>) -> Result<reqwest::Client, NetError> {
    let mut b = reqwest::Client::builder()
        .user_agent(concat!("newpaper/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(45))
        .read_timeout(Duration::from_secs(90));
    match socks_port {
        Some(p) => {
            let proxy = reqwest::Proxy::all(format!("socks5h://127.0.0.1:{p}"))?
                .no_proxy(reqwest::NoProxy::from_string("localhost,127.0.0.1,::1"));
            b = b.proxy(proxy);
        }
        None => b = b.no_proxy(),
    }
    Ok(b.build()?)
}

pub struct NetController {
    tor: Arc<dyn TorBackend>,
    server: SocksServer,
    settings: RwLock<NetSettings>,
    status: watch::Sender<NetStatus>,
    direct: reqwest::Client,
    proxied: reqwest::Client,
}

impl NetController {
    pub async fn start(settings: NetSettings, tor: Arc<dyn TorBackend>) -> Result<Arc<Self>, NetError> {
        let server = SocksServer::bind(tor.clone().connector()).await?;
        let port = server.port();
        if let Some(cc) = &settings.exit_country {
            tor.set_exit_country(Some(cc.as_str()))?;
        }
        let initial = compose_status(&settings, &tor.subscribe().borrow(), port, tor.circuit());
        let (status, _) = watch::channel(initial);
        let me = Arc::new(Self {
            direct: build_client(None)?,
            proxied: build_client(Some(port))?,
            tor: tor.clone(),
            server,
            settings: RwLock::new(settings.clone()),
            status,
        });
        if settings.mode == NetMode::Tor {
            tor.start();
        }
        let weak = Arc::downgrade(&me);
        let mut rx = tor.subscribe();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                match weak.upgrade() {
                    Some(me) => me.refresh(),
                    None => break,
                }
            }
        });
        me.refresh();
        Ok(me)
    }

    fn refresh(&self) {
        let s = self.settings.read().expect("settings lock").clone();
        let tor = self.tor.subscribe().borrow().clone();
        self.status.send_replace(compose_status(&s, &tor, self.server.port(), self.tor.circuit()));
    }

    pub fn status(&self) -> NetStatus {
        self.status.borrow().clone()
    }

    pub fn subscribe(&self) -> watch::Receiver<NetStatus> {
        self.status.subscribe()
    }

    pub fn settings(&self) -> NetSettings {
        self.settings.read().expect("settings lock").clone()
    }

    pub fn socks_port(&self) -> u16 {
        self.server.port()
    }

    pub fn set_mode(&self, mode: NetMode) -> bool {
        {
            let mut s = self.settings.write().expect("settings lock");
            if s.mode == mode {
                return false;
            }
            s.mode = mode;
        }
        match mode {
            NetMode::Tor => self.tor.start(),
            NetMode::Direct => self.tor.stop(),
        }
        self.refresh();
        true
    }

    pub fn set_exit_country(&self, cc: Option<String>) -> Result<bool, NetError> {
        let cc = cc.map(|c| normalize_country(&c)).transpose()?;
        if self.settings.read().expect("settings lock").exit_country == cc {
            return Ok(false);
        }
        self.tor.set_exit_country(cc.as_deref())?;
        self.settings.write().expect("settings lock").exit_country = cc;
        self.refresh();
        Ok(true)
    }

    pub fn new_circuit(&self) -> u64 {
        let n = self.tor.new_circuit();
        self.refresh();
        n
    }

    pub fn set_routing(&self, ai_via_tor: Option<bool>, feeds_via_tor: Option<bool>) -> bool {
        let changed = {
            let mut s = self.settings.write().expect("settings lock");
            let before = (s.ai_via_tor, s.feeds_via_tor);
            if let Some(v) = ai_via_tor {
                s.ai_via_tor = v;
            }
            if let Some(v) = feeds_via_tor {
                s.feeds_via_tor = v;
            }
            before != (s.ai_via_tor, s.feeds_via_tor)
        };
        if changed {
            self.refresh();
        }
        changed
    }

    pub fn http_client(&self, traffic: Traffic) -> reqwest::Client {
        match route(&self.settings.read().expect("settings lock"), traffic) {
            Route::Tor => self.proxied.clone(),
            Route::Direct => self.direct.clone(),
        }
    }
}

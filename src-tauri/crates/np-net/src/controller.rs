//! Orquesta modo de red, Tor, proxy SOCKS y clientes HTTP por tipo de tráfico.

use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, RwLock,
    },
    time::{Duration, Instant},
};

use tokio::sync::watch;

use crate::{
    compose_status,
    mode::normalize_country,
    route,
    server::{SocksServer, TorBackend},
    NetError, NetMode, NetSettings, NetStatus, Route, TorState, Traffic,
};

pub fn tor_browser_args(port: u16) -> String {
    format!(
        "--proxy-server=socks5://127.0.0.1:{port} --host-resolver-rules=\"MAP * ~NOTFOUND , EXCLUDE 127.0.0.1\" --force-webrtc-ip-handling-policy=disable_non_proxied_udp"
    )
}

/// Espera antes de reintentar Tor tras un fallo de arranque (red caída, consenso no descargado...).
pub const TOR_RETRY_DELAY: Duration = Duration::from_secs(60);
/// Dos cambios de red seguidos (WiFi <-> datos) cuentan como uno: evita reiniciar Arti en cada rebote.
pub const NETWORK_DEBOUNCE: Duration = Duration::from_secs(3);

fn build_client(socks_port: Option<u16>, follow_redirects: bool) -> Result<reqwest::Client, NetError> {
    let mut b = crate::with_roots(reqwest::Client::builder())
        .user_agent(concat!("newpaper/", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(45))
        .read_timeout(Duration::from_secs(90));
    if !follow_redirects {
        b = b.redirect(reqwest::redirect::Policy::none());
    }
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
    /// Sin seguir redirecciones: para tráfico con credenciales (IA) o validado salto a salto (fuentes).
    direct_strict: reqwest::Client,
    proxied_strict: reqwest::Client,
    /// Móvil: la app está en segundo plano. Tor no corre y el kill switch deja todo cerrado.
    paused: AtomicBool,
    retry_pending: AtomicBool,
    last_restart: Mutex<Option<Instant>>,
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
            direct: build_client(None, true)?,
            proxied: build_client(Some(port), true)?,
            direct_strict: build_client(None, false)?,
            proxied_strict: build_client(Some(port), false)?,
            tor: tor.clone(),
            server,
            settings: RwLock::new(settings.clone()),
            status,
            paused: AtomicBool::new(false),
            retry_pending: AtomicBool::new(false),
            last_restart: Mutex::new(None),
        });
        if settings.mode == NetMode::Tor {
            tor.start();
        }
        let weak = Arc::downgrade(&me);
        let mut rx = tor.subscribe();
        tokio::spawn(async move {
            while rx.changed().await.is_ok() {
                match weak.upgrade() {
                    Some(me) => {
                        me.refresh();
                        me.schedule_retry(&weak);
                    }
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

    /// Tor deseado (modo Tor, app en primer plano) pero caído: reintento diferido, uno cada vez.
    fn wants_tor(&self) -> bool {
        self.settings.read().expect("settings lock").mode == NetMode::Tor && !self.paused.load(Ordering::SeqCst)
    }

    fn schedule_retry(self: &Arc<Self>, weak: &std::sync::Weak<Self>) {
        let failed = matches!(*self.tor.subscribe().borrow(), TorState::Failed { .. });
        if !failed || !self.wants_tor() || self.retry_pending.swap(true, Ordering::SeqCst) {
            return;
        }
        let weak = weak.clone();
        tokio::spawn(async move {
            tokio::time::sleep(TOR_RETRY_DELAY).await;
            if let Some(me) = weak.upgrade() {
                me.retry_pending.store(false, Ordering::SeqCst);
                if me.wants_tor() {
                    me.tor.start();
                }
            }
        });
    }

    /// Móvil, app a segundo plano: para Arti (batería). El modo no cambia; el proxy de la webview queda cerrado.
    pub fn pause_tor(&self) {
        self.paused.store(true, Ordering::SeqCst);
        if self.settings().mode == NetMode::Tor {
            self.tor.stop();
        }
        self.refresh();
    }

    /// Móvil, app en primer plano: vuelve a arrancar Tor si el modo lo pide.
    pub fn resume_tor(&self) {
        self.paused.store(false, Ordering::SeqCst);
        if self.wants_tor() {
            self.tor.start();
        }
        self.refresh();
    }

    /// Cambio de red: reconecta (reinicia Arti) si Tor está en uso. Devuelve si lo reinició.
    pub fn network_changed(&self) -> bool {
        if !self.wants_tor() {
            return false;
        }
        {
            let mut last = self.last_restart.lock().expect("restart lock");
            if last.is_some_and(|t| t.elapsed() < NETWORK_DEBOUNCE) {
                return false;
            }
            *last = Some(Instant::now());
        }
        tracing::info!("network changed: rebootstrapping tor");
        self.tor.stop();
        self.tor.start();
        self.refresh();
        true
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

    /// Servidor SOCKS de sesión (móvil): un puerto efímero propio para la webview original que vive solo mientras
    /// ella está abierta. Mismo conector que el servidor principal, así que el kill switch es el mismo (Tor no listo
    /// => error). Reduce la ventana en la que otra app del dispositivo puede usar `127.0.0.1:<puerto>`.
    pub async fn session_socks(&self) -> Result<SocksServer, NetError> {
        Ok(SocksServer::bind(self.tor.clone().connector()).await?)
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
            NetMode::Tor if !self.paused.load(Ordering::SeqCst) => self.tor.start(),
            NetMode::Tor => {}
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

    pub fn http_client_strict(&self, traffic: Traffic) -> reqwest::Client {
        match route(&self.settings.read().expect("settings lock"), traffic) {
            Route::Tor => self.proxied_strict.clone(),
            Route::Direct => self.direct_strict.clone(),
        }
    }

    pub fn http_client(&self, traffic: Traffic) -> reqwest::Client {
        match route(&self.settings.read().expect("settings lock"), traffic) {
            Route::Tor => self.proxied.clone(),
            Route::Direct => self.direct.clone(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fake::FakeTor;
    use std::net::SocketAddr;
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };

    /// Origen HTTP mínimo que cuenta las conexiones que recibe.
    async fn origin() -> (SocketAddr, Arc<std::sync::atomic::AtomicUsize>) {
        let l = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = l.local_addr().unwrap();
        let hits = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let h = hits.clone();
        tokio::spawn(async move {
            while let Ok((mut s, _)) = l.accept().await {
                h.fetch_add(1, Ordering::SeqCst);
                tokio::spawn(async move {
                    let mut buf = [0u8; 1024];
                    let _ = s.read(&mut buf).await;
                    let _ = s.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok").await;
                });
            }
        });
        (addr, hits)
    }

    fn tor_mode() -> NetSettings {
        NetSettings { mode: NetMode::Tor, ..Default::default() }
    }

    async fn fetch(net: &NetController) -> Result<String, reqwest::Error> {
        net.http_client(Traffic::Web).get("http://origin.test/").send().await?.text().await
    }

    #[tokio::test]
    async fn tor_not_ready_fails_closed() {
        let (addr, hits) = origin().await;
        let tor = FakeTor::new(false).with_host("origin.test", addr);
        let net = NetController::start(tor_mode(), tor.clone()).await.unwrap();
        assert!(net.status().kill_switch_active);
        assert!(fetch(&net).await.is_err());
        assert_eq!(hits.load(Ordering::SeqCst), 0, "nothing may leave in clear");
        assert!(tor.seen_targets().is_empty());
    }

    /// SOCKS5 mínimo: saludo + CONNECT a un dominio. Devuelve el código de respuesta.
    async fn socks_connect(port: u16, host: &str) -> u8 {
        let mut c = tokio::net::TcpStream::connect(("127.0.0.1", port)).await.unwrap();
        c.write_all(&[5, 1, 0]).await.unwrap();
        let mut g = [0u8; 2];
        c.read_exact(&mut g).await.unwrap();
        let mut req = vec![5, 1, 0, 3, host.len() as u8];
        req.extend_from_slice(host.as_bytes());
        req.extend_from_slice(&80u16.to_be_bytes());
        c.write_all(&req).await.unwrap();
        let mut r = [0u8; 10];
        c.read_exact(&mut r).await.unwrap();
        r[1]
    }

    #[tokio::test]
    async fn session_socks_shares_the_kill_switch_and_closes_on_drop() {
        let (addr, hits) = origin().await;
        let tor = FakeTor::new(false).with_host("origin.test", addr);
        let net = NetController::start(tor_mode(), tor.clone()).await.unwrap();
        let session = net.session_socks().await.unwrap();
        let port = session.port();
        assert_ne!(port, net.socks_port(), "the webview session gets its own ephemeral port");
        assert_ne!(socks_connect(port, "origin.test").await, 0, "Tor not ready: refused");
        assert_eq!(hits.load(Ordering::SeqCst), 0);
        drop(session);
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert!(tokio::net::TcpStream::connect(("127.0.0.1", port)).await.is_err(), "closed with the webview");
    }

    #[tokio::test]
    async fn tor_ready_carries_the_request() {
        let (addr, _) = origin().await;
        let tor = FakeTor::new(true).with_host("origin.test", addr);
        let net = NetController::start(tor_mode(), tor.clone()).await.unwrap();
        assert_eq!(fetch(&net).await.unwrap(), "ok");
        assert!(tor.seen_targets().iter().any(|t| t.starts_with("origin.test")));
    }

    #[tokio::test]
    async fn pause_closes_the_path_and_resume_reopens_it() {
        let (addr, hits) = origin().await;
        let tor = FakeTor::new(true).with_host("origin.test", addr);
        let net = NetController::start(tor_mode(), tor.clone()).await.unwrap();
        net.pause_tor();
        assert_eq!(tor.stops(), 1);
        assert!(fetch(&net).await.is_err());
        assert_eq!(hits.load(Ordering::SeqCst), 0);
        net.resume_tor();
        assert_eq!(fetch(&net).await.unwrap(), "ok");
    }

    #[tokio::test]
    async fn network_change_rebootstraps_once_and_never_in_direct() {
        let tor = FakeTor::new(true);
        let net = NetController::start(tor_mode(), tor.clone()).await.unwrap();
        assert!(net.network_changed());
        assert!(!net.network_changed(), "debounced");
        assert_eq!(tor.stops(), 1);
        assert_eq!(tor.starts(), 2);
        net.set_mode(NetMode::Direct);
        assert!(!net.network_changed());
        assert_eq!(tor.starts(), 2, "direct mode never starts tor");
    }
}

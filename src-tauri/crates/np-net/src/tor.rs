//! Tor embebido con Arti. Arranque manual, estado observable, país de salida y aislamiento por circuito.

use std::{
    path::PathBuf,
    str::FromStr,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, Weak,
    },
    time::{Duration, Instant},
};

use arti_client::{
    config::TorClientConfigBuilder,
    status::BlockageKind,
    BootstrapBehavior, CountryCode, IsolationToken, StreamPrefs, TorClient,
};
use async_trait::async_trait;
use futures::StreamExt;
use tokio::{sync::watch, task::JoinHandle};
use tor_rtcompat::PreferredRuntime;

use crate::{
    mode::normalize_country,
    server::{BoxStream, ConnectError, Connector, TorBackend},
    socks::TargetAddr,
    BootDetail, NetError, TorState,
};

/// Cada cuánto se recalcula el diagnóstico aunque Arti no emita eventos (el tiempo parado cambia solo).
const DIAG_TICK: Duration = Duration::from_secs(2);
/// Cada cuánto se escribe una línea de progreso en el registro aunque nada cambie.
const LOG_HEARTBEAT: Duration = Duration::from_secs(15);
/// Sin ningún cambio de progreso durante este tiempo, el intento se da por fallido y se reinicia desde la caché
/// (un guarda o un circuito malos no se corrigen solos en un enlace móvil).
const STALL_LIMIT: Duration = Duration::from_secs(240);
/// Espera máxima a que el cliente anterior suelte la caché y el estado antes de crear otro.
const PREVIOUS_CLIENT_WAIT: Duration = Duration::from_secs(10);

pub fn country_code(cc: &str) -> Result<CountryCode, NetError> {
    let n = normalize_country(cc)?;
    CountryCode::from_str(&n).map_err(|_| NetError::InvalidCountry(cc.to_string()))
}

struct Prefs {
    country: Option<CountryCode>,
    token: IsolationToken,
    circuit: u64,
}

pub struct ArtiTor {
    me: Weak<ArtiTor>,
    state_dir: PathBuf,
    cache_dir: PathBuf,
    client: Mutex<Option<Arc<TorClient<PreferredRuntime>>>>,
    /// El cliente de la vuelta anterior: el siguiente espera a que muera para no quedar en modo solo lectura
    /// (Arti bloquea la caché y el estado por cliente; con dos vivos el nuevo no descarga nada).
    previous: Mutex<Weak<TorClient<PreferredRuntime>>>,
    state: watch::Sender<TorState>,
    prefs: Mutex<Prefs>,
    task: Mutex<Option<JoinHandle<()>>>,
    monitor: Mutex<Option<JoinHandle<()>>>,
    /// Borrar caché y estado antes del próximo arranque (ver `reset_data`).
    wipe: AtomicBool,
    /// La autorrecuperación por caché dañada se intenta una vez por sesión.
    auto_wiped: AtomicBool,
    /// Motivo del próximo arranque, para el diagnóstico de la interfaz.
    reason: Mutex<Option<&'static str>>,
}

/// Mensaje completo de un error con sus causas (el `Display` de Arti es muy corto).
fn error_chain(e: &dyn std::error::Error) -> String {
    let mut out = e.to_string();
    let mut cur = e.source();
    while let Some(c) = cur {
        out.push_str(": ");
        out.push_str(&c.to_string());
        cur = c.source();
    }
    out
}

fn looks_like_corrupt_cache(msg: &str) -> bool {
    let m = msg.to_ascii_lowercase();
    ["sqlite", "database", "malformed", "corrupt", "not a database", "disk image"].iter().any(|k| m.contains(k))
}

fn phase_of(text: &str) -> Option<&'static str> {
    let t = text.to_ascii_lowercase();
    if t.contains("microdescriptor") {
        Some("descriptors")
    } else if t.contains("certificate") {
        Some("certificates")
    } else if t.contains("consensus") || t.contains("directory") {
        Some("directory")
    } else if t.contains("connecting") || t.contains("handshak") {
        Some("connecting")
    } else {
        None
    }
}

fn blocked_label(k: &BlockageKind) -> &'static str {
    match k {
        BlockageKind::Offline => "offline",
        BlockageKind::Filtering => "filtering",
        BlockageKind::CantReachTor => "cant_reach_tor",
        BlockageKind::ClockSkewed => "clock_skewed",
        BlockageKind::CantBootstrap => "cant_bootstrap",
        _ => "unknown",
    }
}

impl ArtiTor {
    pub fn new(state_dir: PathBuf, cache_dir: PathBuf) -> Arc<Self> {
        let (state, _) = watch::channel(TorState::Off);
        // `new_cyclic` guarda un Weak propio: `start(&self)` necesita un Arc para lanzar la tarea.
        Arc::new_cyclic(|me| Self {
            me: me.clone(),
            state_dir,
            cache_dir,
            client: Mutex::new(None),
            previous: Mutex::new(Weak::new()),
            state,
            prefs: Mutex::new(Prefs { country: None, token: IsolationToken::new(), circuit: 1 }),
            task: Mutex::new(None),
            monitor: Mutex::new(None),
            wipe: AtomicBool::new(false),
            auto_wiped: AtomicBool::new(false),
            reason: Mutex::new(None),
        })
    }

    fn stream_prefs(&self) -> StreamPrefs {
        let p = self.prefs.lock().expect("prefs lock");
        let mut sp = StreamPrefs::new();
        sp.set_isolation(p.token);
        match p.country {
            Some(cc) => sp.exit_country(cc),
            None => sp.any_exit_country(),
        };
        sp
    }

    /// Configuración para enlaces móviles lentos. Los plazos de lectura de `tor-dirclient` (10 s) y los de
    /// `tor-guardmgr` están fijados en esas crates y no se pueden cambiar desde aquí; lo que sí se puede es tolerar
    /// más fallos por lote de descarga.
    fn config(&self) -> Result<arti_client::TorClientConfig, String> {
        let mut b = TorClientConfigBuilder::from_directories(&self.state_dir, &self.cache_dir);
        // Por defecto: 3 intentos y 4 descargas paralelas. Con pérdidas, 3 fallos seguidos acaban el lote.
        b.download_schedule().retry_certs().attempts(8);
        b.download_schedule().retry_microdescs().attempts(10);
        b.download_schedule().retry_microdescs().parallelism(3);
        b.build().map_err(|e| error_chain(&e))
    }

    /// Edad de la caché del directorio (el fichero sqlite más reciente), si hay.
    fn cache_age(&self) -> Option<Duration> {
        std::fs::read_dir(&self.cache_dir)
            .ok()?
            .filter_map(|e| e.ok()?.metadata().ok()?.modified().ok())
            .max()
            .and_then(|t| t.elapsed().ok())
    }

    fn wipe_dirs(&self) {
        for dir in [&self.cache_dir, &self.state_dir] {
            match std::fs::remove_dir_all(dir) {
                Ok(()) => tracing::warn!(dir = %dir.display(), "tor data directory cleared"),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => tracing::error!(dir = %dir.display(), error = %e, "could not clear tor data directory"),
            }
        }
    }

    /// Espera (con tope) a que el cliente anterior se suelte del todo.
    async fn wait_previous_client(&self) {
        let waited = Instant::now();
        let mut logged = false;
        while self.previous.lock().expect("previous lock").strong_count() > 0 {
            if waited.elapsed() >= PREVIOUS_CLIENT_WAIT {
                tracing::warn!("previous tor client still alive after {:?}; starting anyway", PREVIOUS_CLIENT_WAIT);
                return;
            }
            if !logged {
                logged = true;
                tracing::info!("waiting for the previous tor client to release its files");
            }
            tokio::time::sleep(Duration::from_millis(200)).await;
        }
        if logged {
            tracing::info!(waited_ms = waited.elapsed().as_millis() as u64, "previous tor client released");
        }
    }

    async fn run(self: Arc<Self>) {
        let t0 = Instant::now();
        tracing::info!("tor bootstrap: starting");
        self.wait_previous_client().await;
        let wiped = self.wipe.swap(false, Ordering::SeqCst);
        if wiped {
            self.wipe_dirs();
        }
        let cache_age = if wiped { None } else { self.cache_age() };
        let cache = if wiped { "reset" } else if cache_age.is_some() { "warm" } else { "cold" };
        let reason = self.reason.lock().expect("reason lock").take();
        tracing::info!(cache, cache_age_s = cache_age.map(|d| d.as_secs()), reason, "tor bootstrap: cache state");
        let config = match self.config() {
            Ok(c) => c,
            Err(e) => return self.fail(e),
        };
        let client = match TorClient::builder().config(config).bootstrap_behavior(BootstrapBehavior::Manual).create_unbootstrapped() {
            Ok(c) => c,
            Err(e) => return self.fail(error_chain(&e)),
        };
        *self.previous.lock().expect("previous lock") = Arc::downgrade(&client);
        let monitor = {
            let state = self.state.clone();
            let mut latest = client.bootstrap_status();
            let mut events = client.bootstrap_events();
            let me = self.me.clone();
            tokio::spawn(async move {
                let mut last_text = String::new();
                let mut last_pct = u8::MAX;
                let mut last_change = Instant::now();
                let mut last_log: Option<Instant> = None;
                let mut phase = "connecting";
                let mut tick = tokio::time::interval(DIAG_TICK);
                loop {
                    tokio::select! {
                        ev = events.next() => match ev {
                            Some(s) => latest = s,
                            None => break,
                        },
                        _ = tick.tick() => {}
                    }
                    let percent = (latest.as_frac() * 100.0).clamp(0.0, 99.0) as u8;
                    let text = latest.to_string();
                    let changed = text != last_text || percent != last_pct;
                    if changed {
                        last_text = text.clone();
                        last_pct = percent;
                        last_change = Instant::now();
                    }
                    let blocked = latest.blocked();
                    if blocked.is_none() {
                        if let Some(p) = phase_of(&text) {
                            phase = p;
                        }
                    }
                    let elapsed = t0.elapsed();
                    let stalled = last_change.elapsed();
                    let detail = BootDetail {
                        phase: phase.to_string(),
                        summary: text.clone(),
                        blocked: blocked.as_ref().map(|b| blocked_label(&b.kind()).to_string()),
                        elapsed_secs: elapsed.as_secs(),
                        stalled_secs: stalled.as_secs(),
                        cache: cache.to_string(),
                        cache_age_secs: cache_age.map(|d| d.as_secs()),
                        restart_reason: reason.map(str::to_string),
                    };
                    if changed || last_log.is_none_or(|t| t.elapsed() >= LOG_HEARTBEAT) {
                        last_log = Some(Instant::now());
                        tracing::info!(
                            target: "np_net::tor",
                            elapsed_s = elapsed.as_secs(),
                            stalled_s = stalled.as_secs(),
                            percent,
                            phase,
                            "tor bootstrap: {text}"
                        );
                    }
                    state.send_if_modified(|cur| {
                        if matches!(cur, TorState::Bootstrapping { .. }) {
                            let next = TorState::Bootstrapping { percent, detail: Some(detail) };
                            if *cur != next {
                                *cur = next;
                                return true;
                            }
                        }
                        false
                    });
                    if !matches!(*state.borrow(), TorState::Bootstrapping { .. }) {
                        break;
                    }
                    if stalled >= STALL_LIMIT {
                        tracing::warn!(stalled_s = stalled.as_secs(), "tor bootstrap: no progress, giving up this attempt");
                        if let Some(me) = me.upgrade() {
                            me.fail(format!("no bootstrap progress for {} s ({text})", stalled.as_secs()));
                            if let Some(t) = me.task.lock().expect("task lock").take() {
                                t.abort();
                            }
                        }
                        break;
                    }
                }
            })
        };
        if let Some(old) = self.monitor.lock().expect("monitor lock").replace(monitor) {
            old.abort();
        }
        *self.client.lock().expect("client lock") = Some(client.clone());
        match client.bootstrap().await {
            Ok(()) => {
                tracing::info!(elapsed_s = t0.elapsed().as_secs(), "tor bootstrap: ready");
                self.state.send_replace(TorState::Ready);
            }
            Err(e) => {
                let msg = error_chain(&e);
                if looks_like_corrupt_cache(&msg) && !self.auto_wiped.swap(true, Ordering::SeqCst) {
                    tracing::warn!(%msg, "tor cache looks damaged: it will be cleared on the next attempt");
                    self.wipe.store(true, Ordering::SeqCst);
                }
                self.fail(msg);
            }
        }
    }

    fn fail(&self, message: String) {
        tracing::error!(%message, "tor bootstrap failed");
        *self.client.lock().expect("client lock") = None;
        self.state.send_replace(TorState::Failed { message });
    }
}

impl TorBackend for ArtiTor {
    fn start(&self) {
        let mut task = self.task.lock().expect("task lock");
        if task.as_ref().is_some_and(|t| !t.is_finished()) || *self.state.borrow() == TorState::Ready {
            return;
        }
        let Some(me) = self.me.upgrade() else { return };
        self.state.send_replace(TorState::bootstrapping(0));
        *task = Some(tokio::spawn(me.run()));
    }

    fn stop(&self) {
        if let Some(t) = self.task.lock().expect("task lock").take() {
            t.abort();
        }
        if let Some(t) = self.monitor.lock().expect("monitor lock").take() {
            t.abort();
        }
        tracing::info!("tor stopped");
        *self.client.lock().expect("client lock") = None;
        self.state.send_replace(TorState::Off);
    }

    fn subscribe(&self) -> watch::Receiver<TorState> {
        self.state.subscribe()
    }

    fn set_exit_country(&self, cc: Option<&str>) -> Result<(), NetError> {
        let parsed = cc.map(country_code).transpose()?;
        self.prefs.lock().expect("prefs lock").country = parsed;
        Ok(())
    }

    fn new_circuit(&self) -> u64 {
        let mut p = self.prefs.lock().expect("prefs lock");
        p.token = IsolationToken::new();
        p.circuit += 1;
        p.circuit
    }

    fn circuit(&self) -> u64 {
        self.prefs.lock().expect("prefs lock").circuit
    }

    fn connector(self: Arc<Self>) -> Arc<dyn Connector> {
        self
    }

    fn reset_data(&self) {
        self.wipe.store(true, Ordering::SeqCst);
    }

    fn set_start_reason(&self, reason: &'static str) {
        *self.reason.lock().expect("reason lock") = Some(reason);
    }
}

#[async_trait]
impl Connector for ArtiTor {
    async fn connect(&self, target: &TargetAddr) -> Result<BoxStream, ConnectError> {
        if *self.state.borrow() != TorState::Ready {
            return Err(ConnectError::NotReady);
        }
        let Some(client) = self.client.lock().expect("client lock").clone() else {
            return Err(ConnectError::NotReady);
        };
        let prefs = self.stream_prefs();
        let stream = client
            .connect_with_prefs((target.host(), target.port()), &prefs)
            .await
            .map_err(|e| ConnectError::Unreachable(e.to_string()))?;
        Ok(Box::new(stream))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_country_codes() {
        assert_eq!(country_code("de").unwrap().to_string(), "DE");
        assert!(country_code("zz9").is_err());
    }

    #[tokio::test]
    async fn not_ready_until_bootstrapped() {
        let dir = tempfile::tempdir().unwrap();
        let tor = ArtiTor::new(dir.path().join("state"), dir.path().join("cache"));
        assert_eq!(*tor.subscribe().borrow(), TorState::Off);
        let c = tor.clone().connector();
        let Err(err) = c.connect(&crate::TargetAddr::Domain("example.com".into(), 80)).await else {
            panic!("connect must fail before bootstrap");
        };
        assert!(matches!(err, ConnectError::NotReady));
    }

    #[test]
    fn new_circuit_increments() {
        let dir = tempfile::tempdir().unwrap();
        let tor = ArtiTor::new(dir.path().join("state"), dir.path().join("cache"));
        let a = tor.circuit();
        assert_eq!(tor.new_circuit(), a + 1);
        assert!(tor.set_exit_country(Some("nl")).is_ok());
        assert!(tor.set_exit_country(Some("nope")).is_err());
        assert!(tor.set_exit_country(None).is_ok());
    }

    #[test]
    fn phases_come_from_arti_text() {
        assert_eq!(phase_of("directory is fetching microdescriptors (1/9)"), Some("descriptors"));
        assert_eq!(phase_of("directory is fetching authority certificates (1/9)"), Some("certificates"));
        assert_eq!(phase_of("directory is fetching a consensus"), Some("directory"));
        assert_eq!(phase_of("connecting to the internet; not downloading"), Some("connecting"));
    }

    #[test]
    fn reset_clears_cache_and_state_on_next_start() {
        let dir = tempfile::tempdir().unwrap();
        let (state, cache) = (dir.path().join("state"), dir.path().join("cache"));
        std::fs::create_dir_all(&state).unwrap();
        std::fs::create_dir_all(&cache).unwrap();
        std::fs::write(cache.join("dir.sqlite3"), b"junk").unwrap();
        let tor = ArtiTor::new(state.clone(), cache.clone());
        tor.reset_data();
        assert!(cache.exists(), "nothing is deleted until the next start");
        assert!(tor.wipe.swap(false, Ordering::SeqCst));
        tor.wipe_dirs();
        assert!(!cache.exists() && !state.exists());
        assert!(looks_like_corrupt_cache("sqlite: database disk image is malformed"));
        assert!(!looks_like_corrupt_cache("timed out"));
    }
}

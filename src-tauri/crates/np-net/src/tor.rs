//! Tor embebido con Arti. Arranque manual, estado observable, país de salida y aislamiento por circuito.

use std::{
    path::PathBuf,
    str::FromStr,
    sync::{Arc, Mutex, Weak},
};

use arti_client::{
    config::TorClientConfigBuilder, BootstrapBehavior, CountryCode, IsolationToken, StreamPrefs, TorClient,
};
use async_trait::async_trait;
use futures::StreamExt;
use tokio::{sync::watch, task::JoinHandle};
use tor_rtcompat::PreferredRuntime;

use crate::{
    mode::normalize_country,
    server::{BoxStream, ConnectError, Connector, TorBackend},
    socks::TargetAddr,
    NetError, TorState,
};

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
    state: watch::Sender<TorState>,
    prefs: Mutex<Prefs>,
    task: Mutex<Option<JoinHandle<()>>>,
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
            state,
            prefs: Mutex::new(Prefs { country: None, token: IsolationToken::new(), circuit: 1 }),
            task: Mutex::new(None),
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

    async fn run(self: Arc<Self>) {
        let config = match TorClientConfigBuilder::from_directories(&self.state_dir, &self.cache_dir).build() {
            Ok(c) => c,
            Err(e) => return self.fail(e.to_string()),
        };
        let client = match TorClient::builder()
            .config(config)
            .bootstrap_behavior(BootstrapBehavior::Manual)
            .create_unbootstrapped()
        {
            Ok(c) => c,
            Err(e) => return self.fail(e.to_string()),
        };
        let mut events = client.bootstrap_events();
        let state = self.state.clone();
        tokio::spawn(async move {
            while let Some(s) = events.next().await {
                let percent = (s.as_frac() * 100.0).clamp(0.0, 99.0) as u8;
                state.send_if_modified(|cur| {
                    if matches!(cur, TorState::Bootstrapping { .. }) {
                        *cur = TorState::Bootstrapping { percent };
                        true
                    } else {
                        false
                    }
                });
            }
        });
        *self.client.lock().expect("client lock") = Some(client.clone());
        match client.bootstrap().await {
            Ok(()) => {
                self.state.send_replace(TorState::Ready);
            }
            Err(e) => self.fail(e.to_string()),
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
        self.state.send_replace(TorState::Bootstrapping { percent: 0 });
        *task = Some(tokio::spawn(me.run()));
    }

    fn stop(&self) {
        if let Some(t) = self.task.lock().expect("task lock").take() {
            t.abort();
        }
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
}

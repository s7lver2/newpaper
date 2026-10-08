//! Tor simulado para tests y e2e (spec §12): conecta directo, pero obedece "listo / no listo".

use std::{
    collections::HashMap,
    net::SocketAddr,
    sync::{
        atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering},
        Arc, Mutex,
    },
};

use async_trait::async_trait;
use tokio::{net::TcpStream, sync::watch};

use crate::{
    mode::normalize_country,
    server::{BoxStream, ConnectError, Connector, TorBackend},
    socks::TargetAddr,
    NetError, TorState,
};

pub struct FakeTor {
    ready: AtomicBool,
    state: watch::Sender<TorState>,
    hosts: Mutex<HashMap<String, SocketAddr>>,
    seen: Mutex<Vec<String>>,
    country: Mutex<Option<String>>,
    circuit: AtomicU64,
    starts: AtomicUsize,
    stops: AtomicUsize,
}

impl FakeTor {
    pub fn new(ready: bool) -> Arc<Self> {
        let (state, _) = watch::channel(if ready { TorState::Ready } else { TorState::Off });
        Arc::new(Self {
            ready: AtomicBool::new(ready),
            state,
            hosts: Mutex::default(),
            seen: Mutex::default(),
            country: Mutex::default(),
            circuit: AtomicU64::new(1),
            starts: AtomicUsize::new(0),
            stops: AtomicUsize::new(0),
        })
    }

    pub fn with_host(self: Arc<Self>, name: &str, addr: SocketAddr) -> Arc<Self> {
        self.hosts.lock().unwrap().insert(name.to_string(), addr);
        self
    }

    pub fn set_ready(&self, ready: bool) {
        self.ready.store(ready, Ordering::SeqCst);
        self.state.send_replace(if ready { TorState::Ready } else { TorState::Bootstrapping { percent: 50 } });
    }

    pub fn seen_targets(&self) -> Vec<String> {
        self.seen.lock().unwrap().clone()
    }
    pub fn starts(&self) -> usize {
        self.starts.load(Ordering::SeqCst)
    }
    pub fn stops(&self) -> usize {
        self.stops.load(Ordering::SeqCst)
    }
    pub fn exit_country(&self) -> Option<String> {
        self.country.lock().unwrap().clone()
    }
}

#[async_trait]
impl Connector for FakeTor {
    async fn connect(&self, target: &TargetAddr) -> Result<BoxStream, ConnectError> {
        if !self.ready.load(Ordering::SeqCst) {
            return Err(ConnectError::NotReady);
        }
        self.seen.lock().unwrap().push(target.to_string());
        let mapped = self.hosts.lock().unwrap().get(&target.host()).copied();
        let stream = match (mapped, target) {
            (Some(addr), _) => TcpStream::connect(addr).await,
            (None, TargetAddr::Ip(sa)) => TcpStream::connect(*sa).await,
            (None, TargetAddr::Domain(h, p)) if !h.ends_with(".test") => TcpStream::connect((h.as_str(), *p)).await,
            (None, _) => return Err(ConnectError::Unreachable(target.to_string())),
        };
        stream.map(|s| Box::new(s) as BoxStream).map_err(|e| ConnectError::Unreachable(e.to_string()))
    }
}

impl TorBackend for FakeTor {
    fn start(&self) {
        self.starts.fetch_add(1, Ordering::SeqCst);
        if self.ready.load(Ordering::SeqCst) {
            self.state.send_replace(TorState::Ready);
        }
    }
    fn stop(&self) {
        self.stops.fetch_add(1, Ordering::SeqCst);
        self.state.send_replace(TorState::Off);
    }
    fn subscribe(&self) -> watch::Receiver<TorState> {
        self.state.subscribe()
    }
    fn set_exit_country(&self, cc: Option<&str>) -> Result<(), NetError> {
        let v = cc.map(normalize_country).transpose()?;
        *self.country.lock().unwrap() = v;
        Ok(())
    }
    fn new_circuit(&self) -> u64 {
        self.circuit.fetch_add(1, Ordering::SeqCst) + 1
    }
    fn circuit(&self) -> u64 {
        self.circuit.load(Ordering::SeqCst)
    }
    fn connector(self: Arc<Self>) -> Arc<dyn Connector> {
        self
    }
}

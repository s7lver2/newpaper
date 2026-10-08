//! Reloj híbrido lógico (HLC) para `updated_at` de las filas sincronizables.
use std::{
    fmt,
    str::FromStr,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Deserializer, Serialize, Serializer};

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Hlc {
    pub millis: u64,
    pub counter: u32,
    pub node: String,
}

impl fmt::Display for Hlc {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:013}-{:05}-{}", self.millis, self.counter, self.node)
    }
}

#[derive(Debug, PartialEq, Eq)]
pub struct HlcParseError;

impl FromStr for Hlc {
    type Err = HlcParseError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        let mut parts = s.splitn(3, '-');
        let millis = parts.next().and_then(|p| p.parse().ok()).ok_or(HlcParseError)?;
        let counter = parts.next().and_then(|p| p.parse().ok()).ok_or(HlcParseError)?;
        let node = parts.next().filter(|n| !n.is_empty()).ok_or(HlcParseError)?;
        Ok(Hlc { millis, counter, node: node.to_string() })
    }
}

impl Serialize for Hlc {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

impl<'de> Deserialize<'de> for Hlc {
    fn deserialize<D: Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let s = String::deserialize(d)?;
        s.parse().map_err(|_| serde::de::Error::custom("invalid HLC"))
    }
}

type TimeSource = Box<dyn Fn() -> u64 + Send + Sync>;

pub struct HlcClock {
    node: String,
    last: Mutex<(u64, u32)>,
    time: TimeSource,
}

fn wall_millis() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

impl HlcClock {
    pub fn new(node: impl Into<String>) -> Self {
        Self::with_time_source(node, wall_millis)
    }

    pub fn with_time_source(node: impl Into<String>, f: impl Fn() -> u64 + Send + Sync + 'static) -> Self {
        Self { node: node.into(), last: Mutex::new((0, 0)), time: Box::new(f) }
    }

    pub fn node(&self) -> &str {
        &self.node
    }

    pub fn now(&self) -> Hlc {
        let pt = (self.time)();
        let mut g = self.last.lock().expect("hlc lock");
        if pt > g.0 {
            *g = (pt, 0);
        } else {
            g.1 += 1;
        }
        Hlc { millis: g.0, counter: g.1, node: self.node.clone() }
    }

    /// Ajusta el reloj al recibir un HLC remoto (algoritmo de Kulkarni et al.).
    pub fn observe(&self, remote: &Hlc) -> Hlc {
        let pt = (self.time)();
        let mut g = self.last.lock().expect("hlc lock");
        let (l, c) = *g;
        let m = pt.max(l).max(remote.millis);
        let counter = if m == l && m == remote.millis {
            c.max(remote.counter) + 1
        } else if m == l {
            c + 1
        } else if m == remote.millis {
            remote.counter + 1
        } else {
            0
        };
        *g = (m, counter);
        Hlc { millis: m, counter, node: self.node.clone() }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    };

    fn clock_at(t: Arc<AtomicU64>) -> HlcClock {
        HlcClock::with_time_source("a1b2", move || t.load(Ordering::SeqCst))
    }

    #[test]
    fn encodes_sortable_text_and_round_trips() {
        let h = Hlc { millis: 1_760_000_000_000, counter: 7, node: "a1b2".into() };
        assert_eq!(h.to_string(), "1760000000000-00007-a1b2");
        assert_eq!("1760000000000-00007-a1b2".parse::<Hlc>().unwrap(), h);
        assert!("garbage".parse::<Hlc>().is_err());
        let older = Hlc { millis: 999, counter: 99, node: "z".into() };
        assert!(older.to_string() < h.to_string());
        assert!(older < h);
    }

    #[test]
    fn now_is_strictly_monotonic_even_if_wall_clock_stalls_or_goes_back() {
        let t = Arc::new(AtomicU64::new(1_000));
        let c = clock_at(t.clone());
        let a = c.now();
        let b = c.now();
        t.store(500, Ordering::SeqCst);
        let d = c.now();
        assert!(a < b && b < d);
        assert_eq!((b.millis, b.counter), (1_000, 1));
        assert_eq!((d.millis, d.counter), (1_000, 2));
        t.store(2_000, Ordering::SeqCst);
        assert_eq!((c.now().millis, c.now().counter), (2_000, 1));
    }

    #[test]
    fn observe_moves_past_remote_timestamps() {
        let t = Arc::new(AtomicU64::new(1_000));
        let c = clock_at(t);
        let remote = Hlc { millis: 5_000, counter: 3, node: "remote".into() };
        let o = c.observe(&remote);
        assert_eq!((o.millis, o.counter), (5_000, 4));
        assert!(c.now() > remote);
    }
}

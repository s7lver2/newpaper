//! Guardia de arranque: si una versión recién instalada no llega a "sano" dos veces, se vuelve a la anterior (§17).

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::Result;

pub const MAX_FAILED_STARTS: u32 = 2;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct PendingUpdate {
    pub from: String,
    pub to: String,
    pub failed_starts: u32,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct BootState {
    pub last_good: Option<String>,
    pub pending: Option<PendingUpdate>,
    pub skipped: Vec<String>,
    pub rolled_back_from: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BootDecision {
    Normal,
    Rollback { to_version: String },
}

pub struct BootGuard {
    path: PathBuf,
    state: BootState,
}

impl BootGuard {
    /// Un fichero ilegible se trata como vacío: la guardia nunca debe impedir arrancar.
    pub fn open(path: &Path) -> Result<Self> {
        let state = std::fs::read_to_string(path).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_default();
        Ok(Self { path: path.to_path_buf(), state })
    }

    pub fn state(&self) -> &BootState {
        &self.state
    }

    pub fn record_update(&mut self, from: &str, to: &str) {
        self.state.pending = Some(PendingUpdate { from: from.into(), to: to.into(), failed_starts: 0 });
    }

    pub fn on_start(&mut self, current: &str) -> BootDecision {
        let Some(p) = self.state.pending.as_mut() else { return BootDecision::Normal };
        if p.to != current {
            // Seguimos en la versión de antes (la instalación no ocurrió) o ya volvimos atrás.
            if p.from == current && self.state.rolled_back_from.as_deref() == Some(p.to.as_str()) {
                self.state.pending = None;
            }
            return BootDecision::Normal;
        }
        if p.failed_starts >= MAX_FAILED_STARTS {
            let to_version = p.from.clone();
            let bad = p.to.clone();
            if !self.state.skipped.contains(&bad) {
                self.state.skipped.push(bad.clone());
            }
            self.state.rolled_back_from = Some(bad);
            return BootDecision::Rollback { to_version };
        }
        p.failed_starts += 1;
        BootDecision::Normal
    }

    pub fn mark_healthy(&mut self, current: &str) {
        if self.state.pending.as_ref().is_some_and(|p| p.to == current) {
            self.state.pending = None;
        }
        self.state.last_good = Some(current.into());
    }

    pub fn take_rollback_notice(&mut self) -> Option<String> {
        if self.state.pending.is_some() {
            return None;
        }
        self.state.rolled_back_from.take()
    }

    pub fn is_skipped(&self, version: &str) -> bool {
        self.state.skipped.iter().any(|v| v == version)
    }

    pub fn save(&self) -> Result<()> {
        if let Some(dir) = self.path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let tmp = self.path.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_vec_pretty(&self.state)?)?;
        std::fs::rename(&tmp, &self.path)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn guard() -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("updates").join("boot.json");
        (dir, p)
    }

    #[test]
    fn healthy_update_clears_pending() {
        let (_d, p) = guard();
        let mut g = BootGuard::open(&p).unwrap();
        g.record_update("1.0.0", "1.1.0");
        g.save().unwrap();
        let mut g = BootGuard::open(&p).unwrap();
        assert_eq!(g.on_start("1.1.0"), BootDecision::Normal);
        g.mark_healthy("1.1.0");
        g.save().unwrap();
        let g = BootGuard::open(&p).unwrap();
        assert_eq!(g.state().last_good.as_deref(), Some("1.1.0"));
        assert!(g.state().pending.is_none());
    }

    #[test]
    fn rolls_back_on_the_third_start_after_two_unhealthy_starts_and_skips_the_version() {
        let (_d, p) = guard();
        let mut g = BootGuard::open(&p).unwrap();
        g.record_update("1.0.0", "1.1.0");
        g.save().unwrap();
        for _ in 0..2 {
            let mut g = BootGuard::open(&p).unwrap();
            assert_eq!(g.on_start("1.1.0"), BootDecision::Normal);
            g.save().unwrap(); // se cuelga antes de mark_healthy
        }
        let mut g = BootGuard::open(&p).unwrap();
        assert_eq!(g.on_start("1.1.0"), BootDecision::Rollback { to_version: "1.0.0".into() });
        g.save().unwrap();
        let mut g = BootGuard::open(&p).unwrap();
        assert!(g.is_skipped("1.1.0"));
        // Ya en la versión anterior: arranque normal y aviso una sola vez.
        assert_eq!(g.on_start("1.0.0"), BootDecision::Normal);
        assert_eq!(g.take_rollback_notice().as_deref(), Some("1.1.0"));
        assert_eq!(g.take_rollback_notice(), None);
    }

    #[test]
    fn unrelated_versions_and_corrupt_files_never_trigger_a_rollback() {
        let (_d, p) = guard();
        std::fs::create_dir_all(p.parent().unwrap()).unwrap();
        std::fs::write(&p, "{ not json").unwrap();
        let mut g = BootGuard::open(&p).unwrap();
        for _ in 0..5 {
            assert_eq!(g.on_start("2.0.0"), BootDecision::Normal);
        }
        g.record_update("2.0.0", "2.1.0");
        assert_eq!(g.on_start("2.0.0"), BootDecision::Normal); // la instalación no llegó a ocurrir
    }
}

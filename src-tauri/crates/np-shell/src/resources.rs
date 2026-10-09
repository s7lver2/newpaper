//! Aviso de consumo excesivo de recursos (B2). Este módulo es el contrato y la lógica pura:
//! umbrales, histéresis y pospuesto. La medida (memoria de la app y de sus procesos WebView2) y el
//! evento a la UI están en `host`/`np-app`; el móvil (plan 08) reutiliza esta lógica con su propia medida.
use std::time::{Duration, Instant};

use serde::Serialize;

pub const MIB: u64 = 1024 * 1024;

/// Pospuesto por defecto al pulsar "Ahora no".
pub const DEFAULT_SNOOZE: Duration = Duration::from_secs(15 * 60);
/// Frecuencia de la medida.
pub const SAMPLE_EVERY: Duration = Duration::from_secs(15);

/// Límite en MiB a partir del cual se avisa. `configured` (ajuste `resources.limitMb`; 0 = automático).
/// Automático: la mitad de la RAM física, entre 2 y 8 GiB.
pub fn limit_mib(configured: u64, total_physical: u64) -> u64 {
    if configured > 0 {
        return configured.max(256);
    }
    let half = total_physical / 2 / MIB;
    half.clamp(2048, 8192)
}

/// Histéresis: tras avisar no se vuelve a avisar hasta bajar del 85 % del límite y volver a subir.
pub fn clear_mib(limit: u64) -> u64 {
    limit / 100 * 85
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Event {
    /// Se cruzó el límite: avisar.
    Warn,
    /// Volvió por debajo de la histéresis: se puede cerrar el aviso abierto.
    Clear,
}

#[derive(Debug, Default)]
pub struct Monitor {
    warned: bool,
    snoozed_until: Option<Instant>,
}

impl Monitor {
    pub fn new() -> Self {
        Self::default()
    }

    /// "Ahora no": no se avisa hasta pasado `for_`.
    pub fn snooze(&mut self, now: Instant, for_: Duration) {
        self.snoozed_until = Some(now + for_);
    }

    /// Evalúa una medida (`used_mib`) contra el límite. `enabled` es el ajuste de avisos.
    pub fn evaluate(&mut self, used_mib: u64, limit_mib: u64, enabled: bool, now: Instant) -> Option<Event> {
        if !enabled {
            let was = std::mem::take(&mut self.warned);
            return was.then_some(Event::Clear);
        }
        if self.warned {
            if used_mib <= clear_mib(limit_mib) {
                self.warned = false;
                return Some(Event::Clear);
            }
            return None;
        }
        if used_mib >= limit_mib {
            if self.snoozed_until.is_some_and(|t| now < t) {
                return None;
            }
            self.warned = true;
            self.snoozed_until = None;
            return Some(Event::Warn);
        }
        None
    }
}

/// Pestaña candidata a cerrar (en segundo plano, no anclada).
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HeavyTab {
    pub tab_id: u64,
    pub title: String,
}

/// Evento `app://resources` hacia la UI (mismo contrato en móvil).
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ResourceEvent {
    /// `warn` abre el aviso; `ok` lo cierra si estaba abierto.
    pub level: &'static str,
    pub used_mib: u64,
    pub limit_mib: u64,
    pub total_mib: u64,
    /// Pestañas en segundo plano que se pueden cerrar (la UI pide confirmación implícita con el botón).
    pub closable: Vec<HeavyTab>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn automatic_limit_is_half_the_ram_between_2_and_8_gib() {
        assert_eq!(limit_mib(0, 4 * 1024 * MIB), 2048);
        assert_eq!(limit_mib(0, 16 * 1024 * MIB), 8192);
        assert_eq!(limit_mib(0, 12 * 1024 * MIB), 6144);
        assert_eq!(limit_mib(3000, 16 * 1024 * MIB), 3000);
        assert_eq!(limit_mib(10, 16 * 1024 * MIB), 256);
    }

    #[test]
    fn warns_once_then_waits_for_hysteresis() {
        let mut m = Monitor::new();
        let t = Instant::now();
        assert_eq!(m.evaluate(900, 1000, true, t), None);
        assert_eq!(m.evaluate(1000, 1000, true, t), Some(Event::Warn));
        assert_eq!(m.evaluate(1200, 1000, true, t), None, "no repeated warnings while above");
        assert_eq!(m.evaluate(900, 1000, true, t), None, "between 85% and 100% stays warned");
        assert_eq!(m.evaluate(850, 1000, true, t), Some(Event::Clear));
        assert_eq!(m.evaluate(1100, 1000, true, t), Some(Event::Warn), "can warn again after clearing");
    }

    #[test]
    fn snooze_suppresses_the_next_warning_until_it_expires() {
        let mut m = Monitor::new();
        let t = Instant::now();
        m.snooze(t, Duration::from_secs(60));
        assert_eq!(m.evaluate(2000, 1000, true, t + Duration::from_secs(30)), None);
        assert_eq!(m.evaluate(2000, 1000, true, t + Duration::from_secs(61)), Some(Event::Warn));
    }

    #[test]
    fn disabling_the_setting_never_warns_and_closes_an_open_warning() {
        let mut m = Monitor::new();
        let t = Instant::now();
        assert_eq!(m.evaluate(5000, 1000, false, t), None);
        assert_eq!(m.evaluate(5000, 1000, true, t), Some(Event::Warn));
        assert_eq!(m.evaluate(5000, 1000, false, t), Some(Event::Clear));
    }

    #[test]
    fn event_serializes_in_camel_case() {
        let e = ResourceEvent { level: "warn", used_mib: 1, limit_mib: 2, total_mib: 3, closable: vec![HeavyTab { tab_id: 4, title: "T".into() }] };
        let v = serde_json::to_value(e).unwrap();
        assert_eq!(v["usedMib"], 1);
        assert_eq!(v["closable"][0]["tabId"], 4);
    }
}

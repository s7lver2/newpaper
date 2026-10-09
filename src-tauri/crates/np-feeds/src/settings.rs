//! Ajustes de np-feeds (clave `feeds.settings` en la tabla `settings` del subproyecto 1).
use np_store::Store;
use serde::{Deserialize, Serialize};

use crate::Result;

pub const SETTINGS_KEY: &str = "feeds.settings";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct FeedsSettings {
    /// Coseno mínimo para unir un artículo a un hecho.
    pub cluster_threshold: f64,
    /// Ventana de agrupación en horas.
    pub window_hours: i64,
    /// Periodo de descarga de feeds en minutos.
    pub fetch_interval_minutes: u64,
    /// Posición ≤ este valor → izquierda.
    pub lean_left_max: f64,
    /// Posición ≥ este valor → derecha.
    pub lean_right_min: f64,
    /// Coberturas por franja (izquierda / centro / derecha).
    pub coverage_per_bucket: usize,
    /// Por debajo de este número de coberturas se lanza la búsqueda de respaldo.
    pub min_coverages: usize,
    /// "brave" | "tavily" | "exa".
    pub search_provider: String,
    /// Dispersión por defecto de las priors cuando solo hay una (puntos 0–100).
    pub prior_default_sd: f64,
    /// Días de análisis propios que cuentan para la línea editorial.
    pub lean_window_days: i64,
}

impl Default for FeedsSettings {
    fn default() -> Self {
        Self {
            cluster_threshold: 0.30,
            window_hours: 72,
            fetch_interval_minutes: 15,
            lean_left_max: 40.0,
            lean_right_min: 60.0,
            coverage_per_bucket: 2,
            min_coverages: 3,
            search_provider: "brave".into(),
            prior_default_sd: 10.0,
            lean_window_days: 90,
        }
    }
}

impl FeedsSettings {
    pub fn load(store: &Store) -> Result<Self> {
        Ok(store.get_setting::<FeedsSettings>(SETTINGS_KEY)?.unwrap_or_default())
    }

    pub fn save(&self, store: &Store) -> Result<()> {
        Ok(store.set_setting(SETTINGS_KEY, self)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_when_missing_and_partial_json_fills_defaults() {
        let s = np_store::Store::open_in_memory().unwrap();
        assert_eq!(FeedsSettings::load(&s).unwrap(), FeedsSettings::default());
        s.set_setting(SETTINGS_KEY, &serde_json::json!({ "clusterThreshold": 0.5 })).unwrap();
        let f = FeedsSettings::load(&s).unwrap();
        assert_eq!(f.cluster_threshold, 0.5);
        assert_eq!(f.window_hours, 72);
    }

    #[test]
    fn save_roundtrip() {
        let s = np_store::Store::open_in_memory().unwrap();
        let f = FeedsSettings { min_coverages: 4, ..Default::default() };
        f.save(&s).unwrap();
        assert_eq!(FeedsSettings::load(&s).unwrap(), f);
    }
}

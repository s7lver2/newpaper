//! Filas sincronizables: diario, exportación y fusión "el último que escribe gana" (§15).
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Scope {
    Settings,
    History,
    Saved,
    Analyses,
    Topics,
    Sources,
    Keys,
}

impl Scope {
    /// Por defecto todo menos las claves de API (no se activan sin pedirlo).
    pub const DEFAULT: &'static [Scope] = &[Scope::Settings, Scope::History, Scope::Saved, Scope::Analyses, Scope::Topics, Scope::Sources];
}

//! Formatos de entrada y salida del léxico.
use serde::{Deserialize, Serialize};

/// Una intervención parlamentaria (una línea del JSONL de entrada).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Speech {
    pub date: String,
    pub speaker: String,
    /// Id del grupo/partido tal como aparece en `config/parties-<locale>.json`.
    pub party: String,
    pub text: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Bloc {
    Left,
    Right,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Party {
    pub id: String,
    pub name: String,
    pub short: String,
    /// Color para el hemiciclo (subproyecto 5).
    pub color: String,
    /// Orden ideológico 0 (izquierda) – 100 (derecha) para colocar los grupos en el hemiciclo.
    pub order: u8,
    /// Bloque del léxico; `null` = excluido del cálculo.
    pub bloc: Option<Bloc>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PartiesFile {
    pub version: u32,
    pub parliament: String,
    pub parties: Vec<Party>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BlocsUsed {
    pub left: Vec<String>,
    pub right: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LexEntry {
    pub phrase: String,
    /// −1 (bloque izquierdo) … +1 (bloque derecho).
    pub weight: f64,
    pub left: u32,
    pub right: u32,
    pub chi2: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Lexicon {
    pub version: u32,
    pub locale: String,
    pub legislature: String,
    pub source: String,
    pub built_at: String,
    /// "ready" | "pending" (sin datos todavía: la señal léxica queda "no disponible").
    pub status: String,
    pub blocs: BlocsUsed,
    pub phrases: Vec<LexEntry>,
}

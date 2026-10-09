//! Diario de Sesiones del Congreso (texto de `pdftotext -layout`) → intervenciones por grupo.
use serde::Deserialize;
use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};

use crate::{schema::Speech, LexError};

#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct Deputy {
    #[serde(rename = "apellidos")]
    pub surnames: String,
    #[serde(rename = "nombre")]
    pub name: String,
    #[serde(rename = "grupo")]
    pub group: String,
}

pub fn load_deputies(json: &str) -> Result<Vec<Deputy>, LexError> {
    Ok(serde_json::from_str(json)?)
}

fn fold_upper(s: &str) -> String {
    s.nfd().filter(|c| !is_combining_mark(*c)).collect::<String>().to_uppercase().split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Encabezado de turno: "El señor APELLIDOS (cargo):" o "La señora APELLIDOS:" al principio de línea.
fn speaker_head(line: &str) -> Option<(String, String)> {
    let rest = line.strip_prefix("El señor ").or_else(|| line.strip_prefix("La señora "))?;
    let colon = rest.find(':')?;
    let head = &rest[..colon];
    let name = head.split(" (").next()?.trim();
    let is_upper = name.chars().filter(|c| c.is_alphabetic()).all(|c| c.is_uppercase()) && name.chars().any(|c| c.is_alphabetic());
    is_upper.then(|| (name.to_string(), rest[colon + 1..].trim().to_string()))
}

const CHAIR: &[&str] = &["PRESIDENTA", "PRESIDENTE", "VICEPRESIDENTA", "VICEPRESIDENTE", "SECRETARIA", "SECRETARIO"];

/// Turnos (encabezado en mayúsculas, texto). Se quitan acotaciones entre paréntesis en línea propia.
pub fn split_turns(text: &str) -> Vec<(String, String)> {
    let mut turns: Vec<(String, String)> = Vec::new();
    for raw in text.lines() {
        let line = raw.trim();
        // Acotaciones en línea propia: "(Aplausos)." / "(Rumores)".
        if line.is_empty() || (line.starts_with('(') && (line.ends_with(')') || line.ends_with(")."))) {
            continue;
        }
        if let Some((who, first)) = speaker_head(line) {
            turns.push((who, first));
        } else if let Some(last) = turns.last_mut() {
            if !last.1.is_empty() {
                last.1.push(' ');
            }
            last.1.push_str(line);
        }
    }
    turns
}

pub fn speeches_from_text(text: &str, date: &str, deputies: &[Deputy]) -> Vec<Speech> {
    let index: Vec<(String, &Deputy)> = deputies.iter().map(|d| (fold_upper(&d.surnames), d)).collect();
    split_turns(text)
        .into_iter()
        .filter(|(who, _)| !CHAIR.contains(&who.as_str()))
        .filter_map(|(who, said)| {
            let key = fold_upper(&who);
            let d = index.iter().find(|(s, _)| *s == key).map(|(_, d)| *d)?;
            Some(Speech { date: date.to_string(), speaker: format!("{} {}", d.name, d.surnames), party: d.group.clone(), text: said })
        })
        .collect()
}

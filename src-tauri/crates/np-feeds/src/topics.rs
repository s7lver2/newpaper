//! Clasificador de tema por palabras clave (`config/topics-<locale>.json`).
use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use crate::{
    text::{normalize, tokenize_lang, Lang},
    FeedsError, Result,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Topics {
    pub version: u32,
    #[serde(rename = "temas")]
    pub topics: Vec<Topic>,
    #[serde(skip, default = "default_lang")]
    pub lang: Lang,
}

fn default_lang() -> Lang {
    Lang::Es
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Topic {
    pub id: String,
    #[serde(rename = "nombre")]
    pub name: String,
    /// Palabras clave; se normalizan al cargar (sin acentos, minúsculas).
    #[serde(rename = "palabras")]
    pub keywords: Vec<String>,
}

impl Topics {
    pub fn from_json(json: &str, lang: Lang) -> Result<Self> {
        let mut t: Topics = serde_json::from_str(json)?;
        if t.version != 1 {
            return Err(FeedsError::Config(format!("unsupported topics version {}", t.version)));
        }
        t.lang = lang;
        for topic in &mut t.topics {
            topic.keywords = topic.keywords.iter().map(|k| normalize(k)).collect();
        }
        Ok(t)
    }

    /// Tema con más coincidencias (mínimo 1). Empate → el primero del fichero.
    pub fn classify(&self, text: &str) -> Option<String> {
        let toks: HashSet<String> = tokenize_lang(text, self.lang).into_iter().collect();
        let mut best: Option<(&Topic, usize)> = None;
        for t in &self.topics {
            let hits = t.keywords.iter().filter(|k| toks.contains(k.as_str())).count();
            if hits > 0 && best.is_none_or(|(_, b)| hits > b) {
                best = Some((t, hits));
            }
        }
        best.map(|(t, _)| t.id.clone())
    }
}

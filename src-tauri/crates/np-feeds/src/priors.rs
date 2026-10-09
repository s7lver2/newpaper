//! `config/outlet-priors.json`: autoubicación de audiencia y clasificaciones externas, con fuente.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::{FeedsError, Result};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct OutletPriors {
    pub version: u32,
    #[serde(rename = "medios")]
    pub outlets: BTreeMap<String, PriorEntry>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
pub struct PriorEntry {
    /// Autoubicación media de los lectores (encuestas públicas).
    #[serde(rename = "audiencia")]
    pub audience: Option<PriorValue>,
    /// Clasificaciones públicas externas.
    #[serde(rename = "externas", default)]
    pub external: Vec<PriorValue>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PriorValue {
    #[serde(rename = "valor")]
    pub value: f64,
    /// Escala original [min, max] donde min = izquierda.
    #[serde(rename = "escala")]
    pub scale: [f64; 2],
    #[serde(rename = "fuente")]
    pub source: String,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(rename = "fecha", default)]
    pub date: Option<String>,
}

impl PriorValue {
    pub fn to_0_100(&self) -> f64 {
        let [min, max] = self.scale;
        ((self.value - min) / (max - min) * 100.0).clamp(0.0, 100.0)
    }

    fn validate(&self, outlet: &str) -> Result<()> {
        let [min, max] = self.scale;
        if min >= max || self.value < min || self.value > max {
            return Err(FeedsError::Config(format!("{outlet}: value {} outside scale {:?}", self.value, self.scale)));
        }
        if self.source.trim().is_empty() {
            return Err(FeedsError::Config(format!("{outlet}: every prior needs a `fuente`")));
        }
        Ok(())
    }
}

impl OutletPriors {
    pub fn empty() -> Self {
        Self { version: 1, outlets: BTreeMap::new() }
    }

    pub fn from_json(json: &str) -> Result<Self> {
        let p: OutletPriors = serde_json::from_str(json)?;
        if p.version != 1 {
            return Err(FeedsError::Config(format!("unsupported priors version {}", p.version)));
        }
        for (id, e) in &p.outlets {
            if let Some(a) = &e.audience {
                a.validate(id)?;
            }
            for x in &e.external {
                x.validate(id)?;
            }
        }
        Ok(p)
    }

    /// (audiencia 0–100, externas 0–100) de un medio.
    pub fn for_outlet(&self, id: &str) -> (Option<f64>, Vec<f64>) {
        match self.outlets.get(id) {
            Some(e) => (e.audience.as_ref().map(PriorValue::to_0_100), e.external.iter().map(PriorValue::to_0_100).collect()),
            None => (None, vec![]),
        }
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_1_10_scale_to_0_100() {
        let v = PriorValue { value: 5.5, scale: [1.0, 10.0], source: "x".into(), url: None, date: None };
        assert!((v.to_0_100() - 50.0).abs() < 1e-9);
    }

    #[test]
    fn rejects_values_without_source_or_outside_scale() {
        assert!(OutletPriors::from_json(r#"{"version":1,"medios":{"a":{"audiencia":{"valor":4,"escala":[1,10],"fuente":" "},"externas":[]}}}"#).is_err());
        assert!(OutletPriors::from_json(r#"{"version":1,"medios":{"a":{"audiencia":{"valor":11,"escala":[1,10],"fuente":"CIS"},"externas":[]}}}"#).is_err());
    }

    #[test]
    fn null_priors_are_allowed() {
        let p = OutletPriors::from_json(r#"{"version":1,"medios":{"a":{"audiencia":null,"externas":[]}}}"#).unwrap();
        assert_eq!(p.for_outlet("a"), (None, vec![]));
        assert_eq!(p.for_outlet("unknown"), (None, vec![]));
    }
}

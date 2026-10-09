//! Señal léxica de un texto (independiente del LLM), con fragmentos citables.
use std::collections::HashMap;

use serde::Serialize;

use crate::{
    ngrams::{grams, Lang},
    schema::Lexicon,
};

pub const MIN_MATCHES: usize = 3;
const MAX_MATCHES: usize = 60;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LexStatus {
    Ok,
    Insufficient,
    Unavailable,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LexMatch {
    pub phrase: String,
    pub weight: f64,
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LexiconScore {
    pub status: LexStatus,
    pub value: Option<f64>,
    pub confidence: f64,
    pub matches: Vec<LexMatch>,
}

pub fn score_text(text: &str, lex: &Lexicon) -> LexiconScore {
    if lex.phrases.is_empty() {
        return LexiconScore { status: LexStatus::Unavailable, value: None, confidence: 0.0, matches: vec![] };
    }
    let weights: HashMap<&str, f64> = lex.phrases.iter().map(|p| (p.phrase.as_str(), p.weight)).collect();
    let mut matches: Vec<LexMatch> = Vec::new();
    let mut covered_until = 0usize;
    for g in grams(text, Lang::from_code(&lex.locale), 2, 3) {
        if g.start < covered_until {
            continue; // no contar dos veces un mismo tramo (bigrama dentro de un trigrama ya contado)
        }
        if let Some(w) = weights.get(g.key.as_str()) {
            covered_until = g.end;
            matches.push(LexMatch { phrase: g.key, weight: *w, start: g.start, end: g.end });
        }
    }
    let n = matches.len();
    let confidence = n as f64 / (n as f64 + 10.0);
    matches.truncate(MAX_MATCHES);
    if n < MIN_MATCHES {
        return LexiconScore { status: LexStatus::Insufficient, value: None, confidence, matches };
    }
    let mean = matches.iter().map(|m| m.weight).sum::<f64>() / matches.len() as f64;
    LexiconScore { status: LexStatus::Ok, value: Some((50.0 + 50.0 * mean).clamp(0.0, 100.0)), confidence, matches }
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::schema::{BlocsUsed, LexEntry, Lexicon};

    fn lex(phrases: &[(&str, f64)]) -> Lexicon {
        Lexicon {
            version: 1, locale: "es".into(), legislature: "XV".into(), source: "test".into(), built_at: "2026-10-06".into(),
            status: "ready".into(), blocs: BlocsUsed { left: vec![], right: vec![] },
            phrases: phrases.iter().map(|(p, w)| LexEntry { phrase: p.to_string(), weight: *w, left: 1, right: 1, chi2: 1.0 }).collect(),
        }
    }

    #[test]
    fn scores_left_leaning_text_below_fifty_with_quotable_evidence() {
        let l = lex(&[("justicia social", -1.0), ("derechos laborales", -0.6), ("libertad economica", 1.0)]);
        let text = "La justicia social avanza. Más justicia social y derechos laborales.";
        let s = score_text(text, &l);
        assert_eq!(s.status, LexStatus::Ok);
        assert!(s.value.unwrap() < 50.0);
        assert_eq!(s.matches.len(), 3);
        assert_eq!(&text[s.matches[0].start..s.matches[0].end], "justicia social");
        assert!((s.confidence - 3.0 / 13.0).abs() < 1e-9);
    }

    #[test]
    fn mirror_text_scores_symmetrically() {
        let l = lex(&[("justicia social", -1.0), ("libertad economica", 1.0)]);
        let a = score_text("justicia social, justicia social, justicia social", &l).value.unwrap();
        let b = score_text("libertad económica, libertad económica, libertad económica", &l).value.unwrap();
        assert!((a - 0.0).abs() < 1e-9 && (b - 100.0).abs() < 1e-9);
        assert!(((50.0 - a) - (b - 50.0)).abs() < 1e-9);
    }

    #[test]
    fn few_matches_are_not_determinable_and_empty_lexicons_unavailable() {
        let l = lex(&[("justicia social", -1.0)]);
        let s = score_text("Una nota breve de agencia sobre la justicia social.", &l);
        assert_eq!(s.status, LexStatus::Insufficient);
        assert_eq!(s.value, None);
        assert_eq!(s.matches.len(), 1);
        assert_eq!(score_text("lo que sea", &lex(&[])).status, LexStatus::Unavailable);
    }
}

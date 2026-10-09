//! Medida de "slant" tipo Gentzkow–Shapiro (2010) entre dos bloques parlamentarios.
use std::collections::HashMap;

use crate::{
    ngrams::{grams, Lang},
    schema::{Bloc, LexEntry, PartiesFile, Speech},
};

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Counts {
    pub left: HashMap<String, u32>,
    pub right: HashMap<String, u32>,
    pub total_left: u64,
    pub total_right: u64,
}

pub fn count(speeches: &[Speech], parties: &PartiesFile, lang: Lang) -> Counts {
    let bloc_of: HashMap<&str, Bloc> = parties.parties.iter().filter_map(|p| p.bloc.map(|b| (p.id.as_str(), b))).collect();
    let mut c = Counts::default();
    for s in speeches {
        let Some(bloc) = bloc_of.get(s.party.as_str()) else { continue };
        for g in grams(&s.text, lang, 2, 3) {
            match bloc {
                Bloc::Left => {
                    *c.left.entry(g.key).or_default() += 1;
                    c.total_left += 1;
                }
                Bloc::Right => {
                    *c.right.entry(g.key).or_default() += 1;
                    c.total_right += 1;
                }
            }
        }
    }
    c
}

/// Umbral de significación (p < 0,05 con 1 grado de libertad).
pub const MIN_CHI2: f64 = 3.84;

/// χ² de Pearson (tabla 2×2 frase/resto × bloque), como en Gentzkow–Shapiro (2010).
pub fn chi2(fl: u64, fr: u64, tl: u64, tr: u64) -> f64 {
    let (fl, fr) = (fl as f64, fr as f64);
    let (nl, nr) = (tl as f64 - fl, tr as f64 - fr);
    let den = (fr + fl) * (fr + nr) * (fl + nl) * (nr + nl);
    if den == 0.0 {
        return 0.0;
    }
    (tl + tr) as f64 * (fr * nl - fl * nr).powi(2) / den
}

pub fn build(c: &Counts, min_count: u32, top_k: usize) -> Vec<LexEntry> {
    let mut phrases: Vec<&String> = c.left.keys().chain(c.right.keys()).collect();
    phrases.sort();
    phrases.dedup();
    let mut stats: Vec<(String, u32, u32, f64, f64)> = phrases
        .into_iter()
        .filter_map(|p| {
            let l = *c.left.get(p).unwrap_or(&0);
            let r = *c.right.get(p).unwrap_or(&0);
            if l + r < min_count {
                return None;
            }
            let x = chi2(l as u64, r as u64, c.total_left, c.total_right);
            let lo = ((r as f64 + 0.5) / (c.total_right as f64 - r as f64 + 0.5)).ln()
                - ((l as f64 + 0.5) / (c.total_left as f64 - l as f64 + 0.5)).ln();
            (x >= MIN_CHI2).then(|| (p.clone(), l, r, x, lo))
        })
        .collect();
    stats.sort_by(|a, b| b.3.total_cmp(&a.3).then_with(|| a.0.cmp(&b.0)));
    stats.truncate(top_k);
    let max = stats.iter().map(|s| s.4.abs()).fold(0.0, f64::max);
    stats
        .into_iter()
        .filter(|s| s.4.abs() > 1e-12)
        .map(|(phrase, l, r, x, lo)| LexEntry { phrase, weight: if max > 0.0 { lo / max } else { 0.0 }, left: l, right: r, chi2: x })
        .collect()
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chi2_is_zero_for_proportional_use_and_positive_otherwise() {
        assert_eq!(chi2(10, 10, 100, 100), 0.0);
        assert!(chi2(30, 2, 100, 100) > 20.0);
        assert_eq!(chi2(0, 0, 100, 100), 0.0);
    }
}

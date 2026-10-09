//! TF-IDF disperso con normalización L2 y coseno.
use std::collections::{HashMap, HashSet};

pub type SparseVec = HashMap<String, f64>;

/// idf(t) = ln((1 + N) / (1 + df(t))) + 1 (suavizado, siempre > 0).
pub fn idf(docs: &[Vec<String>]) -> HashMap<String, f64> {
    let n = docs.len() as f64;
    let mut df: HashMap<String, f64> = HashMap::new();
    for d in docs {
        let uniq: HashSet<&String> = d.iter().collect();
        for t in uniq {
            *df.entry(t.clone()).or_insert(0.0) += 1.0;
        }
    }
    df.into_iter().map(|(t, f)| (t, ((1.0 + n) / (1.0 + f)).ln() + 1.0)).collect()
}

/// Vector tf·idf normalizado (L2). Los términos sin idf se ignoran.
pub fn vectorize(tokens: &[String], idf: &HashMap<String, f64>) -> SparseVec {
    let mut v: SparseVec = HashMap::new();
    for t in tokens {
        if let Some(w) = idf.get(t) {
            *v.entry(t.clone()).or_insert(0.0) += w;
        }
    }
    let norm = v.values().map(|x| x * x).sum::<f64>().sqrt();
    if norm > 0.0 {
        for x in v.values_mut() {
            *x /= norm;
        }
    }
    v
}

/// Coseno entre vectores ya normalizados (= producto escalar).
pub fn cosine(a: &SparseVec, b: &SparseVec) -> f64 {
    let (small, big) = if a.len() <= b.len() { (a, b) } else { (b, a) };
    small.iter().map(|(t, x)| x * big.get(t).copied().unwrap_or(0.0)).sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn toks(s: &str) -> Vec<String> {
        s.split(' ').map(str::to_string).collect()
    }

    #[test]
    fn identical_docs_have_cosine_one() {
        let docs = vec![toks("salario minimo sube"), toks("incendio valencia")];
        let idf = idf(&docs);
        let a = vectorize(&docs[0], &idf);
        assert!((cosine(&a, &a) - 1.0).abs() < 1e-9);
    }

    #[test]
    fn disjoint_docs_have_cosine_zero() {
        let docs = vec![toks("salario minimo sube"), toks("incendio valencia")];
        let idf = idf(&docs);
        assert_eq!(cosine(&vectorize(&docs[0], &idf), &vectorize(&docs[1], &idf)), 0.0);
    }

    #[test]
    fn rare_terms_weigh_more() {
        let docs = vec![toks("gobierno smi"), toks("gobierno incendio"), toks("gobierno liga")];
        let idf = idf(&docs);
        assert!(idf["smi"] > idf["gobierno"]);
    }
}

//! Agrupación incremental de artículos en hechos (TF-IDF + coseno, enlace simple).
use crate::tfidf::{cosine, idf, vectorize};

#[derive(Debug, Clone)]
pub struct ClusterDoc {
    pub article_id: i64,
    pub published_at: i64,
    pub tokens: Vec<String>,
    /// Hecho al que ya pertenece (si lo hay).
    pub event_id: Option<i64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum EventRef {
    Existing(i64),
    /// Hecho nuevo creado en esta pasada; el índice agrupa artículos del mismo hecho nuevo.
    New(usize),
}

#[derive(Debug, Clone, PartialEq)]
pub struct Assignment {
    pub article_id: i64,
    pub event: EventRef,
    pub similarity: f64,
}

/// Asigna cada documento sin hecho al hecho del documento más parecido (si coseno ≥ umbral);
/// si no, crea un hecho nuevo. Orden determinista: (published_at, article_id).
/// El IDF se calcula sobre todos los documentos de la ventana.
pub fn assign(docs: &[ClusterDoc], threshold: f64) -> Vec<Assignment> {
    let all_tokens: Vec<Vec<String>> = docs.iter().map(|d| d.tokens.clone()).collect();
    let idf = idf(&all_tokens);
    let vecs: Vec<_> = docs.iter().map(|d| vectorize(&d.tokens, &idf)).collect();

    let mut current: Vec<Option<EventRef>> = docs.iter().map(|d| d.event_id.map(EventRef::Existing)).collect();
    let mut order: Vec<usize> = (0..docs.len()).filter(|&i| docs[i].event_id.is_none()).collect();
    order.sort_by_key(|&i| (docs[i].published_at, docs[i].article_id));

    let mut next_new = 0usize;
    let mut out = Vec::new();
    for i in order {
        let mut best: Option<(usize, f64)> = None;
        for j in 0..docs.len() {
            if j == i || current[j].is_none() {
                continue;
            }
            let s = cosine(&vecs[i], &vecs[j]);
            if s >= threshold && best.is_none_or(|(_, bs)| s > bs) {
                best = Some((j, s));
            }
        }
        let (ev, sim) = match best {
            Some((j, s)) => (current[j].expect("assigned"), s),
            None => {
                let e = EventRef::New(next_new);
                next_new += 1;
                (e, 1.0)
            }
        };
        current[i] = Some(ev);
        out.push(Assignment { article_id: docs[i].article_id, event: ev, similarity: sim });
    }
    out
}

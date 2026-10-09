//! Diff por palabras con LCS (programación dinámica).
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum OpKind {
    Eq,
    Ins,
    Del,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DiffOp {
    pub kind: OpKind,
    pub text: String,
}

const MAX_CELLS: usize = 4_000_000;

/// Pares (i, j) de la subsecuencia común más larga.
pub fn lcs_pairs<T: PartialEq>(a: &[T], b: &[T]) -> Vec<(usize, usize)> {
    let (n, m) = (a.len(), b.len());
    if n == 0 || m == 0 {
        return vec![];
    }
    let mut dp = vec![0u32; (n + 1) * (m + 1)];
    let at = |i: usize, j: usize| i * (m + 1) + j;
    for i in (0..n).rev() {
        for j in (0..m).rev() {
            dp[at(i, j)] = if a[i] == b[j] { dp[at(i + 1, j + 1)] + 1 } else { dp[at(i + 1, j)].max(dp[at(i, j + 1)]) };
        }
    }
    let (mut i, mut j, mut out) = (0, 0, Vec::new());
    while i < n && j < m {
        if a[i] == b[j] {
            out.push((i, j));
            i += 1;
            j += 1;
        } else if dp[at(i + 1, j)] >= dp[at(i, j + 1)] {
            i += 1;
        } else {
            j += 1;
        }
    }
    out
}

fn push(ops: &mut Vec<DiffOp>, kind: OpKind, word: &str) {
    match ops.last_mut() {
        Some(last) if last.kind == kind => {
            last.text.push(' ');
            last.text.push_str(word);
        }
        _ => ops.push(DiffOp { kind, text: word.to_string() }),
    }
}

/// Diff por palabras. Si el par es enorme, compara por frases para acotar memoria.
pub fn word_diff(a: &str, b: &str) -> Vec<DiffOp> {
    let split = |s: &str| -> Vec<String> {
        let words: Vec<String> = s.split_whitespace().map(str::to_string).collect();
        words
    };
    let (wa, wb) = (split(a), split(b));
    let (wa, wb) = if wa.len() * wb.len() > MAX_CELLS {
        let sentences = |s: &str| s.split_inclusive(['.', '!', '?']).map(|x| x.trim().to_string()).filter(|x| !x.is_empty()).collect::<Vec<_>>();
        (sentences(a), sentences(b))
    } else {
        (wa, wb)
    };
    let pairs = lcs_pairs(&wa, &wb);
    let mut ops = Vec::new();
    let (mut i, mut j) = (0, 0);
    for (pi, pj) in pairs.into_iter().chain(std::iter::once((wa.len(), wb.len()))) {
        while i < pi {
            push(&mut ops, OpKind::Del, &wa[i]);
            i += 1;
        }
        while j < pj {
            push(&mut ops, OpKind::Ins, &wb[j]);
            j += 1;
        }
        if pi < wa.len() && pj < wb.len() {
            push(&mut ops, OpKind::Eq, &wa[pi]);
            i += 1;
            j += 1;
        }
    }
    ops
}


#[cfg(test)]
mod tests {
    use super::*;

    fn render(ops: &[DiffOp]) -> String {
        ops.iter()
            .map(|o| match o.kind {
                OpKind::Eq => o.text.clone(),
                OpKind::Ins => format!("[+{}]", o.text),
                OpKind::Del => format!("[-{}]", o.text),
            })
            .collect::<Vec<_>>()
            .join(" ")
    }

    #[test]
    fn marks_inserted_and_deleted_words() {
        let ops = word_diff("beneficiará a 2,5 millones de trabajadores", "beneficiará a 2,1 millones de trabajadores");
        assert_eq!(render(&ops), "beneficiará a [-2,5] [+2,1] millones de trabajadores");
    }

    #[test]
    fn merges_consecutive_ops_and_handles_empty_sides() {
        assert_eq!(render(&word_diff("", "hola mundo")), "[+hola mundo]");
        assert_eq!(render(&word_diff("a b c", "a x y c")), "a [-b] [+x y] c");
    }

    #[test]
    fn lcs_pairs_align_equal_items() {
        let a: Vec<String> = ["p1", "p2", "p3"].iter().map(|s| s.to_string()).collect();
        let b: Vec<String> = ["p1", "nuevo", "p3"].iter().map(|s| s.to_string()).collect();
        assert_eq!(lcs_pairs(&a, &b), vec![(0, 0), (2, 2)]);
    }
}

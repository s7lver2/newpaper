//! Ediciones entre capturas: titular, dato, párrafo añadido/eliminado, texto; "sin aviso".
use np_feeds::text::normalize;
pub use np_feeds::text::Lang;
use serde::{Deserialize, Serialize};

use crate::diff::{lcs_pairs, word_diff, DiffOp};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureText {
    pub headline: String,
    pub paragraphs: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureInput {
    pub timestamp: String,
    pub digest: String,
    pub text: CaptureText,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EditKind {
    Titular,
    Dato,
    ParrafoAnadido,
    ParrafoEliminado,
    Texto,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureEdit {
    /// Índice de la captura donde aparece el cambio (respecto a la anterior).
    pub capture_index: usize,
    pub kind: EditKind,
    pub before: Option<String>,
    pub after: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WaybackHistory {
    pub url: String,
    pub captures: Vec<CaptureInput>,
    pub edits: Vec<CaptureEdit>,
    /// Número de capturas con al menos un cambio ("Editada N veces").
    pub edited_captures: usize,
    /// Hay cambios y la última versión no incluye ningún aviso de corrección.
    pub silent: bool,
    pub notice: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParagraphDiff {
    pub kind: EditKind,
    pub ops: Vec<DiffOp>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextDiff {
    pub headline: Vec<DiffOp>,
    pub paragraphs: Vec<ParagraphDiff>,
}

pub fn notices(lang: Lang) -> &'static [&'static str] {
    match lang {
        Lang::Es => &["rectificacion", "actualizacion", "fe de erratas", "correccion"],
        Lang::En => &["correction", "update", "clarification", "amended"],
        Lang::De => &["korrektur", "aktualisierung", "richtigstellung", "berichtigung"],
    }
}

fn digits(s: &str) -> Vec<String> {
    normalize(s).split(' ').filter(|w| w.chars().any(|c| c.is_ascii_digit())).map(str::to_string).collect()
}

fn similarity(a: &str, b: &str) -> f64 {
    let wa: Vec<&str> = a.split_whitespace().collect();
    let wb: Vec<&str> = b.split_whitespace().collect();
    let common = lcs_pairs(&wa, &wb).len() as f64;
    let longest = wa.len().max(wb.len()).max(1) as f64;
    common / longest
}

/// Empareja párrafos: iguales por LCS; entre huecos, modificados si se parecen (≥ 0,5); el resto, añadidos/eliminados.
/// Devuelve los cambios en orden de documento.
fn paragraph_edits(prev: &[String], next: &[String]) -> Vec<(EditKind, Option<String>, Option<String>)> {
    let norm = |v: &[String]| v.iter().map(|p| normalize(p)).collect::<Vec<_>>();
    let pairs = lcs_pairs(&norm(prev), &norm(next));
    let mut out = Vec::new();
    let (mut i, mut j) = (0, 0);
    for (pi, pj) in pairs.into_iter().chain(std::iter::once((prev.len(), next.len()))) {
        let removed: Vec<&String> = prev[i..pi].iter().collect();
        let added: Vec<&String> = next[j..pj].iter().collect();
        let mut used = vec![false; added.len()];
        for r in &removed {
            let best = added.iter().enumerate().filter(|(k, _)| !used[*k]).map(|(k, a)| (k, similarity(r, a))).filter(|(_, s)| *s >= 0.5).max_by(|x, y| x.1.total_cmp(&y.1));
            match best {
                Some((k, _)) => {
                    used[k] = true;
                    let kind = if digits(r) != digits(added[k]) { EditKind::Dato } else { EditKind::Texto };
                    out.push((kind, Some((*r).clone()), Some(added[k].clone())));
                }
                None => out.push((EditKind::ParrafoEliminado, Some((*r).clone()), None)),
            }
        }
        for (k, a) in added.iter().enumerate() {
            if !used[k] {
                out.push((EditKind::ParrafoAnadido, None, Some((*a).clone())));
            }
        }
        i = pi + 1;
        j = pj + 1;
    }
    out
}

pub fn analyze(url: &str, mut captures: Vec<CaptureInput>, lang: Lang) -> WaybackHistory {
    captures.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
    let mut edits = Vec::new();
    for idx in 1..captures.len() {
        let (prev, next) = (&captures[idx - 1].text, &captures[idx].text);
        if normalize(&prev.headline) != normalize(&next.headline) {
            edits.push(CaptureEdit { capture_index: idx, kind: EditKind::Titular, before: Some(prev.headline.clone()), after: Some(next.headline.clone()) });
        }
        for (kind, before, after) in paragraph_edits(&prev.paragraphs, &next.paragraphs) {
            edits.push(CaptureEdit { capture_index: idx, kind, before, after });
        }
    }
    let mut edited: Vec<usize> = edits.iter().map(|e| e.capture_index).collect();
    edited.dedup();
    let last_text = captures.last().map(|c| normalize(&format!("{} {}", c.text.headline, c.text.paragraphs.join(" ")))).unwrap_or_default();
    let notice = notices(lang).iter().find(|n| last_text.contains(*n)).map(|n| n.to_string());
    WaybackHistory { url: url.to_string(), silent: !edits.is_empty() && notice.is_none(), edited_captures: edited.len(), edits, captures, notice }
}

pub fn diff_texts(a: &CaptureText, b: &CaptureText) -> TextDiff {
    let mut paragraphs = Vec::new();
    for (kind, before, after) in paragraph_edits(&a.paragraphs, &b.paragraphs) {
        paragraphs.push(ParagraphDiff { kind, ops: word_diff(before.as_deref().unwrap_or(""), after.as_deref().unwrap_or("")) });
    }
    TextDiff { headline: word_diff(&a.headline, &b.headline), paragraphs }
}


#[cfg(test)]
mod tests {
    use super::*;

    fn cap(ts: &str, headline: &str, ps: &[&str]) -> CaptureInput {
        CaptureInput { timestamp: ts.into(), digest: ts.into(), text: CaptureText { headline: headline.into(), paragraphs: ps.iter().map(|s| s.to_string()).collect() } }
    }

    #[test]
    fn classifies_headline_data_and_paragraph_edits() {
        let h = analyze(
            "https://a.test/x",
            vec![
                cap("1", "El SMI beneficiará a 2,5 millones", &["La subida alcanza a 2,5 millones de trabajadores.", "La patronal la rechaza."]),
                cap("2", "El SMI beneficiará a 2,1 millones", &["La subida alcanza a 2,1 millones de trabajadores.", "La patronal la rechaza."]),
                cap("3", "El SMI beneficiará a 2,1 millones", &["La subida alcanza a 2,1 millones de trabajadores.", "La patronal la rechaza.", "Los sindicatos la celebran."]),
                cap("4", "El SMI beneficiará a 2,1 millones", &["La subida alcanza a 2,1 millones de trabajadores.", "Los sindicatos la celebran con matices."]),
            ],
            Lang::Es,
        );
        let kinds: Vec<(usize, EditKind)> = h.edits.iter().map(|e| (e.capture_index, e.kind)).collect();
        assert_eq!(
            kinds,
            vec![(1, EditKind::Titular), (1, EditKind::Dato), (2, EditKind::ParrafoAnadido), (3, EditKind::ParrafoEliminado), (3, EditKind::Texto)]
        );
        assert_eq!(h.edited_captures, 3);
        assert!(h.silent);
        assert_eq!(h.notice, None);
    }

    #[test]
    fn a_correction_notice_makes_edits_not_silent_in_any_language() {
        let h = analyze("u", vec![cap("1", "A", &["x 1"]), cap("2", "A", &["x 2", "Fe de erratas: la cifra era 2."])], Lang::Es);
        assert!(!h.silent);
        assert_eq!(h.notice.as_deref(), Some("fe de erratas"));
        let en = analyze("u", vec![cap("1", "A", &["x 1"]), cap("2", "A", &["x 2", "Correction: an earlier version said 1."])], Lang::En);
        assert!(!en.silent);
    }

    #[test]
    fn unchanged_text_has_no_edits_and_is_not_silent() {
        let h = analyze("u", vec![cap("1", "A", &["x"]), cap("2", "A", &["x"])], Lang::Es);
        assert!(h.edits.is_empty());
        assert!(!h.silent);
    }

    #[test]
    fn text_diff_marks_changed_paragraphs() {
        let a = CaptureText { headline: "A".into(), paragraphs: vec!["uno dos".into(), "tres".into()] };
        let b = CaptureText { headline: "A".into(), paragraphs: vec!["uno cuatro".into()] };
        let d = diff_texts(&a, &b);
        assert_eq!(d.paragraphs.len(), 2);
        assert_eq!(d.paragraphs[0].kind, EditKind::Texto);
        assert_eq!(d.paragraphs[1].kind, EditKind::ParrafoEliminado);
    }
}

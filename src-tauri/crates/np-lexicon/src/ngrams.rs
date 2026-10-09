//! Bigramas y trigramas de palabras (sin stopwords) con posición en el texto original.
pub use np_feeds::text::Lang;
use np_feeds::text::tokens_with_offsets;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Gram {
    pub key: String,
    pub start: usize,
    pub end: usize,
}

pub fn grams(text: &str, lang: Lang, n_min: usize, n_max: usize) -> Vec<Gram> {
    let toks = tokens_with_offsets(text, lang, false);
    let mut out = Vec::new();
    for i in 0..toks.len() {
        for n in n_min..=n_max {
            if i + n > toks.len() {
                break;
            }
            let window = &toks[i..i + n];
            out.push(Gram {
                key: window.iter().map(|t| t.norm.as_str()).collect::<Vec<_>>().join(" "),
                start: window[0].start,
                end: window[n - 1].end,
            });
        }
    }
    out
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_bigrams_and_trigrams_with_offsets() {
        let s = "La patronal, fiel a su costumbre, amenaza";
        let g = grams(s, Lang::Es, 2, 3);
        let keys: Vec<&str> = g.iter().map(|x| x.key.as_str()).collect();
        assert_eq!(keys, vec!["patronal fiel", "patronal fiel costumbre", "fiel costumbre", "fiel costumbre amenaza", "costumbre amenaza"]);
        assert_eq!(&s[g[1].start..g[1].end], "patronal, fiel a su costumbre");
    }
}

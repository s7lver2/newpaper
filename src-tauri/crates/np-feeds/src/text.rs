//! Normalización de texto por idioma: minúsculas, sin acentos, sin stopwords.
use std::{collections::HashSet, sync::OnceLock};

use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Lang {
    Es,
    En,
    De,
}

impl Lang {
    pub fn from_code(code: &str) -> Lang {
        match code.get(..2).unwrap_or("").to_ascii_lowercase().as_str() {
            "en" => Lang::En,
            "de" => Lang::De,
            _ => Lang::Es,
        }
    }
}

/// Stopwords ya normalizadas (sin acentos).
const ES: &[&str] = &[
    "a", "al", "algo", "algun", "alguna", "algunas", "alguno", "algunos", "ante", "antes", "aquel", "aquella", "aquellas",
    "aquello", "aquellos", "aqui", "asi", "aun", "aunque", "bajo", "bien", "cada", "casi", "como", "con", "contra", "cual",
    "cuales", "cuando", "cuanto", "de", "del", "desde", "donde", "dos", "durante", "e", "el", "ella", "ellas", "ello", "ellos",
    "en", "entre", "era", "eran", "es", "esa", "esas", "ese", "eso", "esos", "esta", "estaba", "estado", "estan", "estar",
    "estas", "este", "esto", "estos", "fue", "fueron", "ha", "habia", "han", "hasta", "hay", "la", "las", "le", "les", "lo",
    "los", "mas", "me", "mi", "mientras", "mismo", "misma", "mucho", "muy", "nada", "ni", "no", "nos", "nosotros", "o", "otra",
    "otras", "otro", "otros", "para", "pero", "poco", "por", "porque", "pues", "que", "quien", "quienes", "se", "sea", "segun",
    "ser", "si", "sido", "sin", "sobre", "solo", "son", "su", "sus", "tambien", "tan", "tanto", "te", "tiene", "tienen", "todo",
    "todos", "toda", "todas", "tras", "tu", "u", "un", "una", "unas", "uno", "unos", "usted", "va", "van", "y", "ya", "yo",
    "haber", "hace", "hacer", "puede", "pueden", "dice", "dicen", "ademas", "cuya", "cuyo", "sino", "vez", "veces", "hoy", "ayer",
];
const EN: &[&str] = &[
    "a", "about", "after", "all", "also", "an", "and", "any", "are", "as", "at", "be", "been", "before", "but", "by", "can",
    "could", "did", "do", "does", "for", "from", "had", "has", "have", "he", "her", "his", "how", "i", "if", "in", "into",
    "is", "it", "its", "more", "most", "new", "no", "not", "of", "on", "one", "or", "our", "out", "over", "said", "says",
    "she", "so", "some", "than", "that", "the", "their", "them", "then", "there", "these", "they", "this", "to", "up", "us",
    "was", "we", "were", "what", "when", "which", "who", "will", "with", "would", "you", "yesterday", "today",
];
const DE: &[&str] = &[
    "aber", "als", "am", "an", "auch", "auf", "aus", "bei", "bis", "das", "dass", "dem", "den", "der", "des", "die", "doch",
    "durch", "ein", "eine", "einem", "einen", "einer", "eines", "er", "es", "fur", "gegen", "hat", "hatte", "ihr", "im", "in",
    "ist", "jetzt", "kann", "kein", "keine", "mit", "nach", "nicht", "noch", "nur", "oder", "ohne", "sein", "seine", "sich",
    "sie", "sind", "so", "uber", "um", "und", "unter", "vom", "von", "vor", "war", "waren", "was", "wie", "wir", "wird",
    "wurde", "wurden", "zu", "zum", "zur", "heute", "gestern",
];

fn stopwords(lang: Lang) -> &'static HashSet<&'static str> {
    static S_ES: OnceLock<HashSet<&'static str>> = OnceLock::new();
    static S_EN: OnceLock<HashSet<&'static str>> = OnceLock::new();
    static S_DE: OnceLock<HashSet<&'static str>> = OnceLock::new();
    match lang {
        Lang::Es => S_ES.get_or_init(|| ES.iter().copied().collect()),
        Lang::En => S_EN.get_or_init(|| EN.iter().copied().collect()),
        Lang::De => S_DE.get_or_init(|| DE.iter().copied().collect()),
    }
}

fn fold(word: &str) -> String {
    word.to_lowercase().nfd().filter(|c| !is_combining_mark(*c)).collect()
}

/// Minúsculas + sin diacríticos (á→a, ñ→n, ü→u) + todo lo no alfanumérico → espacio.
pub fn normalize(s: &str) -> String {
    let stripped: Vec<char> = fold(s).chars().collect();
    let mut out = String::with_capacity(stripped.len());
    for (i, &c) in stripped.iter().enumerate() {
        let between_digits = i > 0 && i + 1 < stripped.len() && stripped[i - 1].is_ascii_digit() && stripped[i + 1].is_ascii_digit();
        if (c == '.' || c == ',') && between_digits {
            continue; // "1.200" → "1200", "2,5" → "25"
        }
        out.push(if c.is_alphanumeric() { c } else { ' ' });
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn tokenize_lang(s: &str, lang: Lang) -> Vec<String> {
    let sw = stopwords(lang);
    normalize(s).split(' ').filter(|t| t.chars().count() > 1 && !sw.contains(t)).map(str::to_string).collect()
}

pub fn tokenize(s: &str) -> Vec<String> {
    tokenize_lang(s, Lang::Es)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Token {
    pub norm: String,
    /// Offsets en bytes sobre el texto original.
    pub start: usize,
    pub end: usize,
}

/// Palabras (secuencias alfanuméricas, con `.`/`,` entre dígitos) con su posición original.
pub fn tokens_with_offsets(s: &str, lang: Lang, keep_stopwords: bool) -> Vec<Token> {
    let sw = stopwords(lang);
    let chars: Vec<(usize, char)> = s.char_indices().collect();
    let mut out = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        if !chars[i].1.is_alphanumeric() {
            i += 1;
            continue;
        }
        let start = chars[i].0;
        let mut j = i;
        while j < chars.len() {
            let c = chars[j].1;
            let joiner = (c == '.' || c == ',')
                && j > 0
                && chars[j - 1].1.is_ascii_digit()
                && chars.get(j + 1).is_some_and(|n| n.1.is_ascii_digit());
            if c.is_alphanumeric() || joiner {
                j += 1;
            } else {
                break;
            }
        }
        let end = chars.get(j).map_or(s.len(), |c| c.0);
        let norm: String = fold(&s[start..end]).chars().filter(|c| c.is_alphanumeric()).collect();
        if keep_stopwords || (norm.chars().count() > 1 && !sw.contains(norm.as_str())) {
            out.push(Token { norm, start, end });
        }
        i = j;
    }
    out
}

/// Quita etiquetas HTML y decodifica entidades básicas (resúmenes de RSS).
pub fn strip_html(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' if in_tag => {
                in_tag = false;
                out.push(' ');
            }
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    let decoded = out
        .replace("&nbsp;", " ")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&");
    decoded.split_whitespace().collect::<Vec<_>>().join(" ")
}

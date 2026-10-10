//! Ruido estructural que no es ideología: fórmulas de tratamiento y procedimiento parlamentario
//! ("señora ministra", "gracias, presidenta"), nombres propios de los diputados (el Gobierno es
//! de un bloque y la oposición lo interpela por su nombre) y turnos en lenguas cooficiales.
use std::collections::{HashMap, HashSet};

use unicode_normalization::{char::is_combining_mark, UnicodeNormalization};

use crate::schema::LexEntry;

/// Minúsculas y sin tildes, igual que las claves de `ngrams`.
pub fn fold(s: &str) -> String {
    s.nfd().filter(|c| !is_combining_mark(*c)).collect::<String>().to_lowercase()
}

/// Fórmulas de tratamiento y procedimiento (ya plegadas).
pub const PROCEDURAL: &[&str] = &[
    "senor", "senora", "senores", "senoras", "senoria", "senorias", "presidente", "presidenta", "vicepresidente", "vicepresidenta", "ministro", "ministra", "ministros",
    "ministras", "diputado", "diputada", "diputados", "diputadas", "aplausos", "gracias", "grazas", "parlamentario", "parlamentaria", "parlamentarios", "parlamentarias",
    "camara", "escanos", "intervencion", "turno", "puestos", "pie", "rumores", "risas",
];

/// Marcadores de catalán, euskera y gallego que no existen en castellano.
/// Además de estos, `drop_noise` descarta las frases con saludos y fórmulas sueltas en esas lenguas (`NON_SPANISH_EXTRA`).
const NON_SPANISH: &[&str] = &[
    "els", "amb", "aquest", "aquesta", "aquests", "aquestes", "tambe", "perque", "aixo", "molt", "pero", "nostre", "nostra", "dels", "seva", "seus", "gracies", "senyor",
    "senyora", "senyories", "eskerrik", "asko", "euskal", "herria", "dugu", "dira", "eta", "ez", "grazas", "noso", "nosa", "vostede", "vostedes", "tamen", "moi", "tot", "fer",
];

const NON_SPANISH_EXTRA: &[&str] = &[
    "mahaiburu", "andrea", "jaun", "andreok", "arratsalde", "guztioi", "esker", "mila", "besterik", "izan", "moltes", "partit", "millons", "do", "bon", "president", "estat", "per", "ho", "hem", "els", "als", "unha", 
];

/// ¿El turno está (sobre todo) en castellano? Un turno cuenta como cooficial si más del 2,5 % de sus palabras son marcadores.
pub fn looks_spanish(text: &str) -> bool {
    let (mut total, mut marks) = (0u32, 0u32);
    for w in fold(text).split(|c: char| !c.is_alphabetic()).filter(|w| !w.is_empty()) {
        total += 1;
        // "pero" y "tot" también aparecen en castellano en citas; solo cuentan los que no lo son.
        if NON_SPANISH.contains(&w) && w != "pero" && w != "tot" {
            marks += 1;
        }
    }
    total == 0 || (marks as f64 / total as f64) < 0.025
}

/// Quita acotaciones entre paréntesis, también dentro del texto: "(Aplausos de los diputados … puestos en pie)".
pub fn strip_parentheticals(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut depth = 0u32;
    for c in text.chars() {
        match c {
            '(' => depth += 1,
            ')' if depth > 0 => depth -= 1,
            _ if depth == 0 => out.push(c),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Nombres y apellidos de los diputados que se escriben casi siempre con mayúscula en los textos (≥ 90 %, ≥ 3 veces),
/// para no confundirlos con palabras comunes ("moreno", "real", "pastor").
pub fn personal_names<'a>(names: impl Iterator<Item = &'a str>, texts: impl Iterator<Item = &'a str>) -> HashSet<String> {
    let wanted: HashSet<String> = names.flat_map(|n| n.split(|c: char| !c.is_alphabetic()).map(fold).collect::<Vec<_>>()).filter(|w| w.chars().count() >= 4).collect();
    let mut seen: HashMap<String, (u32, u32)> = HashMap::new();
    for t in texts {
        for w in t.split(|c: char| !c.is_alphabetic()).filter(|w| !w.is_empty()) {
            let f = fold(w);
            if wanted.contains(&f) {
                let e = seen.entry(f).or_default();
                if w.chars().next().is_some_and(char::is_uppercase) {
                    e.0 += 1;
                } else {
                    e.1 += 1;
                }
            }
        }
    }
    seen.into_iter().filter(|(_, (cap, low))| *cap >= 3 && *cap as f64 / (*cap + *low) as f64 >= 0.9).map(|(w, _)| w).collect()
}

/// Descarta las frases que contienen algún token vetado.
pub fn drop_noise(entries: Vec<LexEntry>, names: &HashSet<String>) -> Vec<LexEntry> {
    entries.into_iter().filter(|e| !e.phrase.split(' ').any(|t| PROCEDURAL.contains(&t) || NON_SPANISH.contains(&t) || NON_SPANISH_EXTRA.contains(&t) || names.contains(t))).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_inline_stage_directions_and_flags_cooficial_turns() {
        assert_eq!(strip_parentheticals("Gracias (Aplausos de los diputados, puestos en pie). Sigo."), "Gracias . Sigo.");
        assert!(looks_spanish("La libertad económica exige seguridad jurídica y menos impuestos."));
        assert!(!looks_spanish("Moltes gràcies, presidenta. Aquesta llei és molt important per als nostres drets i amb els seus efectes."));
    }

    #[test]
    fn names_are_only_banned_when_nearly_always_capitalised() {
        let texts = ["el señor Sánchez dijo que Sánchez miente. Sánchez.", "un moreno claro, el moreno, el Moreno"];
        let names = personal_names(["Sánchez Pérez", "Moreno"].into_iter(), texts.into_iter());
        assert!(names.contains("sanchez"));
        assert!(!names.contains("moreno"));
    }
}

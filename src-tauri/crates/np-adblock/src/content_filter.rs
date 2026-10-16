//! Las mismas listas de filtros, traducidas al formato de bloqueo de contenido de WebKit (JSON de Safari), para las
//! plataformas sin gancho por petición: WebKitGTK (Linux) no tiene el equivalente a `WebResourceRequested`, así que el
//! bloqueo de red se compila a reglas que el propio motor aplica (`WebKitUserContentFilter`).
//!
//! Diferencias respecto al motor de Windows (`Blocker`): sin `$redirect`/`$removeparam`, sin contador exacto por petición
//! y con el tope de reglas de WebKit; las reglas que no se pueden traducir se descartan.
use adblock::{
    content_blocking::{CbRule, CbType},
    lists::{FilterSet, ParseOptions},
};

use crate::lists::{load_lists, ListCache};

/// WebKit rechaza listas de más de 150 000 reglas; se deja margen.
pub const MAX_RULES: usize = 140_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ContentFilter {
    /// Matriz JSON de reglas (formato `WKContentRuleList`).
    pub json: String,
    /// Reglas incluidas.
    pub rules: usize,
    /// Reglas de bloqueo descartadas por el tope de `max_rules`.
    pub dropped: usize,
}

/// Traduce el texto de varias listas (formato ABP/uBO). `Err` si no se pudo traducir nada o no hay reglas.
///
/// `cosmetic`: incluir también las reglas de ocultación CSS (`css-display-none`). La app las deja fuera: el filtrado
/// cosmético ya lo hace su propio guion (`cosmetic.js`) en todas las plataformas y, con las listas completas, son decenas
/// de miles de reglas que harían pesada la compilación de WebKit (≈15 MB de JSON).
pub fn from_lists<I, S>(lists: I, max_rules: usize, cosmetic: bool) -> Result<ContentFilter, String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    // El modo `debug` conserva el texto original de cada regla, imprescindible para convertir.
    let mut set = FilterSet::new(true);
    for text in lists {
        set.add_filter_list(text.as_ref().to_owned(), ParseOptions::default());
    }
    let (mut rules, _used) = set.into_content_blocking().map_err(|()| "content blocking conversion failed".to_string())?;
    if !cosmetic {
        rules.retain(|r| !matches!(r.action.typ, CbType::CssDisplayNone));
    }
    if rules.is_empty() {
        return Err("the lists produced no content blocking rules".into());
    }
    Ok(limit(rules, max_rules))
}

/// Aplica el tope: las excepciones (`ignore-previous-rules`) siempre se conservan (van al final, y quitarlas
/// bloquearía de más); lo que sobra se recorta de las reglas de bloqueo.
fn limit(rules: Vec<CbRule>, max_rules: usize) -> ContentFilter {
    let (ignore, mut block): (Vec<CbRule>, Vec<CbRule>) = rules.into_iter().partition(|r| matches!(r.action.typ, CbType::IgnorePreviousRules));
    let room = max_rules.saturating_sub(ignore.len());
    let dropped = block.len().saturating_sub(room);
    block.truncate(room);
    block.extend(ignore);
    let json = serde_json::to_string(&block).unwrap_or_else(|_| "[]".into());
    ContentFilter { json, rules: block.len(), dropped }
}

/// Texto de las listas activas (descargadas o embebidas) más reglas extra, traducido a bloqueo de contenido (solo red;
/// el cosmético va por guion). Construcción costosa: llamar desde un hilo bloqueante.
pub fn from_cache(cache: &ListCache, enabled_lists: &[String], extra_rules: Option<&str>) -> Result<ContentFilter, String> {
    let loaded = load_lists(cache, enabled_lists);
    let texts = loaded.iter().map(|l| l.text.as_str()).chain(extra_rules);
    from_lists(texts, MAX_RULES, false)
}

#[cfg(test)]
mod tests {
    use super::*;

    const LIST: &str = "||ads.example.com^\n##.banner-ad\n";

    #[test]
    fn translates_network_and_cosmetic_rules_to_json() {
        let f = from_lists([LIST], MAX_RULES, true).unwrap();
        let v: serde_json::Value = serde_json::from_str(&f.json).unwrap();
        let rules = v.as_array().unwrap();
        assert!(rules.iter().any(|r| r["action"]["type"] == "block" && r["trigger"]["url-filter"].as_str().is_some_and(|u| u.contains("ads"))));
        assert!(rules.iter().any(|r| r["action"]["type"] == "css-display-none" && r["action"]["selector"] == ".banner-ad"));
        assert_eq!(f.dropped, 0);
    }

    #[test]
    fn the_app_variant_keeps_only_network_rules() {
        let f = from_lists([LIST], MAX_RULES, false).unwrap();
        assert!(!f.json.contains("css-display-none"));
        assert!(f.json.contains("\"block\""));
    }

    #[test]
    fn exceptions_are_kept_when_the_cap_trims_blocking_rules() {
        let list: String = (0..50).map(|i| format!("||ad{i}.example.com^\n")).chain(["@@||ad1.example.com^\n".to_string()]).collect();
        let f = from_lists([list], 10, false).unwrap();
        assert!(f.rules <= 10);
        assert!(f.dropped > 0);
        let v: serde_json::Value = serde_json::from_str(&f.json).unwrap();
        assert!(v.as_array().unwrap().iter().any(|r| r["action"]["type"] == "ignore-previous-rules"), "exceptions must survive the cap");
    }

    #[test]
    fn empty_input_is_an_error_not_an_empty_filter() {
        assert!(from_lists(std::iter::empty::<&str>(), MAX_RULES, false).is_err());
    }
}

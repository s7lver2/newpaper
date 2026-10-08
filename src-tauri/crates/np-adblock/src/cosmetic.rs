//! Selectores cosméticos (ocultar banners) a partir del motor.

use std::collections::HashSet;

use serde::Serialize;

use crate::blocker::Blocker;

#[derive(Debug, Default, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CosmeticResources {
    pub hide_selectors: Vec<String>,
    pub exceptions: Vec<String>,
    pub injected_script: String,
    pub generichide: bool,
}

impl Blocker {
    /// Selectores específicos de la URL (y genéricos no de clase/id).
    pub fn cosmetic_for(&self, url: &str) -> CosmeticResources {
        let r = self.engine().url_cosmetic_resources(url);
        let mut hide: Vec<String> = r.hide_selectors.into_iter().collect();
        hide.sort();
        let mut exceptions: Vec<String> = r.exceptions.into_iter().collect();
        exceptions.sort();
        CosmeticResources {
            hide_selectors: hide,
            exceptions,
            injected_script: r.injected_script,
            generichide: r.generichide,
        }
    }

    /// Selectores genéricos `.clase` / `#id` que aplican a las clases e ids vistos en la página.
    pub fn generic_selectors(&self, classes: &[String], ids: &[String], exceptions: &[String]) -> Vec<String> {
        let exc: HashSet<String> = exceptions.iter().cloned().collect();
        let mut out = self.engine().hidden_class_id_selectors(classes, ids, &exc);
        out.sort();
        out
    }
}

/// Una regla por selector: un selector inválido no invalida a los demás.
pub fn css_for_selectors(selectors: &[String]) -> String {
    let mut css = String::new();
    for s in selectors {
        css.push_str(s);
        css.push_str(" { display: none !important; }\n");
    }
    css
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::blocker::Blocker;

    const RULES: &str = "\
example.org##.cookie-banner
##.newsletter-modal
safe.example.com#@#.newsletter-modal
";

    #[test]
    fn hostname_specific_selectors_apply_only_to_that_site() {
        let b = Blocker::from_lists([RULES]);
        assert!(b
            .cosmetic_for("https://example.org/noticia")
            .hide_selectors
            .contains(&".cookie-banner".to_string()));
        assert!(!b
            .cosmetic_for("https://otro.example.net/")
            .hide_selectors
            .contains(&".cookie-banner".to_string()));
    }

    #[test]
    fn generic_class_selectors_are_returned_for_seen_classes() {
        let b = Blocker::from_lists([RULES]);
        let out = b.generic_selectors(
            &["newsletter-modal".to_string(), "articulo".to_string()],
            &[],
            &[],
        );
        assert_eq!(out, vec![".newsletter-modal".to_string()]);
    }

    #[test]
    fn exceptions_suppress_generic_selectors() {
        let b = Blocker::from_lists([RULES]);
        let res = b.cosmetic_for("https://safe.example.com/");
        let out = b.generic_selectors(&["newsletter-modal".to_string()], &[], &res.exceptions);
        assert!(out.is_empty());
    }

    #[test]
    fn css_has_one_rule_per_selector() {
        let css = css_for_selectors(&[".a".to_string(), "#b".to_string()]);
        assert_eq!(
            css,
            ".a { display: none !important; }\n#b { display: none !important; }\n"
        );
        assert_eq!(css_for_selectors(&[]), "");
    }
}

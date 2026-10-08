//! Identificadores de filas sincronizables.
use uuid::Uuid;

/// Espacio de nombres fijo de newpaper para UUID v5 (no cambiar nunca: rompería la sincronización).
const NAMESPACE: Uuid = Uuid::from_u128(0x6e70_6170_6572_4e50_8000_0000_0000_0001);

pub fn stable_id(kind: &str, natural_key: &str) -> String {
    Uuid::new_v5(&NAMESPACE, format!("{kind}:{natural_key}").as_bytes()).to_string()
}

pub fn random_id() -> String {
    Uuid::new_v4().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_ids_depend_only_on_kind_and_key() {
        assert_eq!(stable_id("settings", "appearance.theme"), stable_id("settings", "appearance.theme"));
        assert_ne!(stable_id("settings", "a"), stable_id("saved", "a"));
        assert_eq!(uuid::Uuid::parse_str(&stable_id("x", "y")).unwrap().get_version_num(), 5);
    }

    #[test]
    fn random_ids_are_v4_and_unique() {
        let a = random_id();
        assert_ne!(a, random_id());
        assert_eq!(uuid::Uuid::parse_str(&a).unwrap().get_version_num(), 4);
    }
}

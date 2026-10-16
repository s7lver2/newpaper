//! Bloqueo de red sobre el motor `adblock` (adblock-rust de Brave).

use adblock::{
    lists::{FilterSet, ParseOptions},
    request::Request,
    Engine,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ResourceType {
    Document,
    Subdocument,
    Stylesheet,
    Image,
    Media,
    Font,
    Script,
    Xhr,
    Fetch,
    Websocket,
    Ping,
    Other,
}

impl ResourceType {
    /// Nombre de tipo que entiende `adblock::request::Request::new`.
    pub fn as_adblock_str(self) -> &'static str {
        match self {
            ResourceType::Document => "document",
            ResourceType::Subdocument => "subdocument",
            ResourceType::Stylesheet => "stylesheet",
            ResourceType::Image => "image",
            ResourceType::Media => "media",
            ResourceType::Font => "font",
            ResourceType::Script => "script",
            ResourceType::Xhr | ResourceType::Fetch => "xmlhttprequest",
            ResourceType::Websocket => "websocket",
            ResourceType::Ping => "ping",
            ResourceType::Other => "other",
        }
    }
}

/// Qué es lo que se bloqueó: un anuncio (o molestia) o un rastreador. Solo se usa para los contadores del móvil.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum BlockKind {
    Ad,
    Tracker,
}

pub struct Blocker {
    engine: Engine,
    /// Motor solo con las listas de privacidad (EasyPrivacy, uBO privacy): decide si algo bloqueado cuenta como rastreador.
    /// Es opcional porque cuesta memoria; el escritorio no lo construye.
    trackers: Option<Engine>,
}

fn engine_of<I, S>(lists: I) -> Engine
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut set = FilterSet::new(false);
    for text in lists {
        set.add_filter_list(text.as_ref().to_owned(), ParseOptions::default());
    }
    Engine::new_with_filter_set(set)
}

impl Blocker {
    /// Construye el motor con el texto completo de cada lista (formato ABP/uBO).
    pub fn from_lists<I, S>(lists: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
    {
        Self { engine: engine_of(lists), trackers: None }
    }

    /// Como `from_lists`, más un motor con solo las listas de rastreadores para clasificar lo bloqueado.
    pub fn from_lists_classified<I, S, J, T>(all: I, tracker_lists: J) -> Self
    where
        I: IntoIterator<Item = S>,
        S: AsRef<str>,
        J: IntoIterator<Item = T>,
        T: AsRef<str>,
    {
        Self { engine: engine_of(all), trackers: Some(engine_of(tracker_lists)) }
    }

    pub fn empty() -> Self {
        Self::from_lists(std::iter::empty::<&str>())
    }

    /// `true` si la petición debe recibir un 403 vacío. Nunca bloquea el documento principal.
    pub fn should_block(&self, url: &str, source_url: &str, kind: ResourceType, method: &str) -> bool {
        if kind == ResourceType::Document {
            return false;
        }
        let method = method.to_ascii_lowercase();
        match Request::new(url, source_url, kind.as_adblock_str(), &method) {
            Ok(request) => self.engine.check_network_request(&request).should_block(),
            Err(_) => false,
        }
    }

    /// Clasifica una petición que `should_block` ya bloqueó: rastreador si lo bloquean también las listas de privacidad,
    /// anuncio (o molestia) en cualquier otro caso. Sin motor de rastreadores todo cuenta como anuncio.
    pub fn classify(&self, url: &str, source_url: &str, kind: ResourceType, method: &str) -> BlockKind {
        let Some(trackers) = &self.trackers else { return BlockKind::Ad };
        let method = method.to_ascii_lowercase();
        match Request::new(url, source_url, kind.as_adblock_str(), &method) {
            Ok(request) if trackers.check_network_request(&request).should_block() => BlockKind::Tracker,
            _ => BlockKind::Ad,
        }
    }

    pub(crate) fn engine(&self) -> &Engine {
        &self.engine
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RULES: &str = "\
||ads.example.com^
||tracker.example.net^$third-party
@@||ads.example.com/allowed/
";

    fn blocker() -> Blocker {
        Blocker::from_lists([RULES])
    }

    #[test]
    fn blocks_listed_ad_domain() {
        assert!(blocker().should_block(
            "https://ads.example.com/banner.js",
            "https://news.example.org/",
            ResourceType::Script,
            "GET"
        ));
    }

    #[test]
    fn exception_rule_allows_request() {
        assert!(!blocker().should_block(
            "https://ads.example.com/allowed/pixel.gif",
            "https://news.example.org/",
            ResourceType::Image,
            "GET"
        ));
    }

    #[test]
    fn third_party_rule_only_blocks_cross_site() {
        let b = blocker();
        assert!(!b.should_block(
            "https://tracker.example.net/t.js",
            "https://www.example.net/",
            ResourceType::Script,
            "GET"
        ));
        assert!(b.should_block(
            "https://tracker.example.net/t.js",
            "https://news.example.org/",
            ResourceType::Script,
            "GET"
        ));
    }

    #[test]
    fn never_blocks_main_document() {
        assert!(!blocker().should_block(
            "https://ads.example.com/",
            "",
            ResourceType::Document,
            "GET"
        ));
    }

    #[test]
    fn unrelated_request_is_allowed() {
        assert!(!blocker().should_block(
            "https://cdn.example.org/app.js",
            "https://news.example.org/",
            ResourceType::Script,
            "GET"
        ));
    }

    #[test]
    fn empty_blocker_allows_everything() {
        assert!(!Blocker::empty().should_block(
            "https://ads.example.com/banner.js",
            "https://news.example.org/",
            ResourceType::Script,
            "GET"
        ));
    }

    #[test]
    fn classifies_trackers_apart_from_ads() {
        let b = Blocker::from_lists_classified(["||ads.example.com^
||track.example.net^"], ["||track.example.net^"]);
        let (src, k) = ("https://news.example.org/", ResourceType::Script);
        assert!(b.should_block("https://track.example.net/t.js", src, k, "GET"));
        assert_eq!(b.classify("https://track.example.net/t.js", src, k, "GET"), BlockKind::Tracker);
        assert_eq!(b.classify("https://ads.example.com/a.js", src, k, "GET"), BlockKind::Ad);
        // Sin motor de rastreadores (escritorio) todo es un anuncio.
        assert_eq!(blocker().classify("https://tracker.example.net/t.js", src, k, "GET"), BlockKind::Ad);
    }

    #[test]
    fn blocker_is_send_and_sync() {
        fn assert_send_sync<T: Send + Sync>() {}
        assert_send_sync::<Blocker>();
    }

    #[test]
    fn maps_resource_types_to_adblock_names() {
        assert_eq!(ResourceType::Xhr.as_adblock_str(), "xmlhttprequest");
        assert_eq!(ResourceType::Fetch.as_adblock_str(), "xmlhttprequest");
        assert_eq!(ResourceType::Subdocument.as_adblock_str(), "subdocument");
    }
}

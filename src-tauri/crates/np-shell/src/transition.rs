//! Transición suave entre páginas (A1). La webview nativa se dibuja siempre por encima de la UI, así que
//! no se puede fundir con CSS: se captura la página actual (`CapturePreview`), la UI la muestra, la nueva
//! se precarga fuera de la vista, se captura al primer pintado, la UI funde una imagen con otra y por
//! último se devuelve la webview real a su sitio. Este módulo es solo la lógica: cuándo se hace y la
//! máquina de estados; la captura y la colocación de la webview están en `host`.
use std::time::Duration;

/// Tope de espera al primer pintado de la página nueva; pasado esto se navega "a pelo". Las páginas reales
/// tardan: 1,8 s hacía que casi nunca hubiera fundido (el primer pintado llega a los 2-3 s con una web pesada).
pub const PAINT_TIMEOUT: Duration = Duration::from_millis(6000);
/// Pausa tras el primer pintado antes de capturar (que el compositor tenga el fotograma).
pub const SETTLE: Duration = Duration::from_millis(260);
/// Duración del fundido cruzado en la UI.
pub const FADE: Duration = Duration::from_millis(300);
/// Tope de espera a la captura de la página actual.
pub const CAPTURE_TIMEOUT: Duration = Duration::from_millis(700);

/// Qué se sabe de la pestaña en el momento de navegar.
#[derive(Debug, Clone, Copy, Default)]
pub struct Context {
    pub enabled: bool,
    pub reduced_motion: bool,
    pub active: bool,
    pub has_webview: bool,
    /// La webview ya pintó al menos una vez (si no, no hay nada que fundir).
    pub painted: bool,
    pub original_view: bool,
    pub failed_or_crashed: bool,
    pub already_running: bool,
}

/// ¿Se hace la transición? Pestañas de fondo, vista lector, errores, movimiento reducido o una transición
/// ya en curso: navegación directa.
pub fn should_transition(c: &Context) -> bool {
    c.enabled && !c.reduced_motion && c.active && c.has_webview && c.painted && c.original_view && !c.failed_or_crashed && !c.already_running
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum State {
    Idle,
    /// Capturando la página actual.
    CapturingOld,
    /// Navegando fuera de la vista hasta el primer pintado.
    Loading,
    /// Capturando la página nueva.
    CapturingNew,
    /// La UI funde las dos imágenes.
    Fading,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Event {
    Start,
    OldCaptured,
    /// Primer pintado de la página nueva.
    Painted,
    NewCaptured,
    FadeDone,
    /// Fallo de carga, captura fallida o tiempo agotado: se cancela y se navega directo.
    Abort,
}

/// Transición pura: `None` si el evento no es válido en ese estado.
pub fn next(state: State, event: Event) -> Option<State> {
    use Event::*;
    use State::*;
    match (state, event) {
        (Idle, Start) => Some(CapturingOld),
        (CapturingOld, OldCaptured) => Some(Loading),
        (Loading, Painted) => Some(CapturingNew),
        (CapturingNew, NewCaptured) => Some(Fading),
        (Fading, FadeDone) => Some(Idle),
        (Idle, Abort) => None,
        (_, Abort) => Some(Idle),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ok() -> Context {
        Context { enabled: true, active: true, has_webview: true, painted: true, original_view: true, ..Default::default() }
    }

    #[test]
    fn only_a_foreground_painted_original_tab_transitions() {
        assert!(should_transition(&ok()));
        for off in [
            Context { enabled: false, ..ok() },
            Context { reduced_motion: true, ..ok() },
            Context { active: false, ..ok() },
            Context { has_webview: false, ..ok() },
            Context { painted: false, ..ok() },
            Context { original_view: false, ..ok() },
            Context { failed_or_crashed: true, ..ok() },
            Context { already_running: true, ..ok() },
        ] {
            assert!(!should_transition(&off), "{off:?}");
        }
    }

    #[test]
    fn happy_path_returns_to_idle() {
        let mut s = State::Idle;
        for e in [Event::Start, Event::OldCaptured, Event::Painted, Event::NewCaptured, Event::FadeDone] {
            s = next(s, e).unwrap_or_else(|| panic!("{e:?} not valid in {s:?}"));
        }
        assert_eq!(s, State::Idle);
    }

    #[test]
    fn abort_cancels_from_any_running_state_and_out_of_order_events_are_rejected() {
        for s in [State::CapturingOld, State::Loading, State::CapturingNew, State::Fading] {
            assert_eq!(next(s, Event::Abort), Some(State::Idle));
        }
        assert_eq!(next(State::Idle, Event::Abort), None);
        assert_eq!(next(State::Idle, Event::Painted), None);
        assert_eq!(next(State::Loading, Event::NewCaptured), None);
        assert_eq!(next(State::Fading, Event::Start), None);
    }
}

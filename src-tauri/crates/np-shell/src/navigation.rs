//! Qué hacer con un `NavigationCompleted` de WebView2: no todo `IsSuccess = false` es un fallo que merezca la
//! página de error. Al encadenar navegaciones (atrás, atrás, atrás...) la anterior se cancela y WebView2 avisa de
//! su final con `OPERATION_CANCELED` aunque el servidor ya hubiera respondido 200: eso no es un error.

/// `COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED`.
pub const WEB_ERROR_OPERATION_CANCELED: i32 = 14;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    /// La página cargó.
    Loaded,
    /// La navegación se canceló o la superó otra: no es un fallo y no cambia lo que se ve.
    Superseded,
    /// Fallo real (red, certificado, tiempo agotado, respuesta HTTP de error).
    Failed,
}

/// `nav_id` es la navegación que termina y `latest_started` la última que empezó en la pestaña (0 si no se sabe).
pub fn judge(success: bool, web_error_status: i32, http_status: Option<u16>, nav_id: u64, latest_started: u64) -> Verdict {
    if latest_started != 0 && nav_id != 0 && nav_id < latest_started {
        return Verdict::Superseded;
    }
    if success {
        return if http_status.is_some_and(|s| s >= 400) { Verdict::Failed } else { Verdict::Loaded };
    }
    if web_error_status == WEB_ERROR_OPERATION_CANCELED {
        return Verdict::Superseded;
    }
    // Una respuesta 2xx/3xx recibida no es un error de red ni de certificado: la carga se cortó después.
    if http_status.is_some_and(|s| (200..400).contains(&s)) {
        return Verdict::Superseded;
    }
    Verdict::Failed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn successful_loads_and_http_errors() {
        assert_eq!(judge(true, 0, Some(200), 5, 5), Verdict::Loaded);
        assert_eq!(judge(true, 0, None, 5, 5), Verdict::Loaded);
        assert_eq!(judge(true, 0, Some(404), 5, 5), Verdict::Failed);
        assert_eq!(judge(true, 0, Some(503), 5, 5), Verdict::Failed);
    }

    #[test]
    fn a_navigation_replaced_by_another_is_never_an_error() {
        // Back, back, back: la primera termina cancelada con el 200 del servidor.
        assert_eq!(judge(false, WEB_ERROR_OPERATION_CANCELED, Some(200), 7, 9), Verdict::Superseded);
        assert_eq!(judge(false, WEB_ERROR_OPERATION_CANCELED, Some(200), 9, 9), Verdict::Superseded);
        // Incluso un fallo "real" de una navegación ya superada se descarta.
        assert_eq!(judge(false, 6, None, 7, 9), Verdict::Superseded);
        assert_eq!(judge(true, 0, Some(500), 7, 9), Verdict::Superseded);
    }

    #[test]
    fn real_failures_still_show_the_error_page() {
        assert_eq!(judge(false, 6, None, 9, 9), Verdict::Failed); // servidor inalcanzable
        assert_eq!(judge(false, 2, None, 9, 9), Verdict::Failed); // certificado caducado
        assert_eq!(judge(false, 7, None, 9, 9), Verdict::Failed); // tiempo agotado
        assert_eq!(judge(false, 13, None, 9, 9), Verdict::Failed); // nombre no resuelto
        assert_eq!(judge(false, 6, Some(502), 9, 9), Verdict::Failed);
    }

    #[test]
    fn a_failure_that_reports_a_2xx_or_3xx_status_is_not_shown_as_an_error() {
        for status in [200, 204, 301, 304, 399] {
            assert_eq!(judge(false, 0, Some(status), 9, 9), Verdict::Superseded, "{status}");
        }
    }

    #[test]
    fn unknown_navigation_ids_do_not_discard_events() {
        assert_eq!(judge(false, 6, None, 0, 9), Verdict::Failed);
        assert_eq!(judge(false, 6, None, 5, 0), Verdict::Failed);
    }
}

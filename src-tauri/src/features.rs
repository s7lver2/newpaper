//! Arranque de los subproyectos. Cada uno añade aquí una línea; se ejecuta antes de crear la ventana.
pub fn setup_all(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    crate::privacy::setup(app)?;
    crate::sources::setup(app)?;
    crate::ai::setup(app)?;
    #[cfg(desktop)]
    crate::system::setup(app)?;
    #[cfg(mobile)]
    crate::system::content::setup(app)?;
    crate::sync::setup(app)?;
    #[cfg(mobile)]
    crate::mobile::setup(app)?;
    Ok(())
}

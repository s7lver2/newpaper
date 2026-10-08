//! Arranque de los subproyectos. Cada uno añade aquí una línea; se ejecuta antes de crear la ventana.
pub fn setup_all(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    crate::privacy::setup(app)?;
    Ok(())
}

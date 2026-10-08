fn main() {
    let script = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../packages/extract/dist/content.js");
    println!("cargo:rerun-if-changed={}", script.display());
    if !script.exists() {
        panic!(
            "Falta {}. Ejecuta `pnpm --filter @newpaper/extract build` antes de compilar np-shell.",
            script.display()
        );
    }
}

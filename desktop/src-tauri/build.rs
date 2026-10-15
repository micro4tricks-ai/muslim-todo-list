fn main() {
    // The app's own commands (src/shamela.rs), so the website in the window can be allowed them by name.
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["shamela_catalog", "shamela_install", "shamela_remove"])),
    )
    .expect("failed to run tauri-build");
}

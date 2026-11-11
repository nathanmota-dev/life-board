//! Declares the app's commands in its manifest, so a window can call only the
//! ones its capability allows (`allow-<command>` in `capabilities/`).

const COMMANDS: &[&str] = &["get_version", "get_api_base_url", "open_external", "set_language"];

fn main() {
    let manifest = tauri_build::AppManifest::new().commands(COMMANDS);
    if let Err(error) = tauri_build::try_build(tauri_build::Attributes::new().app_manifest(manifest)) {
        panic!("tauri build failed: {error:#}");
    }
}

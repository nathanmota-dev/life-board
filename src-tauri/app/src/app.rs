//! Tauri wiring: start the API, then open the main window, and close the API
//! when the app exits. Needs a display, so the tests cover `backend`,
//! `commands` and `webview` instead.

use std::process::ExitCode;

use tauri::webview::{NewWindowResponse, PageLoadEvent};
use tauri::{App, AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

use crate::backend::{self, Backend};
use crate::commands::{self, DesktopState};
use crate::webview::{MAIN_WINDOW, is_app_url};

pub fn run() -> ExitCode {
    let _ = tracing_subscriber::fmt().with_writer(std::io::stderr).with_ansi(false).try_init();
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(commands::handler())
        .setup(|app| {
            if let Err(error) = setup(app) {
                tracing::error!("startup failed: {error}");
                std::process::exit(1);
            }
            Ok(())
        })
        .build(tauri::generate_context!());
    match app {
        Ok(app) => {
            app.run(on_event);
            ExitCode::SUCCESS
        }
        Err(error) => {
            tracing::error!("startup failed: {error}");
            ExitCode::FAILURE
        }
    }
}

fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let data_dir =
        backend::resolve_data_dir(std::env::var_os(backend::DATA_DIR_ENV).as_deref(), || app.path().app_data_dir())?;
    tracing::warn!(
        "the secret key is generated per launch and kept in memory: a saved GitHub token does not survive a restart"
    );
    let server = tauri::async_runtime::block_on(backend::start(data_dir.clone()))?;
    tracing::info!("API listening on {} with data in {}", server.url, data_dir.display());
    let version = app.package_info().version.to_string();
    app.manage(DesktopState::new(version, server.url.clone()));
    app.manage(Backend::new(server));

    // Hidden until the page has loaded, as `ready-to-show` in Electron.
    WebviewWindowBuilder::new(app, MAIN_WINDOW, WebviewUrl::App("index.html".into()))
        .title("Life Board")
        .inner_size(1280.0, 800.0)
        .min_inner_size(640.0, 480.0)
        .visible(false)
        // Otherwise Tauri intercepts HTML5 file drops.
        .disable_drag_drop_handler()
        .on_navigation(is_app_url)
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .on_page_load(|window, payload| {
            if payload.event() == PageLoadEvent::Finished
                && let Err(error) = window.show()
            {
                tracing::error!(%error, "showing the window failed");
            }
        })
        .build()?;
    Ok(())
}

fn on_event(app: &AppHandle, event: RunEvent) {
    if let RunEvent::Exit = event
        && let Some(backend) = app.try_state::<Backend>()
    {
        tauri::async_runtime::block_on(backend.close());
        tracing::info!("API closed");
    }
}

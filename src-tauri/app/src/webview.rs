//! The webview's lockdown, kept as a pure function so it can be tested
//! without a display. `window.desktop` is built by the frontend
//! (`web/src/lib/tauri-bridge.ts`) over the commands in `commands`.

use tauri::Url;

/// The main window's label, which `capabilities/default.json` refers to.
pub const MAIN_WINDOW: &str = "main";

/// Where Tauri serves `frontendDist` on Linux.
pub const APP_ORIGIN: &str = "tauri://localhost";

/// `on_navigation`: only the app's own origin, like `will-navigate` in Electron.
/// Links to GitHub, the API on `127.0.0.1` and `file://` are refused.
pub fn is_app_url(url: &Url) -> bool {
    url.scheme() == "tauri" && url.host_str() == Some("localhost") && url.port().is_none()
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use super::*;

    fn allowed(url: &str) -> bool {
        is_app_url(&Url::parse(url).unwrap())
    }

    #[test]
    fn allows_the_app_origin() {
        assert!(allowed(APP_ORIGIN));
        assert!(allowed("tauri://localhost/index.html#/tasks"));
    }

    #[test]
    fn refuses_every_other_origin() {
        for url in [
            "https://github.com/nathanmota-dev/life-board",
            "https://localhost/",
            "http://127.0.0.1:4321/api/health",
            "http://localhost:5180/",
            "file:///home/u/.config/life-board-app/life-board.db",
            "tauri://evil.example/",
            "tauri://localhost:8080/",
            "about:blank",
        ] {
            assert!(!allowed(url), "{url}");
        }
    }
}

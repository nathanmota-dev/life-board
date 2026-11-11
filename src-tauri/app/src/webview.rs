//! The webview's lockdown and the temporary `window.desktop` bridge, kept as
//! pure functions so they can be tested without a display.

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

/// Defines `window.desktop` before the page's scripts run, with what the
/// frontend calls unconditionally: the API URL, the version and `openExternal`
/// (a no-op for now). Issue #65 replaces it with a bridge over Tauri commands.
pub fn desktop_bridge_script(api_url: &str, version: &str) -> String {
    let api_url = serde_json::Value::from(api_url);
    let version = serde_json::Value::from(version);
    format!(
        "Object.defineProperty(window, \"desktop\", {{ configurable: true, value: Object.freeze({{ \
         getApiBaseUrl: () => Promise.resolve({api_url}), \
         getVersion: () => Promise.resolve({version}), \
         openExternal: () => Promise.resolve() }}) }});"
    )
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

    #[test]
    fn bridge_script_exposes_the_api_url_and_version() {
        let script = desktop_bridge_script("http://127.0.0.1:4321", "1.1.2");

        assert!(script.contains(r#"getApiBaseUrl: () => Promise.resolve("http://127.0.0.1:4321")"#), "{script}");
        assert!(script.contains(r#"getVersion: () => Promise.resolve("1.1.2")"#), "{script}");
        assert!(script.contains("openExternal: () => Promise.resolve()"), "{script}");
    }

    #[test]
    fn bridge_script_escapes_its_values() {
        let script = desktop_bridge_script("\");alert(1);(\"", "1\n2");

        assert!(script.contains(r#"Promise.resolve("\");alert(1);(\"")"#), "{script}");
        assert!(script.contains(r#"Promise.resolve("1\n2")"#), "{script}");
    }
}

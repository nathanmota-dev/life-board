//! The Tauri commands behind the `core` group of `window.desktop`
//! (`web/src/lib/tauri-bridge.ts`). Later groups add their own.

use std::sync::{Mutex, PoisonError};

use serde::{Serialize, Serializer};
use tauri::ipc::Invoke;
use tauri::{AppHandle, Runtime, State, Url};
use tauri_plugin_opener::OpenerExt;

/// The only prefix `open_external` accepts, as `app:open-external` in Electron.
pub const EXTERNAL_URL_PREFIX: &str = "https://github.com/";

/// The commands that `build.rs` declares in the app manifest, so each one
/// needs an `allow-*` permission in `capabilities/default.json`.
pub const COMMANDS: &[&str] = &["get_version", "get_api_base_url", "open_external", "set_language"];

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum CommandError {
    #[error("only https://github.com/ links can be opened")]
    ExternalUrlRefused,
    #[error("unsupported language: {0}")]
    UnsupportedLanguage(String),
    #[error("opening the link failed: {0}")]
    Open(String),
}

/// Rejected promises in the webview receive the message.
impl Serialize for CommandError {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

/// The languages the tray and notifications will speak (#67).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Language {
    Pt,
    En,
}

impl Language {
    /// Only `pt` and `en`, as `app:set-language` in Electron.
    pub fn parse(value: &str) -> Result<Self, CommandError> {
        match value {
            "pt" => Ok(Self::Pt),
            "en" => Ok(Self::En),
            _ => Err(CommandError::UnsupportedLanguage(value.to_owned())),
        }
    }
}

/// Tauri managed state read by the `core` commands.
pub struct DesktopState {
    version: String,
    api_base_url: String,
    language: Mutex<Option<Language>>,
}

impl DesktopState {
    pub fn new(version: impl Into<String>, api_base_url: impl Into<String>) -> Self {
        Self { version: version.into(), api_base_url: api_base_url.into(), language: Mutex::new(None) }
    }

    pub fn version(&self) -> &str {
        &self.version
    }

    pub fn api_base_url(&self) -> &str {
        &self.api_base_url
    }

    /// The language picked in Settings, or `None` until the frontend sends one.
    pub fn language(&self) -> Option<Language> {
        *self.language.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn set_language(&self, language: Language) {
        *self.language.lock().unwrap_or_else(PoisonError::into_inner) = Some(language);
    }
}

/// `url` when it is a GitHub link; anything else is refused.
pub fn external_url(url: &str) -> Result<&str, CommandError> {
    match Url::parse(url) {
        Ok(parsed) if url.starts_with(EXTERNAL_URL_PREFIX) && parsed.host_str() == Some("github.com") => Ok(url),
        _ => Err(CommandError::ExternalUrlRefused),
    }
}

/// Checks `url`, then hands it to `open`, which only runs for an allowed URL.
pub fn open_external_with<E: std::fmt::Display>(
    url: &str,
    open: impl FnOnce(&str) -> Result<(), E>,
) -> Result<(), CommandError> {
    open(external_url(url)?).map_err(|error| CommandError::Open(error.to_string()))
}

#[tauri::command]
pub fn get_version(state: State<'_, DesktopState>) -> String {
    state.version().to_owned()
}

#[tauri::command]
pub fn get_api_base_url(state: State<'_, DesktopState>) -> String {
    state.api_base_url().to_owned()
}

/// Opens a GitHub link in the system browser.
#[tauri::command]
pub fn open_external<R: Runtime>(app: AppHandle<R>, url: String) -> Result<(), CommandError> {
    open_external_with(&url, |url| app.opener().open_url(url, None::<&str>))
}

/// Stores the language for the tray and notifications, which come in #67.
#[tauri::command]
pub fn set_language(state: State<'_, DesktopState>, language: String) -> Result<(), CommandError> {
    state.set_language(Language::parse(&language)?);
    Ok(())
}

/// The invoke handler with every command in [`COMMANDS`].
pub fn handler<R: Runtime>() -> impl Fn(Invoke<R>) -> bool + Send + Sync + 'static {
    tauri::generate_handler![get_version, get_api_base_url, open_external, set_language]
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use serde_json::{Value, json};
    use tauri::Manager;
    use tauri::ipc::{CallbackFn, InvokeBody};
    use tauri::test::{INVOKE_KEY, MockRuntime, get_ipc_response, mock_builder, mock_context, noop_assets};
    use tauri::webview::InvokeRequest;

    use super::*;

    fn mock_app() -> (tauri::App<MockRuntime>, tauri::WebviewWindow<MockRuntime>) {
        let app = mock_builder()
            .manage(DesktopState::new("1.2.1", "http://127.0.0.1:4321"))
            .invoke_handler(handler())
            .build(mock_context(noop_assets()))
            .unwrap();
        let webview = tauri::WebviewWindowBuilder::new(&app, "main", Default::default()).build().unwrap();
        (app, webview)
    }

    fn invoke(webview: &tauri::WebviewWindow<MockRuntime>, cmd: &str, body: Value) -> Result<Value, Value> {
        get_ipc_response(
            webview,
            InvokeRequest {
                cmd: cmd.into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: "tauri://localhost".parse().unwrap(),
                body: InvokeBody::Json(body),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.into(),
            },
        )
        .map(|body| body.deserialize::<Value>().unwrap())
    }

    #[test]
    fn allows_github_links() {
        for url in [
            "https://github.com/",
            "https://github.com/nathanmota-dev/life-board",
            "https://github.com/nathanmota-dev/life-board/releases/tag/v1.2.1",
            "https://github.com/nathanmota-dev/life-board/pull/69?tab=files#diff",
        ] {
            assert_eq!(external_url(url), Ok(url));
        }
    }

    #[test]
    fn refuses_every_other_url() {
        for url in [
            "http://github.com/nathanmota-dev/life-board",
            "https://github.com.evil.test/",
            "https://github.com.evil.test/nathanmota-dev",
            "https://github.com",
            "https://github.com:8443/nathanmota-dev",
            "https://user@github.com/nathanmota-dev",
            "https://api.github.com/repos",
            "https://evil.test/https://github.com/",
            "HTTPS://GITHUB.COM/nathanmota-dev",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "github.com/nathanmota-dev",
            "",
        ] {
            assert_eq!(external_url(url), Err(CommandError::ExternalUrlRefused), "{url}");
        }
    }

    #[test]
    fn opens_only_an_allowed_url() {
        let mut opened = Vec::new();
        let result = open_external_with("https://github.com/nathanmota-dev", |url| {
            opened.push(url.to_owned());
            Ok::<_, String>(())
        });

        assert_eq!(result, Ok(()));
        assert_eq!(opened, ["https://github.com/nathanmota-dev"]);

        let refused = open_external_with("file:///etc/passwd", |_| -> Result<(), String> {
            panic!("a refused URL must not be opened")
        });
        assert_eq!(refused, Err(CommandError::ExternalUrlRefused));
    }

    #[test]
    fn reports_an_opener_failure() {
        let result = open_external_with("https://github.com/", |_| Err("no browser"));

        assert_eq!(result, Err(CommandError::Open("no browser".into())));
        assert_eq!(result.unwrap_err().to_string(), "opening the link failed: no browser");
    }

    #[test]
    fn accepts_only_pt_and_en() {
        assert_eq!(Language::parse("pt"), Ok(Language::Pt));
        assert_eq!(Language::parse("en"), Ok(Language::En));
        for value in ["", "es", "PT", "pt-BR", "en-US", " en"] {
            assert_eq!(Language::parse(value), Err(CommandError::UnsupportedLanguage(value.into())), "{value:?}");
        }
    }

    #[test]
    fn serializes_errors_as_their_message() {
        assert_eq!(
            serde_json::to_value(CommandError::UnsupportedLanguage("es".into())).unwrap(),
            json!("unsupported language: es")
        );
    }

    #[test]
    fn exposes_the_version_and_the_api_url() {
        let (_app, webview) = mock_app();

        assert_eq!(invoke(&webview, "get_version", json!({})), Ok(json!("1.2.1")));
        assert_eq!(invoke(&webview, "get_api_base_url", json!({})), Ok(json!("http://127.0.0.1:4321")));
    }

    #[test]
    fn stores_a_supported_language() {
        let (app, webview) = mock_app();
        let state = app.state::<DesktopState>();
        assert_eq!(state.language(), None);

        assert_eq!(invoke(&webview, "set_language", json!({ "language": "pt" })), Ok(Value::Null));
        assert_eq!(state.language(), Some(Language::Pt));

        assert_eq!(
            invoke(&webview, "set_language", json!({ "language": "es" })),
            Err(json!("unsupported language: es"))
        );
        assert_eq!(state.language(), Some(Language::Pt));

        assert_eq!(invoke(&webview, "set_language", json!({ "language": "en" })), Ok(Value::Null));
        assert_eq!(state.language(), Some(Language::En));
    }

    #[test]
    fn open_external_refuses_a_non_github_url() {
        let (_app, webview) = mock_app();

        for url in ["http://github.com/", "https://github.com.evil.test/", "file:///etc/passwd"] {
            assert_eq!(
                invoke(&webview, "open_external", json!({ "url": url })),
                Err(json!("only https://github.com/ links can be opened")),
                "{url}"
            );
        }
    }

    #[test]
    fn build_script_declares_the_same_commands() {
        let build = include_str!("../build.rs");
        let list = build.lines().find(|line| line.starts_with("const COMMANDS")).unwrap();
        let declared: Vec<&str> = list.split('"').skip(1).step_by(2).collect();

        assert_eq!(declared, COMMANDS);
    }

    #[test]
    fn handler_registers_every_declared_command() {
        let (_app, webview) = mock_app();
        let unknown = |response: &Result<Value, Value>| {
            response.as_ref().err().and_then(Value::as_str).is_some_and(|error| error.contains("not found"))
        };
        assert!(unknown(&invoke(&webview, "pomodoro_get_state", json!({}))));

        for command in COMMANDS {
            let response = invoke(&webview, command, json!({ "url": "file:///", "language": "en" }));
            assert!(!unknown(&response), "{command}: {response:?}");
        }
    }
}

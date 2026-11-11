//! Starts the Rust API inside the Tauri process and stops it on exit.

use std::ffi::OsStr;
use std::path::PathBuf;
use std::sync::Mutex;

use life_board_api::server::StartError;
use life_board_api::{RunningServer, ServerOptions, start_server};

/// Overrides the data directory, as for the Electron sidecar.
pub const DATA_DIR_ENV: &str = "LIFE_BOARD_DATA_DIR";

/// The AES key length the API expects.
pub const SECRET_KEY_LEN: usize = 32;

#[derive(Debug, thiserror::Error)]
pub enum BackendError {
    #[error("resolving the data directory failed: {0}")]
    DataDir(String),
    #[error("generating the secret key failed: {0}")]
    SecretKey(getrandom::Error),
    #[error("starting the API failed: {0}")]
    Start(#[from] StartError),
}

/// `LIFE_BOARD_DATA_DIR` when set and not empty, otherwise `fallback` (Tauri's
/// `app_data_dir()`). Never the Electron profile in `~/.config/life-board-app`.
pub fn resolve_data_dir<E: std::fmt::Display>(
    override_dir: Option<&OsStr>,
    fallback: impl FnOnce() -> Result<PathBuf, E>,
) -> Result<PathBuf, BackendError> {
    match override_dir {
        Some(dir) if !dir.is_empty() => Ok(PathBuf::from(dir)),
        _ => fallback().map_err(|error| BackendError::DataDir(error.to_string())),
    }
}

/// A fresh random key, kept in memory only. Storing it belongs to the
/// secret-key migration, so secrets sealed by a previous launch are dropped.
pub fn generate_secret_key() -> Result<Vec<u8>, BackendError> {
    let mut key = vec![0_u8; SECRET_KEY_LEN];
    getrandom::fill(&mut key).map_err(BackendError::SecretKey)?;
    Ok(key)
}

/// Starts the API in `data_dir` on a free port of `127.0.0.1`, with a new key
/// and `reset_secrets`, so a GitHub token saved before does not survive.
pub async fn start(data_dir: PathBuf) -> Result<RunningServer, BackendError> {
    let mut options = ServerOptions::new(data_dir, generate_secret_key()?);
    options.reset_secrets = true;
    Ok(start_server(options).await?)
}

/// Tauri managed state: the running API until the app exits.
pub struct Backend {
    url: String,
    server: Mutex<Option<RunningServer>>,
}

impl Backend {
    pub fn new(server: RunningServer) -> Self {
        Self { url: server.url.clone(), server: Mutex::new(Some(server)) }
    }

    /// `http://127.0.0.1:<port>`.
    pub fn url(&self) -> &str {
        &self.url
    }

    /// Takes the server out, once; later calls return `None`.
    pub fn take(&self) -> Option<RunningServer> {
        self.server.lock().unwrap_or_else(std::sync::PoisonError::into_inner).take()
    }

    /// Stops the server and closes the database. Safe to call more than once.
    pub async fn close(&self) {
        if let Some(server) = self.take() {
            server.close().await;
        }
    }
}

#[cfg(test)]
#[allow(clippy::unwrap_used, clippy::expect_used)]
mod tests {
    use std::path::Path;

    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    use super::*;

    #[test]
    fn uses_the_override_directory_when_it_is_set() {
        let dir = resolve_data_dir(Some(OsStr::new("/tmp/life board")), || -> Result<PathBuf, String> {
            panic!("the fallback must not run")
        });

        assert_eq!(dir.unwrap(), PathBuf::from("/tmp/life board"));
    }

    #[test]
    fn falls_back_to_the_app_data_directory_when_unset_or_empty() {
        let fallback = || Ok::<_, String>(PathBuf::from("/home/u/.local/share/dev.nathanmota.lifeboard"));

        assert_eq!(resolve_data_dir(None, fallback).unwrap(), fallback().unwrap());
        assert_eq!(resolve_data_dir(Some(OsStr::new("")), fallback).unwrap(), fallback().unwrap());
    }

    #[test]
    fn reports_a_fallback_that_fails() {
        let error = resolve_data_dir(None, || Err::<PathBuf, _>("no home")).unwrap_err();

        assert!(matches!(error, BackendError::DataDir(_)));
        assert_eq!(error.to_string(), "resolving the data directory failed: no home");
    }

    #[test]
    fn generates_a_new_32_byte_key_each_time() {
        let first = generate_secret_key().unwrap();
        let second = generate_secret_key().unwrap();

        assert_eq!(first.len(), SECRET_KEY_LEN);
        assert_eq!(second.len(), SECRET_KEY_LEN);
        assert_ne!(first, second);
    }

    async fn get(url: &str, path: &str) -> String {
        let address = url.trim_start_matches("http://");
        let mut stream = tokio::net::TcpStream::connect(address).await.unwrap();
        let request = format!("GET {path} HTTP/1.1\r\nHost: {address}\r\nConnection: close\r\n\r\n");
        stream.write_all(request.as_bytes()).await.unwrap();
        let mut response = String::new();
        stream.read_to_string(&mut response).await.unwrap();
        response
    }

    /// Whether this process still has a file descriptor on `path` (Linux).
    fn holds_open(path: &Path) -> bool {
        std::fs::read_dir("/proc/self/fd")
            .unwrap()
            .filter_map(|entry| std::fs::read_link(entry.ok()?.path()).ok())
            .any(|target| target.starts_with(path))
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn serves_health_from_the_data_directory_and_releases_it_on_close() {
        let root = tempfile::tempdir().unwrap();
        let data_dir = root.path().join("profile");
        let backend = Backend::new(start(data_dir.clone()).await.unwrap());

        assert!(backend.url().starts_with("http://127.0.0.1:"));
        let response = get(backend.url(), "/api/health").await;
        assert!(response.starts_with("HTTP/1.1 200"), "{response}");
        assert!(response.contains(r#""service":"life-board-api""#), "{response}");
        assert!(data_dir.join("life-board.db").is_file());
        assert!(holds_open(&data_dir));

        backend.close().await;
        backend.close().await;

        assert!(!holds_open(&data_dir));
        assert!(backend.take().is_none());
        let address = backend.url().trim_start_matches("http://").to_owned();
        assert!(tokio::net::TcpStream::connect(address).await.is_err());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn reports_a_data_directory_it_cannot_create() {
        let root = tempfile::tempdir().unwrap();
        let file = root.path().join("not-a-directory");
        std::fs::write(&file, b"").unwrap();

        let error = start(file.join("profile")).await.err().unwrap();

        assert!(matches!(error, BackendError::Start(_)));
        assert!(error.to_string().starts_with("starting the API failed:"), "{error}");
    }
}

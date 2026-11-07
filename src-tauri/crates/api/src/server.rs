//! `startServer` and the sidecar protocol of the `life-board-api` binary.

use std::net::SocketAddr;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// `ServerOptions`. Migrations are embedded, so there is no folder to pass.
#[derive(Clone)]
pub struct ServerOptions {
    /// Where `life-board.db` and the uploads are stored; created when missing.
    pub data_dir: PathBuf,
    /// 32-byte AES key for secrets at rest; the caller keeps it safe.
    pub secret_key: Vec<u8>,
    /// The key was replaced: drop secrets sealed with the old one, keep everything else.
    pub reset_secrets: bool,
    pub host: String,
    /// 0 picks a free port.
    pub port: u16,
}

impl ServerOptions {
    pub fn new(data_dir: impl Into<PathBuf>, secret_key: Vec<u8>) -> Self {
        Self { data_dir: data_dir.into(), secret_key, reset_secrets: false, host: "127.0.0.1".to_owned(), port: 0 }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum StartError {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Db(#[from] crate::db::DbError),
    #[error(transparent)]
    Crypto(#[from] crate::services::crypto::CryptoError),
    #[error(transparent)]
    Api(#[from] crate::error::ApiError),
}

/// A listening server. Dropping it without `close` leaves the task running.
pub struct RunningServer {
    pub addr: SocketAddr,
    pub port: u16,
    /// `http://<host>:<port>`.
    pub url: String,
    shutdown: Option<tokio::sync::oneshot::Sender<()>>,
    task: Option<tokio::task::JoinHandle<()>>,
}

impl RunningServer {
    /// Stops accepting connections, waits for the server and closes the database (`app.close()`).
    pub async fn close(mut self) {
        pending!(51, self.shutdown.take(), self.task.take())
    }
}

/// Opens the DB, migrates, drops `github_settings` when `reset_secrets`, builds
/// the app (`filesSettings.load()`, `fileBoards.purgeDeleted()`) and listens.
pub async fn start_server(options: ServerOptions) -> Result<RunningServer, StartError> {
    pending!(51, options.data_dir, options.secret_key, options.reset_secrets, options.host, options.port)
}

/// The one line the sidecar reads on stdin: the key never goes through env or args.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename = "secret-key", rename_all = "camelCase")]
pub struct SecretKeyMessage {
    /// Base64 of 32 bytes.
    pub key: String,
    #[serde(default)]
    pub reset_secrets: bool,
}

/// The one line the sidecar prints on stdout once it listens.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename = "ready")]
pub struct ReadyMessage {
    pub url: String,
}

/// `LIFE_BOARD_DATA_DIR` (required), `LIFE_BOARD_HOST` and `LIFE_BOARD_PORT`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SidecarEnv {
    pub data_dir: PathBuf,
    pub host: Option<String>,
    pub port: Option<u16>,
}

impl SidecarEnv {
    pub fn from_vars(vars: impl IntoIterator<Item = (String, String)>) -> Result<Self, String> {
        pending!(51, vars.into_iter().count())
    }
}

/// The binary: reads [`SidecarEnv`] and one [`SecretKeyMessage`] line, starts the
/// server, prints [`ReadyMessage`], logs to stderr, and exits when stdin closes.
/// Returns the process exit code (non-zero when startup fails).
pub async fn run_sidecar() -> u8 {
    pending!(51)
}

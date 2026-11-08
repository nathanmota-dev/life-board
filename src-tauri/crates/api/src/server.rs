//! `startServer` and the sidecar protocol of the `life-board-api` binary.

use std::collections::HashMap;
use std::net::SocketAddr;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tokio::io::{AsyncBufRead, AsyncBufReadExt, AsyncWriteExt, BufReader, Lines};

use crate::build_app;
use crate::db::Db;
use crate::services::crypto::CryptoService;
use crate::state::{AppOptions, AppState};

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
    db: Option<Db>,
}

impl RunningServer {
    /// Stops accepting connections, waits for the server and closes the database (`app.close()`).
    pub async fn close(mut self) {
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
        if let Some(task) = self.task.take()
            && let Err(error) = task.await
        {
            tracing::error!(%error, "server task failed");
        }
        if let Some(db) = self.db.take()
            && let Err(error) = db.close().await
        {
            tracing::error!(%error, "closing the database failed");
        }
    }
}

/// Opens the DB, migrates, drops `github_settings` when `reset_secrets`, builds
/// the app (`filesSettings.load()`, `fileBoards.purgeDeleted()`) and listens.
pub async fn start_server(options: ServerOptions) -> Result<RunningServer, StartError> {
    let ServerOptions { data_dir, secret_key, reset_secrets, host, port } = options;
    tokio::fs::create_dir_all(&data_dir).await?;
    let db = Db::open(&data_dir.join(DATABASE_FILE)).await?;
    // The GitHub token is the only encrypted secret; its row holds nothing else worth keeping.
    if reset_secrets {
        db.call(|conn| conn.execute("DELETE FROM github_settings", [])).await?;
    }
    let crypto = CryptoService::new(&secret_key)?;
    let state = AppState::new(AppOptions::new(db.clone(), &data_dir, crypto)).await?;
    let app = build_app(state);

    let listener = tokio::net::TcpListener::bind((host.as_str(), port)).await?;
    let addr = listener.local_addr()?;
    let (shutdown, signal) = tokio::sync::oneshot::channel::<()>();
    let task = tokio::spawn(async move {
        let serve = axum::serve(listener, app).with_graceful_shutdown(async move {
            let _ = signal.await;
        });
        if let Err(error) = serve.await {
            tracing::error!(%error, "server stopped");
        }
    });
    Ok(RunningServer {
        addr,
        port: addr.port(),
        url: format!("http://{host}:{}", addr.port()),
        shutdown: Some(shutdown),
        task: Some(task),
        db: Some(db),
    })
}

/// The profile database inside the data directory.
pub const DATABASE_FILE: &str = "life-board.db";

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
        let vars: HashMap<String, String> = vars.into_iter().filter(|(_, value)| !value.is_empty()).collect();
        let data_dir = vars.get("LIFE_BOARD_DATA_DIR").ok_or("LIFE_BOARD_DATA_DIR is required.")?;
        let port = vars
            .get("LIFE_BOARD_PORT")
            .map(|port| port.parse::<u16>().map_err(|_| format!("LIFE_BOARD_PORT is not a port: {port:?}.")))
            .transpose()?;
        Ok(Self { data_dir: PathBuf::from(data_dir), host: vars.get("LIFE_BOARD_HOST").cloned(), port })
    }
}

/// The binary: reads [`SidecarEnv`] and one [`SecretKeyMessage`] line, starts the
/// server, prints [`ReadyMessage`], logs to stderr, and exits when stdin closes.
/// Returns the process exit code (non-zero when startup fails).
pub async fn run_sidecar() -> u8 {
    let _ = tracing_subscriber::fmt().with_writer(std::io::stderr).with_ansi(false).try_init();
    let mut stdin = BufReader::new(tokio::io::stdin()).lines();
    let server = match start_sidecar(&mut stdin).await {
        Ok(server) => server,
        Err(error) => {
            tracing::error!("startup failed: {error}");
            return 1;
        }
    };
    tracing::info!("listening on {}", server.url);

    // The desktop shell owns the process: when it closes stdin (or goes away), stop.
    loop {
        tokio::select! {
            line = stdin.next_line() => match line {
                Ok(Some(_)) => continue,
                Ok(None) => break,
                Err(error) => {
                    tracing::warn!(%error, "stdin failed");
                    break;
                }
            },
            _ = shutdown_signal() => break,
        }
    }
    server.close().await;
    0
}

async fn start_sidecar<R: AsyncBufRead + Unpin>(stdin: &mut Lines<R>) -> Result<RunningServer, String> {
    let env = SidecarEnv::from_vars(
        std::env::vars_os().filter_map(|(key, value)| Some((key.into_string().ok()?, value.into_string().ok()?))),
    )?;
    let line = stdin
        .next_line()
        .await
        .map_err(|error| format!("reading the key failed: {error}"))?
        .ok_or("stdin closed before the secret key arrived.")?;
    let message: SecretKeyMessage =
        serde_json::from_str(line.trim()).map_err(|error| format!("invalid secret-key message: {error}"))?;
    let secret_key = crate::services::crypto::decode(&message.key).map_err(|error| error.to_string())?;

    let mut options = ServerOptions::new(env.data_dir, secret_key);
    options.reset_secrets = message.reset_secrets;
    if let Some(host) = env.host {
        options.host = host;
    }
    if let Some(port) = env.port {
        options.port = port;
    }
    let server = start_server(options).await.map_err(|error| error.to_string())?;

    let ready = serde_json::to_string(&ReadyMessage { url: server.url.clone() }).map_err(|error| error.to_string())?;
    let mut stdout = tokio::io::stdout();
    let written = async {
        stdout.write_all(format!("{ready}\n").as_bytes()).await?;
        stdout.flush().await
    };
    if let Err(error) = written.await {
        server.close().await;
        return Err(format!("writing the ready line failed: {error}"));
    }
    Ok(server)
}

/// Ctrl-C, or SIGTERM on Unix.
async fn shutdown_signal() {
    #[cfg(unix)]
    {
        if let Ok(mut terminate) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            tokio::select! {
                _ = tokio::signal::ctrl_c() => {}
                _ = terminate.recv() => {}
            }
            return;
        }
    }
    let _ = tokio::signal::ctrl_c().await;
}

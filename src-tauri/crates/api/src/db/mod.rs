//! The SQLite database (`db/client.ts`): one `rusqlite` connection behind a
//! mutex, used through `spawn_blocking`.

pub mod columns;
pub mod migrator;
pub mod schema;

use std::path::Path;
use std::sync::{Arc, Mutex};

use rusqlite::Connection;

pub use migrator::{MIGRATIONS, Migration};

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error(transparent)]
    Sqlite(#[from] rusqlite::Error),
    #[error("database task failed: {0}")]
    Join(#[from] tokio::task::JoinError),
    #[error("database connection is poisoned")]
    Poisoned,
    #[error("migration {tag} failed: {source}")]
    Migration { tag: &'static str, source: rusqlite::Error },
}

/// How the file is opened: read-write, created when missing, and without
/// `SQLITE_OPEN_URI`, so the path is never parsed as a `file:` URL (profile
/// paths may contain `?`, `#`, `%` or start with `//`).
pub fn open_flags() -> rusqlite::OpenFlags {
    use rusqlite::OpenFlags;
    OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_CREATE | OpenFlags::SQLITE_OPEN_NO_MUTEX
}

/// Shared handle to the profile database. Cloning shares the same connection.
#[derive(Clone)]
pub struct Db {
    conn: Arc<Mutex<Connection>>,
}

impl Db {
    /// Opens (or creates) the file exactly at `path`, sets `foreign_keys` and
    /// `secure_delete`, then applies every embedded migration.
    pub async fn open(path: &Path) -> Result<Self, DbError> {
        Self::open_with(path, MIGRATIONS).await
    }

    /// Like [`Db::open`] with a subset of the migrations, for tests that build a
    /// profile as an older version left it (`createDb(url, previousFolder)`).
    pub async fn open_with(path: &Path, migrations: &'static [Migration]) -> Result<Self, DbError> {
        let path = path.to_path_buf();
        let conn = tokio::task::spawn_blocking(move || -> Result<Connection, DbError> {
            let mut conn = Connection::open_with_flags(&path, open_flags())?;
            conn.execute_batch("PRAGMA foreign_keys = ON")?;
            // Zero deleted rows on disk, so a disconnected GitHub token doesn't linger in free pages.
            conn.execute_batch("PRAGMA secure_delete = ON")?;
            migrator::migrate(&mut conn, migrations)?;
            Ok(conn)
        })
        .await??;
        Ok(Self { conn: Arc::new(Mutex::new(conn)) })
    }

    /// Runs `f` on the connection in a blocking task.
    pub async fn call<T, F>(&self, f: F) -> Result<T, DbError>
    where
        F: FnOnce(&mut Connection) -> Result<T, rusqlite::Error> + Send + 'static,
        T: Send + 'static,
    {
        let conn = Arc::clone(&self.conn);
        tokio::task::spawn_blocking(move || {
            let mut guard = conn.lock().map_err(|_| DbError::Poisoned)?;
            f(&mut guard).map_err(DbError::from)
        })
        .await?
    }

    /// Closes the connection once every clone is dropped (`database.close()`).
    pub async fn close(self) -> Result<(), DbError> {
        match Arc::try_unwrap(self.conn) {
            Ok(mutex) => {
                let conn = mutex.into_inner().map_err(|_| DbError::Poisoned)?;
                tokio::task::spawn_blocking(move || conn.close().map_err(|(_, error)| DbError::from(error))).await?
            }
            // Other clones still use it; the last one to drop closes it.
            Err(_) => Ok(()),
        }
    }
}

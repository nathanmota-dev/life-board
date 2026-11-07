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
    pending!(51)
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
        pending!(51, path, migrations)
    }

    /// Runs `f` on the connection in a blocking task.
    pub async fn call<T, F>(&self, f: F) -> Result<T, DbError>
    where
        F: FnOnce(&mut Connection) -> Result<T, rusqlite::Error> + Send + 'static,
        T: Send + 'static,
    {
        pending!(51, f, self.conn)
    }

    /// Closes the connection once every clone is dropped (`database.close()`).
    pub async fn close(self) -> Result<(), DbError> {
        pending!(51, self)
    }
}

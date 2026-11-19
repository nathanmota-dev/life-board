//! Where uploads live: the data directory by default, or a folder picked in Settings > Files.

use crate::clock;
use std::io;
use std::path::{Path, PathBuf};

use axum::http::StatusCode;
use rusqlite::{OptionalExtension, params};
use serde::Serialize;

use crate::db::Db;
use crate::db::columns::to_millis;
use crate::error::{ApiError, ApiResult};
use crate::services::file_storage::{FileStorageService, absolute};
use crate::services::query::query_all;

pub const SETTINGS_ID: &str = "default";

/// `UPLOADS_SUBDIR`: created inside the picked folder so uploads never mix with the user's files.
pub const UPLOADS_SUBDIR: [&str; 2] = ["life-board-app", "uploads"];

/// Created inside the picked folder, next to `uploads`.
pub const PAGES_SUBDIR: [&str; 2] = ["life-board-app", "pages"];

/// `GET`/`PUT /settings/files` body. Paths are absolute, in the OS's own format.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilesSettings {
    pub base_dir: Option<String>,
    pub uploads_dir: String,
    pub default_uploads_dir: String,
    pub pages_dir: String,
    pub default_pages_dir: String,
}

#[derive(Clone)]
pub struct FilesSettingsService {
    db: Db,
    storage: FileStorageService,
    pages_storage: FileStorageService,
    default_root: PathBuf,
    default_pages_root: PathBuf,
}

impl FilesSettingsService {
    /// The pages storage's root at this point is its default one.
    pub fn new(
        db: Db,
        storage: FileStorageService,
        default_root: impl Into<PathBuf>,
        pages_storage: FileStorageService,
    ) -> Self {
        let default_pages_root = pages_storage.root();
        Self { db, storage, pages_storage, default_root: default_root.into(), default_pages_root }
    }

    /// Points the shared storages at the saved folder. Runs once at startup.
    pub async fn load(&self) -> ApiResult<()> {
        let base_dir = self.saved_base_dir().await?;
        self.storage.set_root(self.uploads_dir(base_dir.as_deref()));
        self.pages_storage.set_root(self.pages_dir(base_dir.as_deref()));
        Ok(())
    }

    /// `<base>/life-board-app/pages`, or the default root without a base.
    fn pages_dir(&self, base_dir: Option<&str>) -> PathBuf {
        match base_dir.filter(|base| !base.is_empty()) {
            Some(base) => PAGES_SUBDIR.iter().fold(PathBuf::from(base), |path, part| path.join(part)),
            None => absolute(&self.default_pages_root),
        }
    }

    /// `<base>/life-board-app/uploads`, or the default root without a base.
    fn uploads_dir(&self, base_dir: Option<&str>) -> PathBuf {
        match base_dir.filter(|base| !base.is_empty()) {
            Some(base) => UPLOADS_SUBDIR.iter().fold(PathBuf::from(base), |path, part| path.join(part)),
            None => absolute(&self.default_root),
        }
    }

    async fn saved_base_dir(&self) -> ApiResult<Option<String>> {
        Ok(self
            .db
            .call(|conn| {
                conn.query_row("SELECT uploads_base_dir FROM app_settings WHERE id = ?", [SETTINGS_ID], |row| {
                    row.get::<_, Option<String>>(0)
                })
                .optional()
            })
            .await?
            .flatten())
    }

    pub async fn get(&self) -> ApiResult<FilesSettings> {
        Ok(FilesSettings {
            base_dir: self.saved_base_dir().await?,
            uploads_dir: display(&self.storage.root()),
            default_uploads_dir: display(&absolute(&self.default_root)),
            pages_dir: display(&self.pages_storage.root()),
            default_pages_dir: display(&absolute(&self.default_pages_root)),
        })
    }

    /// Copies every upload and page under `base_dir` (or back to the default for `None`),
    /// saves the choice, switches to it, then removes the old files.
    /// `400 relative_dir`/`invalid_dir`; `500 move_failed` after rolling back the copies.
    pub async fn update(&self, base_dir: Option<String>) -> ApiResult<FilesSettings> {
        let next_base = match base_dir {
            Some(input) => Some(self.writable_dir(&input).await?),
            None => None,
        };
        let moves = [
            Move::new(&self.storage, self.uploads_dir(next_base.as_deref()), self.storage_paths().await?),
            Move::new(&self.pages_storage, self.pages_dir(next_base.as_deref()), self.page_paths().await?),
        ];
        for step in &moves {
            self.storage.disk().create_dir_all(&step.to.root()).await?;
        }
        copy_all(&moves).await?;

        self.save_base_dir(next_base).await?;
        self.storage.set_root(moves[0].to.root());
        self.pages_storage.set_root(moves[1].to.root());
        // Best effort: every file already lives in the new folder.
        for step in &moves {
            for path in &step.paths {
                let _ = step.from.remove(path).await;
            }
        }
        self.get().await
    }

    /// Expands a leading `~` and checks the folder exists and accepts writes.
    async fn writable_dir(&self, input: &str) -> ApiResult<String> {
        let dir = expand_home(input);
        let path = Path::new(&dir);
        // `path.isAbsolute`: on Windows a rooted path without a drive (`\folder`) counts too.
        if !path.has_root() {
            return Err(ApiError::bad_request("relative_dir", "The folder must be an absolute path."));
        }
        if self.storage.disk().check_writable_dir(path).await.is_err() {
            return Err(ApiError::bad_request("invalid_dir", "The folder doesn't exist or isn't writable."));
        }
        Ok(display(&absolute(path)))
    }

    async fn save_base_dir(&self, base_dir: Option<String>) -> ApiResult<()> {
        let now = to_millis(clock::now());
        self.db
            .call(move |conn| {
                conn.execute(
                    "INSERT INTO app_settings (id, uploads_base_dir, created_at, updated_at) VALUES (?1, ?2, ?3, ?3)
                     ON CONFLICT (id) DO UPDATE SET uploads_base_dir = ?2, updated_at = ?3",
                    params![SETTINGS_ID, base_dir, now],
                )
            })
            .await?;
        Ok(())
    }

    /// The `storage_path` of every page (folders have none).
    async fn page_paths(&self) -> ApiResult<Vec<String>> {
        Ok(self
            .db
            .call(|conn| query_all(conn, "SELECT storage_path FROM pages WHERE kind = 'page'", &[], |row| row.get(0)))
            .await?)
    }

    async fn storage_paths(&self) -> ApiResult<Vec<String>> {
        Ok(self.db.call(|conn| query_all(conn, "SELECT storage_path FROM file_items", &[], |row| row.get(0))).await?)
    }
}

fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

/// `input.replace(/^~(?=$|[\\/])/, homedir())`.
fn expand_home(input: &str) -> String {
    match (input.strip_prefix('~'), std::env::home_dir()) {
        (Some(rest), Some(home)) if rest.is_empty() || rest.starts_with(['/', '\\']) => {
            format!("{}{rest}", home.to_string_lossy())
        }
        _ => input.to_owned(),
    }
}

/// One root's files and where they go.
struct Move {
    from: FileStorageService,
    to: FileStorageService,
    paths: Vec<String>,
}

impl Move {
    /// Nothing to copy when the target is the folder already in use.
    fn new(storage: &FileStorageService, target: PathBuf, paths: Vec<String>) -> Self {
        let from = storage.at(storage.root());
        let to = storage.at(target);
        let paths = if from.root() == to.root() { Vec::new() } else { paths };
        Self { from, to, paths }
    }
}

/// Copies every file of every move or none: on failure, removes the copies already made in all roots.
async fn copy_all(moves: &[Move]) -> ApiResult<()> {
    let mut copied: Vec<(&FileStorageService, &String)> = Vec::new();
    for step in moves {
        for path in &step.paths {
            match step.from.copy_to(path, &step.to).await {
                Ok(()) => copied.push((&step.to, path)),
                // A file already missing from disk can't be moved; don't let it block the switch.
                Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                Err(error) => {
                    for (target, path) in copied {
                        let _ = target.remove(path).await;
                    }
                    return Err(ApiError::http(StatusCode::INTERNAL_SERVER_ERROR, "move_failed", error.to_string()));
                }
            }
        }
    }
    Ok(())
}

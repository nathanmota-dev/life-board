//! Where uploads live: the data directory by default, or a folder picked in Settings > Files.

use std::io;
use std::path::{Path, PathBuf};

use axum::http::StatusCode;
use chrono::Utc;
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

/// `GET`/`PUT /settings/files` body. Paths are absolute, in the OS's own format.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilesSettings {
    pub base_dir: Option<String>,
    pub uploads_dir: String,
    pub default_uploads_dir: String,
}

#[derive(Clone)]
pub struct FilesSettingsService {
    db: Db,
    storage: FileStorageService,
    default_root: PathBuf,
}

impl FilesSettingsService {
    pub fn new(db: Db, storage: FileStorageService, default_root: impl Into<PathBuf>) -> Self {
        Self { db, storage, default_root: default_root.into() }
    }

    /// Points the shared storage at the saved folder. Runs once at startup.
    pub async fn load(&self) -> ApiResult<()> {
        let base_dir = self.saved_base_dir().await?;
        self.storage.set_root(self.uploads_dir(base_dir.as_deref()));
        Ok(())
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
        })
    }

    /// Copies every upload under `base_dir` (or back to the default for `None`),
    /// saves the choice, switches to it, then removes the old files.
    /// `400 relative_dir`/`invalid_dir`; `500 move_failed` after rolling back the copies.
    pub async fn update(&self, base_dir: Option<String>) -> ApiResult<FilesSettings> {
        let next_base = match base_dir {
            Some(input) => Some(self.writable_dir(&input).await?),
            None => None,
        };
        let previous = self.storage.at(self.storage.root());
        let target = self.storage.at(self.uploads_dir(next_base.as_deref()));
        self.storage.disk().create_dir_all(&target.root()).await?;

        let paths = if target.root() == previous.root() { Vec::new() } else { self.storage_paths().await? };
        copy_all(&previous, &target, &paths).await?;

        self.save_base_dir(next_base).await?;
        self.storage.set_root(target.root());
        // Best effort: every file already lives in the new folder.
        for path in &paths {
            let _ = previous.remove(path).await;
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
        let now = to_millis(Utc::now());
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

/// Copies every file or none: on failure, removes the copies already made.
async fn copy_all(from: &FileStorageService, to: &FileStorageService, paths: &[String]) -> ApiResult<()> {
    let mut copied = Vec::new();
    for path in paths {
        match from.copy_to(path, to).await {
            Ok(()) => copied.push(path),
            // A file already missing from disk can't be moved; don't let it block the switch.
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => {
                for path in copied {
                    let _ = to.remove(path).await;
                }
                return Err(ApiError::http(StatusCode::INTERNAL_SERVER_ERROR, "move_failed", error.to_string()));
            }
        }
    }
    Ok(())
}

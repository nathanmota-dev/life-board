//! Where uploads live: the data directory by default, or a folder picked in Settings > Files.

use std::path::PathBuf;

use serde::Serialize;

use crate::db::Db;
use crate::error::ApiResult;
use crate::services::file_storage::{FileStorageService, absolute};
use rusqlite::OptionalExtension;

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
        pending!(52, self.db, self.storage, self.default_root)
    }

    /// Copies every upload under `base_dir` (or back to the default for `None`),
    /// saves the choice, switches to it, then removes the old files.
    /// `400 relative_dir`/`invalid_dir`; `500 move_failed` after rolling back the copies.
    pub async fn update(&self, base_dir: Option<String>) -> ApiResult<FilesSettings> {
        pending!(52, self.db, self.storage, self.default_root, base_dir)
    }
}

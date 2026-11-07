//! Where uploads live: the data directory by default, or a folder picked in Settings > Files.

use std::path::PathBuf;

use serde::Serialize;

use crate::db::Db;
use crate::error::ApiResult;
use crate::services::file_storage::FileStorageService;

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
        pending!(51, self.db, self.storage, self.default_root)
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

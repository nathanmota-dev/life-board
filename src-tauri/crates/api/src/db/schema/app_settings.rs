use serde::Serialize;

use crate::db::columns::{Timestamp, js_date};
use crate::db::{Db, DbError};

/// Single row (id = "default") for app-wide preferences the backend needs.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub id: String,
    /// Folder picked in Settings > Files; `None` keeps uploads in the data directory.
    pub uploads_base_dir: Option<String>,
    #[serde(with = "js_date")]
    pub created_at: Timestamp,
    #[serde(with = "js_date")]
    pub updated_at: Timestamp,
}

#[derive(Debug, Clone, Default)]
pub struct NewAppSettings {
    pub id: String,
    pub uploads_base_dir: Option<String>,
    pub created_at: Option<Timestamp>,
    pub updated_at: Option<Timestamp>,
}

impl AppSettings {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        pending!(52, row)
    }
}

pub async fn insert(db: &Db, rows: Vec<NewAppSettings>) -> Result<(), DbError> {
    pending!(52, db, rows)
}

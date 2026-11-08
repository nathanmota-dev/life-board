use crate::clock;
use serde::Serialize;

use rusqlite::params;

use crate::db::columns::{Timestamp, get_timestamp, js_date, to_millis};
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
        Ok(Self {
            id: row.get("id")?,
            uploads_base_dir: row.get("uploads_base_dir")?,
            created_at: get_timestamp(row, "created_at")?,
            updated_at: get_timestamp(row, "updated_at")?,
        })
    }
}

pub async fn insert(db: &Db, rows: Vec<NewAppSettings>) -> Result<(), DbError> {
    db.call(move |conn| {
        let tx = conn.transaction()?;
        let now = clock::now();
        for row in rows {
            tx.execute(
                "INSERT INTO app_settings (id, uploads_base_dir, created_at, updated_at) VALUES (?, ?, ?, ?)",
                params![
                    row.id,
                    row.uploads_base_dir,
                    to_millis(row.created_at.unwrap_or(now)),
                    to_millis(row.updated_at.unwrap_or(now)),
                ],
            )?;
        }
        tx.commit()
    })
    .await
}

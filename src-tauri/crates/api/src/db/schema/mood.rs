use serde::Serialize;

use crate::db::columns::{Timestamp, js_date};
use crate::db::{Db, DbError};

/// One entry per local day ("2026-10-17"); re-submitting the same day updates it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoodEntry {
    pub id: String,
    pub day: String,
    pub score: i64,
    pub note: Option<String>,
    pub linked_task_ids: Vec<String>,
    #[serde(with = "js_date")]
    pub created_at: Timestamp,
    #[serde(with = "js_date")]
    pub updated_at: Timestamp,
}

#[derive(Debug, Clone, Default)]
pub struct NewMoodEntry {
    pub id: String,
    pub day: String,
    pub score: i64,
    pub note: Option<String>,
    pub linked_task_ids: Option<Vec<String>>,
    pub created_at: Option<Timestamp>,
    pub updated_at: Option<Timestamp>,
}

impl MoodEntry {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        pending!(51, row)
    }
}

pub async fn insert(db: &Db, rows: Vec<NewMoodEntry>) -> Result<(), DbError> {
    pending!(51, db, rows)
}

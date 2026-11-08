use crate::clock;
use serde::Serialize;

use rusqlite::params;

use crate::db::columns::{Timestamp, get_json_list, get_timestamp, js_date, to_json_list, to_millis};
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
        Ok(Self {
            id: row.get("id")?,
            day: row.get("day")?,
            score: row.get("score")?,
            note: row.get("note")?,
            linked_task_ids: get_json_list(row, "linked_task_ids")?,
            created_at: get_timestamp(row, "created_at")?,
            updated_at: get_timestamp(row, "updated_at")?,
        })
    }
}

/// Inserts one row with the column defaults filled in and returns it.
pub fn insert_row(conn: &rusqlite::Connection, row: NewMoodEntry) -> rusqlite::Result<MoodEntry> {
    let now = clock::now();
    conn.query_row(
        "INSERT INTO mood_entries (id, day, score, note, linked_task_ids, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *",
        params![
            row.id,
            row.day,
            row.score,
            row.note,
            to_json_list(&row.linked_task_ids.unwrap_or_default()),
            to_millis(row.created_at.unwrap_or(now)),
            to_millis(row.updated_at.unwrap_or(now)),
        ],
        MoodEntry::from_row,
    )
}

pub async fn insert(db: &Db, rows: Vec<NewMoodEntry>) -> Result<(), DbError> {
    db.call(move |conn| {
        let tx = conn.transaction()?;
        for row in rows {
            insert_row(&tx, row)?;
        }
        tx.commit()
    })
    .await
}

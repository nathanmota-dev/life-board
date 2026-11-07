use serde::Serialize;

use crate::db::columns::{Timestamp, js_date, js_date_opt};
use crate::db::{Db, DbError};

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Thought {
    pub id: String,
    pub title: Option<String>,
    pub body: String,
    pub tags: Vec<String>,
    pub pinned: bool,
    pub linked_task_ids: Vec<String>,
    #[serde(with = "js_date")]
    pub created_at: Timestamp,
    #[serde(with = "js_date")]
    pub updated_at: Timestamp,
    #[serde(with = "js_date_opt")]
    pub deleted_at: Option<Timestamp>,
}

/// Defaults: body "", no tags, not pinned, no links, timestamps now.
#[derive(Debug, Clone, Default)]
pub struct NewThought {
    pub id: String,
    pub title: Option<String>,
    pub body: Option<String>,
    pub tags: Option<Vec<String>>,
    pub pinned: Option<bool>,
    pub linked_task_ids: Option<Vec<String>>,
    pub created_at: Option<Timestamp>,
    pub updated_at: Option<Timestamp>,
    pub deleted_at: Option<Timestamp>,
}

impl Thought {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        pending!(51, row)
    }
}

pub async fn insert(db: &Db, rows: Vec<NewThought>) -> Result<(), DbError> {
    pending!(51, db, rows)
}

use crate::clock;
use serde::Serialize;

use rusqlite::params;

use crate::db::columns::{
    Timestamp, get_bool, get_json_list, get_timestamp, get_timestamp_opt, js_date, js_date_opt, to_bool, to_json_list,
    to_millis,
};
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
        Ok(Self {
            id: row.get("id")?,
            title: row.get("title")?,
            body: row.get("body")?,
            tags: get_json_list(row, "tags")?,
            pinned: get_bool(row, "pinned")?,
            linked_task_ids: get_json_list(row, "linked_task_ids")?,
            created_at: get_timestamp(row, "created_at")?,
            updated_at: get_timestamp(row, "updated_at")?,
            deleted_at: get_timestamp_opt(row, "deleted_at")?,
        })
    }
}

/// Inserts one row with the column defaults filled in and returns it.
pub fn insert_row(conn: &rusqlite::Connection, row: NewThought) -> rusqlite::Result<Thought> {
    let now = clock::now();
    conn.query_row(
        "INSERT INTO thoughts (id, title, body, tags, pinned, linked_task_ids, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *",
        params![
            row.id,
            row.title,
            row.body.unwrap_or_default(),
            to_json_list(&row.tags.unwrap_or_default()),
            to_bool(row.pinned.unwrap_or(false)),
            to_json_list(&row.linked_task_ids.unwrap_or_default()),
            to_millis(row.created_at.unwrap_or(now)),
            to_millis(row.updated_at.unwrap_or(now)),
            row.deleted_at.map(to_millis),
        ],
        Thought::from_row,
    )
}

pub async fn insert(db: &Db, rows: Vec<NewThought>) -> Result<(), DbError> {
    db.call(move |conn| {
        let tx = conn.transaction()?;
        for row in rows {
            insert_row(&tx, row)?;
        }
        tx.commit()
    })
    .await
}

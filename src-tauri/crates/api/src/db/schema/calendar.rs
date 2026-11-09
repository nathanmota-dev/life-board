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
pub struct CalendarEvent {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    #[serde(with = "js_date")]
    pub start_at: Timestamp,
    #[serde(with = "js_date")]
    pub end_at: Timestamp,
    pub all_day: bool,
    pub location: Option<String>,
    pub color: String,
    pub linked_task_ids: Vec<String>,
    pub linked_thought_ids: Vec<String>,
    #[serde(with = "js_date")]
    pub created_at: Timestamp,
    #[serde(with = "js_date")]
    pub updated_at: Timestamp,
    #[serde(with = "js_date_opt")]
    pub deleted_at: Option<Timestamp>,
}

/// Defaults: `all_day` false, `color` "#3b82f6", empty link lists, timestamps now.
#[derive(Debug, Clone, Default)]
pub struct NewCalendarEvent {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub start_at: Timestamp,
    pub end_at: Timestamp,
    pub all_day: Option<bool>,
    pub location: Option<String>,
    pub color: Option<String>,
    pub linked_task_ids: Option<Vec<String>>,
    pub linked_thought_ids: Option<Vec<String>>,
    pub created_at: Option<Timestamp>,
    pub updated_at: Option<Timestamp>,
    pub deleted_at: Option<Timestamp>,
}

impl CalendarEvent {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            title: row.get("title")?,
            description: row.get("description")?,
            start_at: get_timestamp(row, "start_at")?,
            end_at: get_timestamp(row, "end_at")?,
            all_day: get_bool(row, "all_day")?,
            location: row.get("location")?,
            color: row.get("color")?,
            linked_task_ids: get_json_list(row, "linked_task_ids")?,
            linked_thought_ids: get_json_list(row, "linked_thought_ids")?,
            created_at: get_timestamp(row, "created_at")?,
            updated_at: get_timestamp(row, "updated_at")?,
            deleted_at: get_timestamp_opt(row, "deleted_at")?,
        })
    }
}

/// Inserts one row with the column defaults filled in and returns it.
pub fn insert_row(conn: &rusqlite::Connection, row: NewCalendarEvent) -> rusqlite::Result<CalendarEvent> {
    let now = clock::now();
    conn.query_row(
        "INSERT INTO calendar_events (id, title, description, start_at, end_at, all_day, location, color, linked_task_ids, linked_thought_ids, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *",
        params![
            row.id,
            row.title,
            row.description,
            to_millis(row.start_at),
            to_millis(row.end_at),
            to_bool(row.all_day.unwrap_or(false)),
            row.location,
            row.color.unwrap_or_else(|| DEFAULT_COLOR.to_owned()),
            to_json_list(&row.linked_task_ids.unwrap_or_default()),
            to_json_list(&row.linked_thought_ids.unwrap_or_default()),
            to_millis(row.created_at.unwrap_or(now)),
            to_millis(row.updated_at.unwrap_or(now)),
            row.deleted_at.map(to_millis),
        ],
        CalendarEvent::from_row,
    )
}

pub const DEFAULT_COLOR: &str = "#3b82f6";

pub async fn insert(db: &Db, rows: Vec<NewCalendarEvent>) -> Result<(), DbError> {
    db.call(move |conn| {
        let tx = conn.transaction()?;
        for row in rows {
            insert_row(&tx, row)?;
        }
        tx.commit()
    })
    .await
}

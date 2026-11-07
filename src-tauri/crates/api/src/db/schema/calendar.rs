use serde::Serialize;

use crate::db::columns::{Timestamp, js_date, js_date_opt};
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
        pending!(51, row)
    }
}

pub async fn insert(db: &Db, rows: Vec<NewCalendarEvent>) -> Result<(), DbError> {
    pending!(51, db, rows)
}

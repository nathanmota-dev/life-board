use serde::Serialize;

use crate::db::columns::{Timestamp, js_date, js_date_opt, string_enum};
use crate::db::{Db, DbError};

string_enum! {
    /// `TASK_STATUSES`.
    pub enum TaskStatus { Inbox = "inbox", Today = "today", Upcoming = "upcoming", Someday = "someday", Done = "done" }
}

string_enum! {
    /// `TASK_PRIORITIES`.
    pub enum TaskPriority { None = "none", Low = "low", Medium = "medium", High = "high" }
}

string_enum! {
    /// `TASK_COLORS`.
    pub enum TaskColor {
        Red = "red", Orange = "orange", Yellow = "yellow", Green = "green", Teal = "teal",
        Blue = "blue", Purple = "purple", Pink = "pink", Gray = "gray",
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: TaskStatus,
    pub priority: TaskPriority,
    #[serde(with = "js_date_opt")]
    pub due_at: Option<Timestamp>,
    #[serde(with = "js_date_opt")]
    pub completed_at: Option<Timestamp>,
    pub parent_task_id: Option<String>,
    pub tags: Vec<String>,
    pub linked_thought_ids: Vec<String>,
    pub pinned: bool,
    pub color: Option<TaskColor>,
    pub order: i64,
    #[serde(with = "js_date_opt")]
    pub archived_at: Option<Timestamp>,
    /// The local day (YYYY-MM-DD) the task was picked as one of that day's focus tasks.
    pub focus_day: Option<String>,
    #[serde(with = "js_date")]
    pub created_at: Timestamp,
    #[serde(with = "js_date")]
    pub updated_at: Timestamp,
    #[serde(with = "js_date_opt")]
    pub deleted_at: Option<Timestamp>,
}

/// Defaults: status inbox, priority none, empty lists, not pinned, order 0, timestamps now.
#[derive(Debug, Clone, Default)]
pub struct NewTask {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: Option<TaskStatus>,
    pub priority: Option<TaskPriority>,
    pub due_at: Option<Timestamp>,
    pub completed_at: Option<Timestamp>,
    pub parent_task_id: Option<String>,
    pub tags: Option<Vec<String>>,
    pub linked_thought_ids: Option<Vec<String>>,
    pub pinned: Option<bool>,
    pub color: Option<TaskColor>,
    pub order: Option<i64>,
    pub archived_at: Option<Timestamp>,
    pub focus_day: Option<String>,
    pub created_at: Option<Timestamp>,
    pub updated_at: Option<Timestamp>,
    pub deleted_at: Option<Timestamp>,
}

impl Task {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        pending!(51, row)
    }
}

pub async fn insert(db: &Db, rows: Vec<NewTask>) -> Result<(), DbError> {
    pending!(51, db, rows)
}

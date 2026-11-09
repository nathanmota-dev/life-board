use crate::clock;
use serde::Serialize;

use rusqlite::params;

use crate::db::columns::{
    Timestamp, get_bool, get_json_list, get_timestamp, get_timestamp_opt, js_date, js_date_opt, string_enum, to_bool,
    to_json_list, to_millis,
};
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
        Ok(Self {
            id: row.get("id")?,
            title: row.get("title")?,
            description: row.get("description")?,
            status: row.get("status")?,
            priority: row.get("priority")?,
            due_at: get_timestamp_opt(row, "due_at")?,
            completed_at: get_timestamp_opt(row, "completed_at")?,
            parent_task_id: row.get("parent_task_id")?,
            tags: get_json_list(row, "tags")?,
            linked_thought_ids: get_json_list(row, "linked_thought_ids")?,
            pinned: get_bool(row, "pinned")?,
            color: row.get("color")?,
            order: row.get("order")?,
            archived_at: get_timestamp_opt(row, "archived_at")?,
            focus_day: row.get("focus_day")?,
            created_at: get_timestamp(row, "created_at")?,
            updated_at: get_timestamp(row, "updated_at")?,
            deleted_at: get_timestamp_opt(row, "deleted_at")?,
        })
    }
}

/// Every column in table order, for `INSERT ... RETURNING` and `SELECT`.
pub const COLUMNS: &str = r#""id", "title", "description", "status", "priority", "due_at", "completed_at", "parent_task_id", "tags", "linked_thought_ids", "pinned", "color", "order", "archived_at", "focus_day", "created_at", "updated_at", "deleted_at""#;

/// Inserts one row with the column defaults filled in and returns it.
pub fn insert_row(conn: &rusqlite::Connection, row: NewTask) -> rusqlite::Result<Task> {
    let now = clock::now();
    conn.query_row(
        &format!(
            "INSERT INTO tasks ({COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *"
        ),
        params![
            row.id,
            row.title,
            row.description,
            row.status.unwrap_or(TaskStatus::Inbox),
            row.priority.unwrap_or(TaskPriority::None),
            row.due_at.map(to_millis),
            row.completed_at.map(to_millis),
            row.parent_task_id,
            to_json_list(&row.tags.unwrap_or_default()),
            to_json_list(&row.linked_thought_ids.unwrap_or_default()),
            to_bool(row.pinned.unwrap_or(false)),
            row.color,
            row.order.unwrap_or(0),
            row.archived_at.map(to_millis),
            row.focus_day,
            to_millis(row.created_at.unwrap_or(now)),
            to_millis(row.updated_at.unwrap_or(now)),
            row.deleted_at.map(to_millis),
        ],
        Task::from_row,
    )
}

pub async fn insert(db: &Db, rows: Vec<NewTask>) -> Result<(), DbError> {
    db.call(move |conn| {
        let tx = conn.transaction()?;
        for row in rows {
            insert_row(&tx, row)?;
        }
        tx.commit()
    })
    .await
}

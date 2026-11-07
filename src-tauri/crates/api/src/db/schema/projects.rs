use serde::Serialize;

use crate::db::columns::{Timestamp, js_date, js_date_opt, string_enum};
use crate::db::{Db, DbError};

string_enum! {
    /// `PROJECT_STATUSES`, in board column order.
    pub enum ProjectStatus { Idea = "idea", Planned = "planned", InProgress = "in_progress", Paused = "paused", Done = "done" }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: ProjectStatus,
    /// Position inside the project's status column.
    pub order: i64,
    #[serde(with = "js_date")]
    pub status_changed_at: Timestamp,
    pub pause_reason: Option<String>,
    #[serde(with = "js_date_opt")]
    pub archived_at: Option<Timestamp>,
    #[serde(with = "js_date")]
    pub created_at: Timestamp,
    #[serde(with = "js_date")]
    pub updated_at: Timestamp,
    #[serde(with = "js_date_opt")]
    pub deleted_at: Option<Timestamp>,
}

/// One row per status a project went through, newest last.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectStatusChange {
    pub id: String,
    pub project_id: String,
    pub status: ProjectStatus,
    pub pause_reason: Option<String>,
    #[serde(with = "js_date")]
    pub changed_at: Timestamp,
}

/// Defaults: description "", status idea, order 0, `status_changed_at` 0 (the SQL default).
#[derive(Debug, Clone, Default)]
pub struct NewProject {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub status: Option<ProjectStatus>,
    pub order: Option<i64>,
    pub status_changed_at: Option<Timestamp>,
    pub pause_reason: Option<String>,
    pub archived_at: Option<Timestamp>,
    pub created_at: Option<Timestamp>,
    pub updated_at: Option<Timestamp>,
    pub deleted_at: Option<Timestamp>,
}

#[derive(Debug, Clone, Default)]
pub struct NewProjectStatusChange {
    pub id: String,
    pub project_id: String,
    pub status: ProjectStatus,
    pub pause_reason: Option<String>,
    pub changed_at: Option<Timestamp>,
}

impl Project {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        pending!(52, row)
    }
}

impl ProjectStatusChange {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        pending!(52, row)
    }
}

pub async fn insert_projects(db: &Db, rows: Vec<NewProject>) -> Result<(), DbError> {
    pending!(52, db, rows)
}

pub async fn insert_status_changes(db: &Db, rows: Vec<NewProjectStatusChange>) -> Result<(), DbError> {
    pending!(52, db, rows)
}

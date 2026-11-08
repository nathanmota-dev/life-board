use crate::clock;
use serde::Serialize;

use rusqlite::params;

use crate::db::columns::{Timestamp, get_timestamp, get_timestamp_opt, js_date, js_date_opt, string_enum, to_millis};
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
        Ok(Self {
            id: row.get("id")?,
            title: row.get("title")?,
            description: row.get("description")?,
            status: row.get("status")?,
            order: row.get("order")?,
            status_changed_at: get_timestamp(row, "status_changed_at")?,
            pause_reason: row.get("pause_reason")?,
            archived_at: get_timestamp_opt(row, "archived_at")?,
            created_at: get_timestamp(row, "created_at")?,
            updated_at: get_timestamp(row, "updated_at")?,
            deleted_at: get_timestamp_opt(row, "deleted_at")?,
        })
    }
}

impl ProjectStatusChange {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            project_id: row.get("project_id")?,
            status: row.get("status")?,
            pause_reason: row.get("pause_reason")?,
            changed_at: get_timestamp(row, "changed_at")?,
        })
    }
}

/// Inserts one project with the column defaults filled in and returns it.
pub fn insert_project(conn: &rusqlite::Connection, row: NewProject) -> rusqlite::Result<Project> {
    let now = clock::now();
    conn.query_row(
        r#"INSERT INTO projects (id, title, description, status, "order", status_changed_at, pause_reason, archived_at, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *"#,
        params![
            row.id,
            row.title,
            row.description.unwrap_or_default(),
            row.status.unwrap_or(ProjectStatus::Idea),
            row.order.unwrap_or(0),
            row.status_changed_at.map_or(0, to_millis),
            row.pause_reason,
            row.archived_at.map(to_millis),
            to_millis(row.created_at.unwrap_or(now)),
            to_millis(row.updated_at.unwrap_or(now)),
            row.deleted_at.map(to_millis),
        ],
        Project::from_row,
    )
}

/// Inserts one status change, stamped now unless `changed_at` says otherwise.
pub fn insert_status_change(conn: &rusqlite::Connection, row: NewProjectStatusChange) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO project_status_changes (id, project_id, status, pause_reason, changed_at) VALUES (?, ?, ?, ?, ?)",
        params![
            row.id,
            row.project_id,
            row.status,
            row.pause_reason,
            to_millis(row.changed_at.unwrap_or_else(clock::now))
        ],
    )?;
    Ok(())
}

pub async fn insert_projects(db: &Db, rows: Vec<NewProject>) -> Result<(), DbError> {
    db.call(move |conn| {
        let tx = conn.transaction()?;
        for row in rows {
            insert_project(&tx, row)?;
        }
        tx.commit()
    })
    .await
}

pub async fn insert_status_changes(db: &Db, rows: Vec<NewProjectStatusChange>) -> Result<(), DbError> {
    db.call(move |conn| {
        let tx = conn.transaction()?;
        for row in rows {
            insert_status_change(&tx, row)?;
        }
        tx.commit()
    })
    .await
}

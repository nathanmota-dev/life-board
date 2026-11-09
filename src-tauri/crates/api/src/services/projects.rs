use crate::clock;
use chrono::TimeDelta;
use rusqlite::types::Value;
use rusqlite::{Connection, params};

use crate::db::Db;
use crate::db::columns::{Timestamp, new_id, to_millis};
use crate::db::schema::projects::{
    NewProject, NewProjectStatusChange, Project, ProjectStatus, ProjectStatusChange, insert_project,
    insert_status_change,
};
use crate::dto::Items;
use crate::dto::projects::{CreateProjectBody, ListProjectsQuery, MoveProjectBody, UpdateProjectBody};
use crate::error::{ApiError, ApiResult};
use crate::services::query::{Assignments, enum_value, query_all, query_first, time_value};

/// Done projects leave the board this long after reaching Done.
pub const ARCHIVE_AFTER_MS: i64 = 14 * 24 * 60 * 60 * 1000;

const SELECT: &str = "SELECT * FROM projects";
const ON_BOARD: &str = "deleted_at IS NULL AND archived_at IS NULL";
const BOARD_ORDER: &str = r#""order" ASC, created_at ASC, id ASC"#;

#[derive(Clone)]
pub struct ProjectsService {
    db: Db,
}

impl ProjectsService {
    pub fn new(db: Db) -> Self {
        Self { db }
    }

    /// The board (archiving stale Done projects first), or the archived projects, newest first.
    pub async fn list(&self, query: ListProjectsQuery) -> ApiResult<Items<Project>> {
        Ok(self.db.call(move |conn| list(conn, query.archived)).await?)
    }

    /// New projects go to the top of their column.
    pub async fn create(&self, input: CreateProjectBody) -> ApiResult<Project> {
        Ok(self
            .db
            .call(move |conn| {
                let tx = conn.transaction()?;
                let status = input.status.unwrap_or(ProjectStatus::Idea);
                let column = column_ids(&tx, status)?;
                let row = insert_project(
                    &tx,
                    NewProject {
                        id: new_id(),
                        title: input.title,
                        description: input.description,
                        status: Some(status),
                        order: Some(0),
                        status_changed_at: Some(clock::now()),
                        pause_reason: stored_reason(status, input.pause_reason),
                        ..Default::default()
                    },
                )?;
                let mut ids = vec![row.id.clone()];
                ids.extend(column);
                write_order(&tx, &ids)?;
                record_status(&tx, &row)?;
                tx.commit()?;
                Ok(row)
            })
            .await?)
    }

    /// Any project that isn't deleted, archived ones included.
    pub async fn get(&self, id: &str) -> ApiResult<Project> {
        let id = id.to_owned();
        self.db.call(move |conn| find(conn, &id)).await?.ok_or_else(not_found)
    }

    /// Status changes, newest first.
    pub async fn history(&self, id: &str) -> ApiResult<Items<ProjectStatusChange>> {
        self.get(id).await?;
        let id = id.to_owned();
        let items = self
            .db
            .call(move |conn| {
                query_all(
                    conn,
                    "SELECT * FROM project_status_changes WHERE project_id = ? ORDER BY changed_at DESC, id DESC",
                    &[Value::Text(id)],
                    ProjectStatusChange::from_row,
                )
            })
            .await?;
        Ok(Items { items })
    }

    /// A status change moves the project to the top of its new column.
    pub async fn update(&self, id: &str, input: UpdateProjectBody) -> ApiResult<Project> {
        let id = id.to_owned();
        self.db
            .call(move |conn| {
                let tx = conn.transaction()?;
                let Some(current) = find_on_board(&tx, &id)? else { return Ok(Err(not_found())) };
                let UpdateProjectBody { title, description, status, pause_reason } = input;
                if let Some(status) = status.filter(|status| *status != current.status) {
                    place(&tx, &current, status, 0, pause_reason.clone())?;
                }
                let mut set = Assignments::new();
                set.maybe("title", title).maybe("description", description);
                // Moving into Paused already stored the reason; this only edits the reason of a project that stays paused.
                let stays_paused = current.status == ProjectStatus::Paused
                    && status.unwrap_or(ProjectStatus::Paused) == ProjectStatus::Paused;
                if stays_paused && let Some(reason) = pause_reason {
                    set.set("pause_reason", non_empty(reason));
                }
                set.set("updated_at", time_value(clock::now()));
                let set = set.into_fragment();
                let mut params = set.params;
                params.push(Value::Text(id.clone()));
                let row = query_first(
                    &tx,
                    &format!("UPDATE projects SET {} WHERE id = ? RETURNING *", set.sql),
                    &params,
                    Project::from_row,
                )?;
                tx.commit()?;
                Ok(row.ok_or_else(not_found))
            })
            .await?
    }

    /// `move`: drops the project at `order` in the `status` column, keeping both columns gapless.
    pub async fn r#move(&self, id: &str, input: MoveProjectBody) -> ApiResult<Items<Project>> {
        let id = id.to_owned();
        self.db
            .call(move |conn| {
                let tx = conn.transaction()?;
                let Some(current) = find_on_board(&tx, &id)? else { return Ok(Err(not_found())) };
                place(&tx, &current, input.status, input.order, input.pause_reason)?;
                tx.commit()?;
                list(conn, false).map(Ok)
            })
            .await?
    }

    /// `400 project_not_done` unless it is Done.
    pub async fn archive(&self, id: &str) -> ApiResult<Project> {
        let id = id.to_owned();
        self.db
            .call(move |conn| {
                let Some(project) = find_on_board(conn, &id)? else { return Ok(Err(not_found())) };
                if project.status != ProjectStatus::Done {
                    return Ok(Err(ApiError::bad_request("project_not_done", "Only done projects can be archived.")));
                }
                let row = query_first(
                    conn,
                    "UPDATE projects SET archived_at = ? WHERE id = ? RETURNING *",
                    &[time_value(clock::now()), Value::Text(id)],
                    Project::from_row,
                )?;
                Ok(row.ok_or_else(not_found))
            })
            .await?
    }

    /// Undoes a delete, or brings an archived project back to the top of Done.
    /// The latter restarts its time in Done, so it isn't archived again right away.
    pub async fn restore(&self, id: &str) -> ApiResult<Project> {
        let id = id.to_owned();
        self.db
            .call(move |conn| {
                let project = query_first(
                    conn,
                    &format!("{SELECT} WHERE id = ? AND (deleted_at IS NOT NULL OR archived_at IS NOT NULL)"),
                    &[Value::Text(id.clone())],
                    Project::from_row,
                )?;
                let Some(project) = project else { return Ok(Err(not_found())) };
                if project.deleted_at.is_some() {
                    let row = query_first(
                        conn,
                        "UPDATE projects SET deleted_at = NULL WHERE id = ? RETURNING *",
                        &[Value::Text(id)],
                        Project::from_row,
                    )?;
                    return Ok(row.ok_or_else(not_found));
                }
                let tx = conn.transaction()?;
                let mut ids = vec![id.clone()];
                ids.extend(column_ids(&tx, ProjectStatus::Done)?);
                write_order(&tx, &ids)?;
                let now = time_value(clock::now());
                let row = query_first(
                    &tx,
                    "UPDATE projects SET archived_at = NULL, status = ?, pause_reason = NULL, status_changed_at = ?, updated_at = ? WHERE id = ? RETURNING *",
                    &[enum_value(ProjectStatus::Done), now.clone(), now, Value::Text(id)],
                    Project::from_row,
                )?;
                if let Some(row) = &row {
                    record_status(&tx, row)?;
                }
                tx.commit()?;
                Ok(row.ok_or_else(not_found))
            })
            .await?
    }

    /// Soft delete.
    pub async fn remove(&self, id: &str) -> ApiResult<()> {
        let id = id.to_owned();
        let row = self
            .db
            .call(move |conn| {
                query_first(
                    conn,
                    "UPDATE projects SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL RETURNING id",
                    &[time_value(clock::now()), Value::Text(id)],
                    |row| row.get::<_, String>(0),
                )
            })
            .await?;
        row.map(|_| ()).ok_or_else(not_found)
    }
}

fn not_found() -> ApiError {
    ApiError::not_found("Project not found.")
}

/// `pauseReason || null`.
fn non_empty(reason: Option<String>) -> Option<String> {
    reason.filter(|reason| !reason.is_empty())
}

/// Only Paused projects keep a reason.
fn stored_reason(status: ProjectStatus, reason: Option<Option<String>>) -> Option<String> {
    if status == ProjectStatus::Paused { non_empty(reason.flatten()) } else { None }
}

fn list(conn: &Connection, archived: bool) -> rusqlite::Result<Items<Project>> {
    if archived {
        let items = query_all(
            conn,
            &format!("{SELECT} WHERE deleted_at IS NULL AND archived_at IS NOT NULL ORDER BY archived_at DESC, id ASC"),
            &[],
            Project::from_row,
        )?;
        return Ok(Items { items });
    }
    archive_stale(conn, clock::now())?;
    let items = query_all(conn, &format!("{SELECT} WHERE {ON_BOARD} ORDER BY {BOARD_ORDER}"), &[], Project::from_row)?;
    Ok(Items { items })
}

fn archive_stale(conn: &Connection, now: Timestamp) -> rusqlite::Result<()> {
    let limit = now - TimeDelta::milliseconds(ARCHIVE_AFTER_MS);
    conn.execute(
        &format!("UPDATE projects SET archived_at = ? WHERE {ON_BOARD} AND status = ? AND status_changed_at < ?"),
        params![to_millis(now), ProjectStatus::Done, to_millis(limit)],
    )?;
    Ok(())
}

fn find(conn: &Connection, id: &str) -> rusqlite::Result<Option<Project>> {
    query_first(
        conn,
        &format!("{SELECT} WHERE id = ? AND deleted_at IS NULL"),
        &[Value::Text(id.to_owned())],
        Project::from_row,
    )
}

fn find_on_board(conn: &Connection, id: &str) -> rusqlite::Result<Option<Project>> {
    query_first(
        conn,
        &format!("{SELECT} WHERE id = ? AND {ON_BOARD}"),
        &[Value::Text(id.to_owned())],
        Project::from_row,
    )
}

fn place(
    conn: &Connection,
    project: &Project,
    status: ProjectStatus,
    order: i64,
    pause_reason: Option<Option<String>>,
) -> rusqlite::Result<()> {
    let mut target: Vec<String> = column_ids(conn, status)?.into_iter().filter(|id| *id != project.id).collect();
    let index = usize::try_from(order).unwrap_or(usize::MAX).min(target.len());
    target.insert(index, project.id.clone());
    write_order(conn, &target)?;
    if status == project.status {
        return Ok(());
    }

    let previous: Vec<String> = column_ids(conn, project.status)?.into_iter().filter(|id| *id != project.id).collect();
    write_order(conn, &previous)?;
    let now = time_value(clock::now());
    let row = query_first(
        conn,
        "UPDATE projects SET status = ?, status_changed_at = ?, pause_reason = ?, updated_at = ? WHERE id = ? RETURNING *",
        &[
            enum_value(status),
            now.clone(),
            stored_reason(status, pause_reason).into(),
            now,
            Value::Text(project.id.clone()),
        ],
        Project::from_row,
    )?;
    if let Some(row) = row {
        record_status(conn, &row)?;
    }
    Ok(())
}

fn column_ids(conn: &Connection, status: ProjectStatus) -> rusqlite::Result<Vec<String>> {
    query_all(
        conn,
        &format!("SELECT id FROM projects WHERE {ON_BOARD} AND status = ? ORDER BY {BOARD_ORDER}"),
        &[enum_value(status)],
        |row| row.get(0),
    )
}

fn write_order(conn: &Connection, ids: &[String]) -> rusqlite::Result<()> {
    for (order, id) in (0_i64..).zip(ids) {
        conn.execute(r#"UPDATE projects SET "order" = ? WHERE id = ?"#, params![order, id])?;
    }
    Ok(())
}

fn record_status(conn: &Connection, project: &Project) -> rusqlite::Result<()> {
    insert_status_change(
        conn,
        NewProjectStatusChange {
            id: new_id(),
            project_id: project.id.clone(),
            status: project.status,
            pause_reason: project.pause_reason.clone(),
            changed_at: Some(project.status_changed_at),
        },
    )
}

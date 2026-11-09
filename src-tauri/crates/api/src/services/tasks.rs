mod store;
use store::*;

use crate::clock;
use std::collections::HashSet;

use rusqlite::params;
use rusqlite::types::Value;
use serde::Serialize;

use crate::db::Db;
use crate::db::columns::{to_bool, to_millis};
use crate::db::schema::tasks::Task;
use crate::dto::tasks::{CreateTaskBody, ListTasksQuery, ReorderTasksBody, UpdateTaskBody};
use crate::error::{ApiError, ApiResult};
use crate::services::query::{placeholders, query_all, query_first};

/// How many tasks can be picked as the focus of a single day.
pub const FOCUS_LIMIT: i64 = 3;

/// `TaskWithChildren`: a task and its checklist items.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TaskWithChildren {
    #[serde(flatten)]
    pub task: Task,
    pub children: Vec<Task>,
}

/// `Task[] | TaskWithChildren[]`: `include=children` returns the board with checklists.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(untagged)]
pub enum TaskList {
    Tasks(Vec<Task>),
    WithChildren(Vec<TaskWithChildren>),
}

impl TaskList {
    /// The top-level tasks, either way.
    pub fn tasks(&self) -> Vec<&Task> {
        match self {
            Self::Tasks(tasks) => tasks.iter().collect(),
            Self::WithChildren(tasks) => tasks.iter().map(|item| &item.task).collect(),
        }
    }

    pub fn len(&self) -> usize {
        match self {
            Self::Tasks(tasks) => tasks.len(),
            Self::WithChildren(tasks) => tasks.len(),
        }
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }
}

#[derive(Clone)]
pub struct TasksService {
    db: Db,
}

impl TasksService {
    pub fn new(db: Db) -> Self {
        Self { db }
    }

    /// Top-level tasks (or a checklist with `parentTaskId`). Open first, then by
    /// priority and due date; the board order with `include=children`.
    pub async fn list(&self, query: ListTasksQuery) -> ApiResult<TaskList> {
        Ok(self.db.call(move |conn| list(conn, &query)).await?)
    }

    /// New top-level tasks go to the top of the board; new checklist items to the end of their list.
    pub async fn create(&self, input: CreateTaskBody) -> ApiResult<TaskWithChildren> {
        self.db
            .call(move |conn| {
                let tx = conn.transaction()?;
                let created = create(&tx, input)?;
                if created.is_ok() {
                    tx.commit()?;
                }
                Ok(created)
            })
            .await?
    }

    pub async fn get(&self, id: &str) -> ApiResult<Task> {
        let id = id.to_owned();
        self.db.call(move |conn| find(conn, &id)).await?.ok_or_else(not_found)
    }

    /// Moving into "done" stamps `completedAt`; moving out of it clears it. `400 focus_limit`.
    pub async fn update(&self, id: &str, input: UpdateTaskBody) -> ApiResult<Task> {
        let id = id.to_owned();
        self.db.call(move |conn| update(conn, &id, input)).await?
    }

    /// Saves a drag on the board; `400 invalid_order` unless it lists existing top-level tasks once.
    pub async fn reorder(&self, items: ReorderTasksBody) -> ApiResult<()> {
        self.db
            .call(move |conn| {
                let tx = conn.transaction()?;
                let ids: Vec<Value> = items.0.iter().map(|item| Value::Text(item.id.clone())).collect();
                let found: Vec<String> = query_all(
                    &tx,
                    &format!(
                        "SELECT id FROM tasks WHERE id IN ({}) AND deleted_at IS NULL AND parent_task_id IS NULL",
                        placeholders(ids.len())
                    ),
                    &ids,
                    |row| row.get(0),
                )?;
                let unique: HashSet<&str> = items.0.iter().map(|item| item.id.as_str()).collect();
                if unique.len() != items.0.len() || found.len() != items.0.len() {
                    return Ok(Err(ApiError::bad_request(
                        "invalid_order",
                        "The order must list existing tasks exactly once.",
                    )));
                }
                for item in &items.0 {
                    tx.execute(
                        r#"UPDATE tasks SET "order" = ?, pinned = ? WHERE id = ?"#,
                        params![item.order, to_bool(item.pinned), item.id],
                    )?;
                }
                tx.commit()?;
                Ok(Ok(()))
            })
            .await?
    }

    /// Soft deletes the task and its checklist items with the same `deletedAt`.
    pub async fn remove(&self, id: &str) -> ApiResult<()> {
        let id = id.to_owned();
        let deleted_at = to_millis(clock::now());
        let found = self
            .db
            .call(move |conn| {
                let found = query_first(
                    conn,
                    "UPDATE tasks SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL RETURNING id",
                    &[Value::Integer(deleted_at), Value::Text(id.clone())],
                    |row| row.get::<_, String>(0),
                )?;
                if found.is_some() {
                    conn.execute(
                        "UPDATE tasks SET deleted_at = ? WHERE parent_task_id = ? AND deleted_at IS NULL",
                        params![deleted_at, id],
                    )?;
                }
                Ok(found)
            })
            .await?;
        found.map(|_| ()).ok_or_else(not_found)
    }

    /// Undoes `remove`: brings back the items deleted alongside the task.
    pub async fn restore(&self, id: &str) -> ApiResult<Task> {
        let owned = id.to_owned();
        let restored = self
            .db
            .call(move |conn| {
                let deleted_at = query_first(
                    conn,
                    "SELECT deleted_at FROM tasks WHERE id = ? AND deleted_at IS NOT NULL",
                    &[Value::Text(owned.clone())],
                    |row| row.get::<_, Option<i64>>(0),
                )?
                .flatten();
                let Some(deleted_at) = deleted_at else { return Ok(false) };
                conn.execute(
                    "UPDATE tasks SET deleted_at = NULL WHERE (id = ?1 OR parent_task_id = ?1) AND deleted_at = ?2",
                    params![owned, deleted_at],
                )?;
                Ok(true)
            })
            .await?;
        if !restored {
            return Err(not_found());
        }
        self.get(id).await
    }
}

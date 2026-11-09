use crate::clock;
use std::collections::HashSet;

use rusqlite::types::Value;
use rusqlite::{Connection, params};
use serde::Serialize;

use crate::db::Db;
use crate::db::columns::{new_id, to_bool, to_millis};
use crate::db::schema::tasks::{NewTask, Task, TaskStatus, insert_row};
use crate::dto::tasks::{CreateTaskBody, ListTasksQuery, ReorderTasksBody, TaskInclude, UpdateTaskBody};
use crate::error::{ApiError, ApiResult};
use crate::services::query::{
    Assignments, SqlFragment, and, enum_opt, enum_value, json_array_contains, list_value, or, placeholders, query_all,
    query_first, search_columns, time_opt, time_value,
};

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

fn not_found() -> ApiError {
    ApiError::not_found("Task not found.")
}

const SELECT: &str = "SELECT * FROM tasks";

fn find(conn: &Connection, id: &str) -> rusqlite::Result<Option<Task>> {
    query_first(
        conn,
        &format!("{SELECT} WHERE id = ? AND deleted_at IS NULL"),
        &[Value::Text(id.to_owned())],
        Task::from_row,
    )
}

/// JavaScript truthiness of an optional string (`""` is false).
fn truthy(value: &Option<String>) -> Option<&str> {
    value.as_deref().filter(|value| !value.is_empty())
}

fn list(conn: &Connection, query: &ListTasksQuery) -> rusqlite::Result<TaskList> {
    let parent = truthy(&query.parent_task_id);
    // Subtasks only ever show up under their parent, never as top-level items.
    let mut conditions = vec![
        SqlFragment::raw("tasks.deleted_at IS NULL"),
        match parent {
            Some(parent) => SqlFragment::new("tasks.parent_task_id = ?", vec![Value::Text(parent.to_owned())]),
            None => SqlFragment::raw("tasks.parent_task_id IS NULL"),
        },
        SqlFragment::raw(if query.archived == Some(true) {
            "tasks.archived_at IS NOT NULL"
        } else {
            "tasks.archived_at IS NULL"
        }),
    ];
    if let Some(status) = query.status {
        conditions.push(SqlFragment::new("tasks.status = ?", vec![enum_value(status)]));
    }
    if let Some(search) = truthy(&query.search) {
        conditions.push(matches_search(search));
    }
    if let Some(tag) = truthy(&query.tag) {
        conditions.push(json_array_contains("tasks.tags", tag));
    }
    if let Some(pinned) = query.pinned {
        conditions.push(SqlFragment::new("tasks.pinned = ?", vec![Value::Integer(to_bool(pinned))]));
    }
    if let Some(color) = query.color {
        conditions.push(SqlFragment::new("tasks.color = ?", vec![enum_value(color)]));
    }
    if let Some(focus_day) = truthy(&query.focus_day) {
        conditions.push(SqlFragment::new("tasks.focus_day = ?", vec![Value::Text(focus_day.to_owned())]));
    }
    let filter = and(conditions);
    let mut params = filter.params;
    params.push(Value::Integer(query.limit));

    if query.include == Some(TaskInclude::Children) {
        // The board's hand-made order, newest first among cards never moved.
        let rows = query_all(
            conn,
            &format!(
                r#"{SELECT} WHERE {} ORDER BY tasks."order" ASC, tasks.created_at DESC, tasks.id ASC LIMIT ?"#,
                filter.sql
            ),
            &params,
            Task::from_row,
        )?;
        return with_children(conn, rows).map(TaskList::WithChildren);
    }

    let ordering = if parent.is_some() {
        // A checklist keeps the order its items were written in.
        r#"tasks."order" ASC, tasks.created_at ASC, tasks.id ASC"#
    } else {
        // Open tasks first, then by priority, then by due date (undated last).
        "case tasks.status when 'done' then 1 else 0 end, case tasks.priority when 'high' then 0 when 'medium' then 1 when 'low' then 2 else 3 end, tasks.due_at nulls last, tasks.created_at DESC"
    };
    query_all(conn, &format!("{SELECT} WHERE {} ORDER BY {ordering} LIMIT ?", filter.sql), &params, Task::from_row)
        .map(TaskList::Tasks)
}

/// Title or notes match, or one of the task's checklist items does.
fn matches_search(term: &str) -> SqlFragment {
    let child = and(vec![
        SqlFragment::raw("children.parent_task_id = tasks.id"),
        SqlFragment::raw("children.deleted_at is null"),
        search_columns(&["children.title"], term),
    ]);
    or(vec![
        search_columns(&["tasks.title", "tasks.description"], term),
        SqlFragment::new(format!("exists (select children.id from tasks children where {})", child.sql), child.params),
    ])
}

fn with_children(conn: &Connection, rows: Vec<Task>) -> rusqlite::Result<Vec<TaskWithChildren>> {
    let items = if rows.is_empty() {
        Vec::new()
    } else {
        let ids: Vec<Value> = rows.iter().map(|row| Value::Text(row.id.clone())).collect();
        query_all(
            conn,
            &format!(
                r#"{SELECT} WHERE parent_task_id IN ({}) AND deleted_at IS NULL ORDER BY "order" ASC, created_at ASC, id ASC"#,
                placeholders(ids.len())
            ),
            &ids,
            Task::from_row,
        )?
    };
    Ok(rows
        .into_iter()
        .map(|task| {
            let children =
                items.iter().filter(|item| item.parent_task_id.as_deref() == Some(task.id.as_str())).cloned().collect();
            TaskWithChildren { task, children }
        })
        .collect())
}

/// Done tasks keep their focus day, so they still take one of the day's slots;
/// archived ones don't show and don't count.
fn assert_focus_slot(conn: &Connection, focus_day: &str, task_id: Option<&str>) -> rusqlite::Result<ApiResult<()>> {
    let mut sql = "SELECT count(*) FROM tasks WHERE focus_day = ? AND deleted_at IS NULL AND archived_at IS NULL AND parent_task_id IS NULL".to_owned();
    let mut params = vec![Value::Text(focus_day.to_owned())];
    if let Some(task_id) = task_id {
        sql.push_str(" AND id <> ?");
        params.push(Value::Text(task_id.to_owned()));
    }
    let taken = query_first(conn, &sql, &params, |row| row.get::<_, i64>(0))?.unwrap_or(0);
    Ok(if taken >= FOCUS_LIMIT {
        Err(ApiError::bad_request("focus_limit", format!("A day can have at most {FOCUS_LIMIT} focus tasks.")))
    } else {
        Ok(())
    })
}

fn create(conn: &Connection, input: CreateTaskBody) -> rusqlite::Result<ApiResult<TaskWithChildren>> {
    let completed_at = (input.status == Some(TaskStatus::Done)).then(clock::now);
    if let Some(focus_day) = input.focus_day.as_ref().and_then(truthy)
        && let Err(error) = assert_focus_slot(conn, focus_day, None)?
    {
        return Ok(Err(error));
    }
    let parent = input.parent_task_id.as_ref().and_then(truthy).map(str::to_owned);
    let (first, last) = match &parent {
        Some(parent) => query_first(
            conn,
            r#"SELECT min("order"), max("order") FROM tasks WHERE deleted_at IS NULL AND parent_task_id = ?"#,
            &[Value::Text(parent.clone())],
            |row| Ok((row.get::<_, Option<i64>>(0)?, row.get::<_, Option<i64>>(1)?)),
        )?,
        None => query_first(
            conn,
            r#"SELECT min("order"), max("order") FROM tasks WHERE deleted_at IS NULL AND parent_task_id IS NULL"#,
            &[],
            |row| Ok((row.get::<_, Option<i64>>(0)?, row.get::<_, Option<i64>>(1)?)),
        )?,
    }
    .unwrap_or((None, None));
    let order = if parent.is_some() { last.unwrap_or(-1) + 1 } else { first.unwrap_or(1) - 1 };

    let task = insert_row(
        conn,
        NewTask {
            id: new_id(),
            title: input.title,
            description: input.description.flatten(),
            status: input.status,
            priority: input.priority,
            due_at: input.due_at.flatten(),
            completed_at,
            parent_task_id: input.parent_task_id.flatten(),
            tags: input.tags,
            linked_thought_ids: input.linked_thought_ids,
            pinned: input.pinned,
            color: input.color.flatten(),
            order: Some(order),
            focus_day: input.focus_day.flatten(),
            ..Default::default()
        },
    )?;
    let children = input
        .items
        .unwrap_or_default()
        .into_iter()
        .zip(0_i64..)
        .map(|(title, order)| {
            insert_row(
                conn,
                NewTask {
                    id: new_id(),
                    title,
                    parent_task_id: Some(task.id.clone()),
                    order: Some(order),
                    ..Default::default()
                },
            )
        })
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(Ok(TaskWithChildren { task, children }))
}

fn update(conn: &Connection, id: &str, input: UpdateTaskBody) -> rusqlite::Result<ApiResult<Task>> {
    // Moving into "done" stamps completedAt; moving out of it clears it.
    let mut completed_at = input.completed_at;
    match input.status {
        Some(TaskStatus::Done) if completed_at.is_none() => completed_at = Some(Some(clock::now())),
        Some(status) if status != TaskStatus::Done => completed_at = Some(None),
        _ => {}
    }
    if let Some(focus_day) = input.focus_day.as_ref().and_then(truthy)
        && let Err(error) = assert_focus_slot(conn, focus_day, Some(id))?
    {
        return Ok(Err(error));
    }

    let mut set = Assignments::new();
    set.maybe("title", input.title)
        .maybe("description", input.description)
        .maybe("status", input.status.map(enum_value))
        .maybe("priority", input.priority.map(enum_value))
        .maybe("due_at", input.due_at.map(time_opt))
        .maybe("parent_task_id", input.parent_task_id)
        .maybe("tags", input.tags.as_deref().map(list_value))
        .maybe("linked_thought_ids", input.linked_thought_ids.as_deref().map(list_value))
        .maybe("pinned", input.pinned.map(to_bool))
        .maybe("color", input.color.map(enum_opt))
        .maybe("focus_day", input.focus_day)
        .maybe("completed_at", completed_at.map(time_opt))
        .maybe("archived_at", input.archived_at.map(time_opt))
        .set("updated_at", time_value(clock::now()));
    let set = set.into_fragment();
    let mut params = set.params;
    params.push(Value::Text(id.to_owned()));
    let row = query_first(
        conn,
        &format!("UPDATE tasks SET {} WHERE id = ? AND deleted_at IS NULL RETURNING *", set.sql),
        &params,
        Task::from_row,
    )?;
    Ok(row.ok_or_else(not_found))
}

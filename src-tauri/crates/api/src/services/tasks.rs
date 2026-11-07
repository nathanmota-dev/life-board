use serde::Serialize;

use crate::db::Db;
use crate::db::schema::tasks::Task;
use crate::dto::tasks::{CreateTaskBody, ListTasksQuery, ReorderTasksBody, UpdateTaskBody};
use crate::error::ApiResult;

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
        pending!(51, self.db, query)
    }

    /// New top-level tasks go to the top of the board; new checklist items to the end of their list.
    pub async fn create(&self, input: CreateTaskBody) -> ApiResult<TaskWithChildren> {
        pending!(51, self.db, input)
    }

    pub async fn get(&self, id: &str) -> ApiResult<Task> {
        pending!(51, self.db, id)
    }

    /// Moving into "done" stamps `completedAt`; moving out of it clears it. `400 focus_limit`.
    pub async fn update(&self, id: &str, input: UpdateTaskBody) -> ApiResult<Task> {
        pending!(51, self.db, id, input)
    }

    /// Saves a drag on the board; `400 invalid_order` unless it lists existing top-level tasks once.
    pub async fn reorder(&self, items: ReorderTasksBody) -> ApiResult<()> {
        pending!(51, self.db, items)
    }

    /// Soft deletes the task and its checklist items with the same `deletedAt`.
    pub async fn remove(&self, id: &str) -> ApiResult<()> {
        pending!(51, self.db, id)
    }

    /// Undoes `remove`: brings back the items deleted alongside the task.
    pub async fn restore(&self, id: &str) -> ApiResult<Task> {
        pending!(51, self.db, id)
    }
}

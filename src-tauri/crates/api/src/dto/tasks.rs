use serde_json::Value;

use super::common::{
    Ctx, DAY_KEY, Dto, Fields, boolean, date, id_list, int, limit, list, object, one_of, query_bool, tag_list, text,
};
use crate::db::columns::{Timestamp, string_enum};
use crate::db::schema::tasks::{TaskColor, TaskPriority, TaskStatus};
use crate::error::Issue;

string_enum! {
    /// `listTasksQuery.include`.
    pub enum TaskInclude { Children = "children" }
}

/// `createTaskBody`: `title` required; `items` are up to 100 checklist titles, trimmed.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct CreateTaskBody {
    pub title: String,
    pub description: Option<Option<String>>,
    pub status: Option<TaskStatus>,
    pub priority: Option<TaskPriority>,
    pub due_at: Option<Option<Timestamp>>,
    pub parent_task_id: Option<Option<String>>,
    pub tags: Option<Vec<String>>,
    pub linked_thought_ids: Option<Vec<String>>,
    pub pinned: Option<bool>,
    pub color: Option<Option<TaskColor>>,
    pub focus_day: Option<Option<String>>,
    pub items: Option<Vec<String>>,
}

/// `updateTaskBody`: the task fields plus `completedAt` and `archivedAt`.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct UpdateTaskBody {
    pub title: Option<String>,
    pub description: Option<Option<String>>,
    pub status: Option<TaskStatus>,
    pub priority: Option<TaskPriority>,
    pub due_at: Option<Option<Timestamp>>,
    pub parent_task_id: Option<Option<String>>,
    pub tags: Option<Vec<String>>,
    pub linked_thought_ids: Option<Vec<String>>,
    pub pinned: Option<bool>,
    pub color: Option<Option<TaskColor>>,
    pub focus_day: Option<Option<String>>,
    pub completed_at: Option<Option<Timestamp>>,
    pub archived_at: Option<Option<Timestamp>>,
}

/// `listTasksQuery`: `limit` 1–500, default 50; booleans are `"true"`/`"false"`.
#[derive(Debug, Clone, PartialEq)]
pub struct ListTasksQuery {
    pub status: Option<TaskStatus>,
    pub limit: i64,
    pub search: Option<String>,
    pub parent_task_id: Option<String>,
    pub tag: Option<String>,
    pub include: Option<TaskInclude>,
    pub pinned: Option<bool>,
    pub color: Option<TaskColor>,
    pub archived: Option<bool>,
    pub focus_day: Option<String>,
}

impl Default for ListTasksQuery {
    fn default() -> Self {
        Self {
            status: None,
            limit: 50,
            search: None,
            parent_task_id: None,
            tag: None,
            include: None,
            pinned: None,
            color: None,
            archived: None,
            focus_day: None,
        }
    }
}

/// One entry of `reorderTasksBody`.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct TaskOrder {
    pub id: String,
    pub order: i64,
    pub pinned: bool,
}

/// `reorderTasksBody`: 1–1000 top-level tasks with their new position and section.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ReorderTasksBody(pub Vec<TaskOrder>);

struct TaskFields {
    description: Option<Option<String>>,
    status: Option<TaskStatus>,
    priority: Option<TaskPriority>,
    due_at: Option<Option<Timestamp>>,
    parent_task_id: Option<Option<String>>,
    tags: Option<Vec<String>>,
    linked_thought_ids: Option<Vec<String>>,
    pinned: Option<bool>,
    color: Option<Option<TaskColor>>,
    focus_day: Option<Option<String>>,
}

fn shared(fields: &Fields<'_>, ctx: &mut Ctx) -> TaskFields {
    TaskFields {
        description: fields.nullable(ctx, "description", text().max(10_000)),
        status: fields.optional(ctx, "status", one_of),
        priority: fields.optional(ctx, "priority", one_of),
        due_at: fields.nullable(ctx, "dueAt", date),
        parent_task_id: fields.nullable(ctx, "parentTaskId", text()),
        tags: fields.optional(ctx, "tags", tag_list()),
        linked_thought_ids: fields.optional(ctx, "linkedThoughtIds", id_list()),
        pinned: fields.optional(ctx, "pinned", boolean),
        color: fields.nullable(ctx, "color", one_of),
        focus_day: fields.nullable(ctx, "focusDay", DAY_KEY),
    }
}

impl Dto for CreateTaskBody {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let title = fields.required(&mut ctx, "title", text().min(1).max(500));
        let rest = shared(&fields, &mut ctx);
        let items = fields.optional(&mut ctx, "items", list(text().trim().min(1).max(500), 0, 100));
        ctx.finish(Self {
            title: title.unwrap_or_default(),
            description: rest.description,
            status: rest.status,
            priority: rest.priority,
            due_at: rest.due_at,
            parent_task_id: rest.parent_task_id,
            tags: rest.tags,
            linked_thought_ids: rest.linked_thought_ids,
            pinned: rest.pinned,
            color: rest.color,
            focus_day: rest.focus_day,
            items,
        })
    }
}

impl Dto for UpdateTaskBody {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let title = fields.optional(&mut ctx, "title", text().min(1).max(500));
        let rest = shared(&fields, &mut ctx);
        let completed_at = fields.nullable(&mut ctx, "completedAt", date);
        let archived_at = fields.nullable(&mut ctx, "archivedAt", date);
        ctx.finish(Self {
            title,
            description: rest.description,
            status: rest.status,
            priority: rest.priority,
            due_at: rest.due_at,
            parent_task_id: rest.parent_task_id,
            tags: rest.tags,
            linked_thought_ids: rest.linked_thought_ids,
            pinned: rest.pinned,
            color: rest.color,
            focus_day: rest.focus_day,
            completed_at,
            archived_at,
        })
    }
}

impl Dto for ListTasksQuery {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let status = fields.optional(&mut ctx, "status", one_of);
        let limit = limit(&fields, &mut ctx, 500, 50);
        let search = fields.optional(&mut ctx, "search", text().max(200));
        let parent_task_id = fields.optional(&mut ctx, "parentTaskId", text());
        let tag = fields.optional(&mut ctx, "tag", text().max(40));
        let include = fields.optional(&mut ctx, "include", one_of);
        let pinned = fields.optional(&mut ctx, "pinned", query_bool);
        let color = fields.optional(&mut ctx, "color", one_of);
        let archived = fields.optional(&mut ctx, "archived", query_bool);
        let focus_day = fields.optional(&mut ctx, "focusDay", DAY_KEY);
        ctx.finish(Self {
            status,
            limit: limit.unwrap_or_default(),
            search,
            parent_task_id,
            tag,
            include,
            pinned,
            color,
            archived,
            focus_day,
        })
    }
}

fn task_order(ctx: &mut Ctx, value: &Value, path: &str) -> Option<TaskOrder> {
    let fields = object(ctx, value, path);
    let id = fields.required(ctx, "id", text().min(1));
    let order = fields.required(ctx, "order", int());
    let pinned = fields.required(ctx, "pinned", boolean);
    Some(TaskOrder { id: id?, order: order?, pinned: pinned? })
}

impl Dto for ReorderTasksBody {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let items = list(task_order, 1, 1_000)(&mut ctx, input, "");
        ctx.finish(Self(items.unwrap_or_default()))
    }
}

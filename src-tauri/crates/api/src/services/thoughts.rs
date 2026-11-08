use chrono::Utc;
use rusqlite::types::Value;
use serde::Serialize;

use crate::db::Db;
use crate::db::columns::{new_id, to_bool, to_millis};
use crate::db::schema::thoughts::{NewThought, Thought, insert_row};
use crate::dto::thoughts::{CreateThoughtBody, ListThoughtsQuery, UpdateThoughtBody};
use crate::error::{ApiError, ApiResult};
use crate::services::query::{
    Assignments, SqlFragment, and, json_array_contains, list_value, query_all, query_first, search_columns, time_value,
};

/// `GET /thoughts`: a page plus the cursor of the next one (`null` on the last).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThoughtPage {
    pub items: Vec<Thought>,
    pub next_cursor: Option<String>,
}

#[derive(Clone)]
pub struct ThoughtsService {
    db: Db,
}

impl ThoughtsService {
    pub fn new(db: Db) -> Self {
        Self { db }
    }

    /// Pinned first, then newest; the cursor is `${pinned ? 1 : 0}:${createdAtMs}:${id}`.
    pub async fn list(&self, query: ListThoughtsQuery) -> ApiResult<ThoughtPage> {
        let mut conditions = vec![SqlFragment::raw("deleted_at IS NULL")];
        if let Some(pinned) = query.pinned {
            conditions.push(SqlFragment::new("pinned = ?", vec![Value::Integer(to_bool(pinned))]));
        }
        if let Some(tag) = query.tag.as_deref().filter(|tag| !tag.is_empty()) {
            conditions.push(json_array_contains("tags", tag));
        }
        if let Some(search) = query.search.as_deref().filter(|search| !search.is_empty()) {
            // Wrapped, so a body match still has to pass the other filters. Node leaves
            // `title like ? or body like ?` bare inside Drizzle's `and()` and returns
            // deleted thoughts whose body matches; this is the one intended difference.
            let search = search_columns(&["title", "body"], search);
            conditions.push(SqlFragment::new(format!("({})", search.sql), search.params));
        }
        if let Some(cursor) = query.cursor.as_deref().filter(|cursor| !cursor.is_empty()) {
            conditions.push(after_cursor(cursor));
        }
        let filter = and(conditions);
        let mut params = filter.params;
        params.push(Value::Integer(query.limit + 1));
        let sql = format!(
            "SELECT * FROM thoughts WHERE {} ORDER BY pinned DESC, created_at DESC, id DESC LIMIT ?",
            filter.sql
        );
        let mut items = self.db.call(move |conn| query_all(conn, &sql, &params, Thought::from_row)).await?;

        let limit = usize::try_from(query.limit).unwrap_or(0);
        let has_more = items.len() > limit;
        items.truncate(limit);
        let next_cursor = match items.last() {
            Some(last) if has_more => {
                Some(format!("{}:{}:{}", to_bool(last.pinned), to_millis(last.created_at), last.id))
            }
            _ => None,
        };
        Ok(ThoughtPage { items, next_cursor })
    }

    pub async fn create(&self, input: CreateThoughtBody) -> ApiResult<Thought> {
        let row = NewThought {
            id: new_id(),
            title: input.title.flatten(),
            body: input.body,
            tags: input.tags,
            pinned: input.pinned,
            linked_task_ids: input.linked_task_ids,
            ..Default::default()
        };
        Ok(self.db.call(move |conn| insert_row(conn, row)).await?)
    }

    pub async fn get(&self, id: &str) -> ApiResult<Thought> {
        let id = id.to_owned();
        self.db
            .call(move |conn| {
                query_first(
                    conn,
                    "SELECT * FROM thoughts WHERE id = ? AND deleted_at IS NULL",
                    &[Value::Text(id)],
                    Thought::from_row,
                )
            })
            .await?
            .ok_or_else(not_found)
    }

    pub async fn update(&self, id: &str, input: UpdateThoughtBody) -> ApiResult<Thought> {
        let mut set = Assignments::new();
        set.maybe("title", input.title)
            .maybe("body", input.body)
            .maybe("tags", input.tags.as_deref().map(list_value))
            .maybe("pinned", input.pinned.map(to_bool))
            .maybe("linked_task_ids", input.linked_task_ids.as_deref().map(list_value))
            .set("updated_at", time_value(Utc::now()));
        let set = set.into_fragment();
        let mut params = set.params;
        params.push(Value::Text(id.to_owned()));
        let sql = format!("UPDATE thoughts SET {} WHERE id = ? AND deleted_at IS NULL RETURNING *", set.sql);
        self.db.call(move |conn| query_first(conn, &sql, &params, Thought::from_row)).await?.ok_or_else(not_found)
    }

    /// Soft delete.
    pub async fn remove(&self, id: &str) -> ApiResult<()> {
        let params = vec![time_value(Utc::now()), Value::Text(id.to_owned())];
        self.db
            .call(move |conn| {
                query_first(
                    conn,
                    "UPDATE thoughts SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL RETURNING id",
                    &params,
                    |row| row.get::<_, String>(0),
                )
            })
            .await?
            .map(|_| ())
            .ok_or_else(not_found)
    }
}

fn not_found() -> ApiError {
    ApiError::not_found("Thought not found.")
}

/// Rows that sort after the cursor's row in (pinned, createdAt, id) descending order.
fn after_cursor(cursor: &str) -> SqlFragment {
    let parts: Vec<&str> = cursor.split(':').collect();
    let number = |index: usize| {
        let text = parts.get(index).copied().unwrap_or_default();
        text.parse::<i64>().map(Value::Integer).unwrap_or_else(|_| Value::Real(js_number(text)))
    };
    let id = parts.get(2).map_or(Value::Null, |id| Value::Text((*id).to_owned()));
    SqlFragment::new("(pinned, created_at, id) < (?, ?, ?)", vec![number(0), number(1), id])
}

/// `Number(text)` for the cursor parts the DTO already checked.
fn js_number(text: &str) -> f64 {
    text.trim().parse::<f64>().unwrap_or(f64::NAN)
}

use serde::Serialize;

use crate::db::Db;
use crate::db::schema::thoughts::Thought;
use crate::dto::thoughts::{CreateThoughtBody, ListThoughtsQuery, UpdateThoughtBody};
use crate::error::ApiResult;

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
        pending!(51, self.db, query)
    }

    pub async fn create(&self, input: CreateThoughtBody) -> ApiResult<Thought> {
        pending!(51, self.db, input)
    }

    pub async fn get(&self, id: &str) -> ApiResult<Thought> {
        pending!(51, self.db, id)
    }

    pub async fn update(&self, id: &str, input: UpdateThoughtBody) -> ApiResult<Thought> {
        pending!(51, self.db, id, input)
    }

    /// Soft delete.
    pub async fn remove(&self, id: &str) -> ApiResult<()> {
        pending!(51, self.db, id)
    }
}

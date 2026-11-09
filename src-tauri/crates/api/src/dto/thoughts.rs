use serde_json::Value;

use super::common::{Ctx, Dto, boolean, id_list, limit, object, string_bool, tag_list, text};
use crate::error::Issue;

/// `createThoughtBody`: every field optional.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct CreateThoughtBody {
    pub title: Option<Option<String>>,
    pub body: Option<String>,
    pub tags: Option<Vec<String>>,
    pub pinned: Option<bool>,
    pub linked_task_ids: Option<Vec<String>>,
}

/// `updateThoughtBody` is the same schema.
pub type UpdateThoughtBody = CreateThoughtBody;

/// `listThoughtsQuery`: `limit` 1–100, default 50; `cursor` is the previous page's `nextCursor`.
#[derive(Debug, Clone, PartialEq)]
pub struct ListThoughtsQuery {
    pub limit: i64,
    pub cursor: Option<String>,
    pub pinned: Option<bool>,
    pub tag: Option<String>,
    pub search: Option<String>,
}

impl Default for ListThoughtsQuery {
    fn default() -> Self {
        Self { limit: 50, cursor: None, pinned: None, tag: None, search: None }
    }
}

/// `^[01]:\d+:\w+$`.
fn is_cursor(text: &str) -> bool {
    let mut parts = text.splitn(3, ':');
    let (Some(pinned), Some(created), Some(id)) = (parts.next(), parts.next(), parts.next()) else {
        return false;
    };
    matches!(pinned, "0" | "1")
        && !created.is_empty()
        && created.bytes().all(|byte| byte.is_ascii_digit())
        && !id.is_empty()
        && id.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'_')
}

impl Dto for CreateThoughtBody {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let title = fields.nullable(&mut ctx, "title", text().max(200));
        let body = fields.optional(&mut ctx, "body", text().max(50_000));
        let tags = fields.optional(&mut ctx, "tags", tag_list());
        let pinned = fields.optional(&mut ctx, "pinned", boolean);
        let linked_task_ids = fields.optional(&mut ctx, "linkedTaskIds", id_list());
        ctx.finish(Self { title, body, tags, pinned, linked_task_ids })
    }
}

impl Dto for ListThoughtsQuery {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let limit = limit(&fields, &mut ctx, 100, 50);
        let cursor = fields.optional(&mut ctx, "cursor", text().pattern(is_cursor, "Invalid cursor"));
        let pinned = fields.optional(&mut ctx, "pinned", string_bool);
        let tag = fields.optional(&mut ctx, "tag", text().max(40));
        let search = fields.optional(&mut ctx, "search", text().max(200));
        ctx.finish(Self { limit: limit.unwrap_or_default(), cursor, pinned, tag, search })
    }
}

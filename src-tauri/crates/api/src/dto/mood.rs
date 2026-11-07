use serde_json::Value;

use super::common::{Ctx, DAY_KEY, Dto, id_list, int, limit, object, text};
use crate::error::Issue;

/// `upsertMoodBody`: `score` 1–5; `day` defaults to today.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct UpsertMoodBody {
    pub score: i64,
    pub note: Option<Option<String>>,
    pub day: Option<String>,
    pub linked_task_ids: Option<Vec<String>>,
}

/// `listMoodQuery`: `limit` 1–365, default 90.
#[derive(Debug, Clone, PartialEq)]
pub struct ListMoodQuery {
    pub limit: i64,
}

impl Default for ListMoodQuery {
    fn default() -> Self {
        Self { limit: 90 }
    }
}

impl Dto for UpsertMoodBody {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let score = fields.required(&mut ctx, "score", int().range(1, 5));
        let note = fields.nullable(&mut ctx, "note", text().max(2_000));
        let day = fields.optional(&mut ctx, "day", DAY_KEY);
        let linked_task_ids = fields.optional(&mut ctx, "linkedTaskIds", id_list());
        ctx.finish(Self { score: score.unwrap_or_default(), note, day, linked_task_ids })
    }
}

impl Dto for ListMoodQuery {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let limit = limit(&fields, &mut ctx, 365, 90);
        ctx.finish(Self { limit: limit.unwrap_or_default() })
    }
}

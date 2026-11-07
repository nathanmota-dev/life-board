use serde_json::Value;

use super::common::{Ctx, Dto, Fields, HEX_COLOR, boolean, date, id_list, limit, object, text};
use crate::db::columns::Timestamp;
use crate::error::Issue;

/// `createEventBody`: every event field, with `title`, `startAt` and `endAt` required.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct CreateEventBody {
    pub title: String,
    pub description: Option<Option<String>>,
    pub start_at: Timestamp,
    pub end_at: Timestamp,
    pub all_day: Option<bool>,
    pub location: Option<Option<String>>,
    pub color: Option<String>,
    pub linked_task_ids: Option<Vec<String>>,
    pub linked_thought_ids: Option<Vec<String>>,
}

/// `updateEventBody`: every event field, all optional.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct UpdateEventBody {
    pub title: Option<String>,
    pub description: Option<Option<String>>,
    pub start_at: Option<Timestamp>,
    pub end_at: Option<Timestamp>,
    pub all_day: Option<bool>,
    pub location: Option<Option<String>>,
    pub color: Option<String>,
    pub linked_task_ids: Option<Vec<String>>,
    pub linked_thought_ids: Option<Vec<String>>,
}

/// `listEventsQuery`: `limit` 1–500, default 200.
#[derive(Debug, Clone, PartialEq)]
pub struct ListEventsQuery {
    pub from: Option<Timestamp>,
    pub to: Option<Timestamp>,
    pub limit: i64,
}

impl Default for ListEventsQuery {
    fn default() -> Self {
        Self { from: None, to: None, limit: 200 }
    }
}

struct EventFields {
    description: Option<Option<String>>,
    all_day: Option<bool>,
    location: Option<Option<String>>,
    color: Option<String>,
    linked_task_ids: Option<Vec<String>>,
    linked_thought_ids: Option<Vec<String>>,
}

fn shared(fields: &Fields<'_>, ctx: &mut Ctx) -> EventFields {
    EventFields {
        description: fields.nullable(ctx, "description", text().max(2_000)),
        all_day: fields.optional(ctx, "allDay", boolean),
        location: fields.nullable(ctx, "location", text().max(200)),
        color: fields.optional(ctx, "color", HEX_COLOR),
        linked_task_ids: fields.optional(ctx, "linkedTaskIds", id_list()),
        linked_thought_ids: fields.optional(ctx, "linkedThoughtIds", id_list()),
    }
}

impl Dto for CreateEventBody {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let title = fields.required(&mut ctx, "title", text().min(1).max(200));
        let start_at = fields.required(&mut ctx, "startAt", date);
        let end_at = fields.required(&mut ctx, "endAt", date);
        let rest = shared(&fields, &mut ctx);
        ctx.finish(Self {
            title: title.unwrap_or_default(),
            description: rest.description,
            start_at: start_at.unwrap_or_default(),
            end_at: end_at.unwrap_or_default(),
            all_day: rest.all_day,
            location: rest.location,
            color: rest.color,
            linked_task_ids: rest.linked_task_ids,
            linked_thought_ids: rest.linked_thought_ids,
        })
    }
}

impl Dto for UpdateEventBody {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let title = fields.optional(&mut ctx, "title", text().min(1).max(200));
        let start_at = fields.optional(&mut ctx, "startAt", date);
        let end_at = fields.optional(&mut ctx, "endAt", date);
        let rest = shared(&fields, &mut ctx);
        ctx.finish(Self {
            title,
            description: rest.description,
            start_at,
            end_at,
            all_day: rest.all_day,
            location: rest.location,
            color: rest.color,
            linked_task_ids: rest.linked_task_ids,
            linked_thought_ids: rest.linked_thought_ids,
        })
    }
}

impl Dto for ListEventsQuery {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let from = fields.optional(&mut ctx, "from", date);
        let to = fields.optional(&mut ctx, "to", date);
        let limit = limit(&fields, &mut ctx, 500, 200);
        ctx.finish(Self { from, to, limit: limit.unwrap_or_default() })
    }
}

use serde_json::Value;

use super::common::{Ctx, Dto, Text, int, object, one_of, query_bool, text};
use crate::db::schema::projects::ProjectStatus;
use crate::error::Issue;

const PAUSE_REASON: Text = text().trim().max(200);

/// `createProjectBody`: `title` required.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct CreateProjectBody {
    pub title: String,
    pub description: Option<String>,
    pub status: Option<ProjectStatus>,
    pub pause_reason: Option<Option<String>>,
}

/// `updateProjectBody`.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct UpdateProjectBody {
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<ProjectStatus>,
    pub pause_reason: Option<Option<String>>,
}

/// `listProjectsQuery`: `archived` is `"true"` or `"false"` (default).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ListProjectsQuery {
    pub archived: bool,
}

/// `moveProjectBody`: `order` is the card's index in the target column once it lands there.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct MoveProjectBody {
    pub status: ProjectStatus,
    pub order: i64,
    pub pause_reason: Option<Option<String>>,
}

impl Dto for CreateProjectBody {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let title = fields.required(&mut ctx, "title", text().min(1).max(200));
        let description = fields.optional(&mut ctx, "description", text().max(5_000));
        let status = fields.optional(&mut ctx, "status", one_of);
        let pause_reason = fields.nullable(&mut ctx, "pauseReason", PAUSE_REASON);
        ctx.finish(Self { title: title.unwrap_or_default(), description, status, pause_reason })
    }
}

impl Dto for UpdateProjectBody {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let title = fields.optional(&mut ctx, "title", text().min(1).max(200));
        let description = fields.optional(&mut ctx, "description", text().max(5_000));
        let status = fields.optional(&mut ctx, "status", one_of);
        let pause_reason = fields.nullable(&mut ctx, "pauseReason", PAUSE_REASON);
        ctx.finish(Self { title, description, status, pause_reason })
    }
}

impl Dto for ListProjectsQuery {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let archived = fields.defaulted(&mut ctx, "archived", query_bool, false);
        ctx.finish(Self { archived: archived.unwrap_or_default() })
    }
}

impl Dto for MoveProjectBody {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let status = fields.required(&mut ctx, "status", one_of);
        let order = fields.required(&mut ctx, "order", int().min(0));
        let pause_reason = fields.nullable(&mut ctx, "pauseReason", PAUSE_REASON);
        ctx.finish(Self { status: status.unwrap_or_default(), order: order.unwrap_or_default(), pause_reason })
    }
}

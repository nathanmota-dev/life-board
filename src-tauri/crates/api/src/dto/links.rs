use serde_json::Value;

use super::common::{Ctx, Dto, list, object, one_of, text};
use crate::db::columns::string_enum;
use crate::error::Issue;

string_enum! {
    /// `BACKLINK_TARGETS`.
    pub enum BacklinkKind { Task = "task", Thought = "thought" }
}

/// `resolveLinksBody`: up to 100 ids per module, each list defaulting to empty.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ResolveLinksBody {
    pub task_ids: Vec<String>,
    pub thought_ids: Vec<String>,
    pub calendar_ids: Vec<String>,
    pub goal_ids: Vec<String>,
}

/// `backlinksParams` (`BacklinkTarget`).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct BacklinkTarget {
    pub kind: BacklinkKind,
    pub id: String,
}

impl Dto for ResolveLinksBody {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let ids = || list(text(), 0, 100);
        let task_ids = fields.defaulted(&mut ctx, "taskIds", ids(), Vec::new());
        let thought_ids = fields.defaulted(&mut ctx, "thoughtIds", ids(), Vec::new());
        let calendar_ids = fields.defaulted(&mut ctx, "calendarIds", ids(), Vec::new());
        let goal_ids = fields.defaulted(&mut ctx, "goalIds", ids(), Vec::new());
        ctx.finish(Self {
            task_ids: task_ids.unwrap_or_default(),
            thought_ids: thought_ids.unwrap_or_default(),
            calendar_ids: calendar_ids.unwrap_or_default(),
            goal_ids: goal_ids.unwrap_or_default(),
        })
    }
}

impl Dto for BacklinkTarget {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let kind = fields.required(&mut ctx, "kind", one_of);
        let id = fields.required(&mut ctx, "id", text().min(1));
        ctx.finish(Self { kind: kind.unwrap_or_default(), id: id.unwrap_or_default() })
    }
}

use serde_json::Value;

use super::common::{Ctx, DAY_KEY, Dto, Fields, HEX_COLOR, date, id_list, int, list, object, one_of, text};
use crate::db::columns::Timestamp;
use crate::db::schema::goals::{GoalDomain, GoalProgressMode, GoalStatus};
use crate::error::Issue;

/// `createMilestoneBody` (also each item of `createGoalBody.milestones`): `title` required.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct CreateMilestoneBody {
    pub title: String,
    pub due_at: Option<Option<Timestamp>>,
}

/// `createGoalBody`: `title` required; up to 20 milestones.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct CreateGoalBody {
    pub title: String,
    pub why: Option<Option<String>>,
    pub domain: Option<GoalDomain>,
    pub start_at: Option<Option<Timestamp>>,
    pub target_at: Option<Option<Timestamp>>,
    pub color: Option<String>,
    pub linked_task_ids: Option<Vec<String>>,
    pub linked_thought_ids: Option<Vec<String>>,
    pub linked_habit_ids: Option<Vec<String>>,
    pub progress_mode: Option<GoalProgressMode>,
    pub milestones: Option<Vec<CreateMilestoneBody>>,
}

/// `updateGoalBody`: the goal fields plus `status`, `completedAt` and `progress` (0–100).
#[derive(Debug, Clone, Default, PartialEq)]
pub struct UpdateGoalBody {
    pub title: Option<String>,
    pub why: Option<Option<String>>,
    pub domain: Option<GoalDomain>,
    pub start_at: Option<Option<Timestamp>>,
    pub target_at: Option<Option<Timestamp>>,
    pub color: Option<String>,
    pub linked_task_ids: Option<Vec<String>>,
    pub linked_thought_ids: Option<Vec<String>>,
    pub linked_habit_ids: Option<Vec<String>>,
    pub progress_mode: Option<GoalProgressMode>,
    pub status: Option<GoalStatus>,
    pub completed_at: Option<Option<Timestamp>>,
    pub progress: Option<i64>,
}

/// `updateMilestoneBody`.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct UpdateMilestoneBody {
    pub title: Option<String>,
    pub due_at: Option<Option<Timestamp>>,
    pub completed_at: Option<Option<Timestamp>>,
}

/// `milestoneParams`. The router names the goal segment `{id}` (see `controllers`),
/// so `goalId` is read from `id`.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct MilestoneParams {
    pub goal_id: String,
    pub milestone_id: String,
}

/// `goalProgressQuery`: optional day keys.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct GoalProgressQuery {
    pub from: Option<String>,
    pub to: Option<String>,
}

fn milestone(ctx: &mut Ctx, value: &Value, path: &str) -> Option<CreateMilestoneBody> {
    let fields = object(ctx, value, path);
    let title = fields.required(ctx, "title", text().min(1).max(200));
    let due_at = fields.nullable(ctx, "dueAt", date);
    Some(CreateMilestoneBody { title: title?, due_at })
}

struct GoalFields {
    why: Option<Option<String>>,
    domain: Option<GoalDomain>,
    start_at: Option<Option<Timestamp>>,
    target_at: Option<Option<Timestamp>>,
    color: Option<String>,
    linked_task_ids: Option<Vec<String>>,
    linked_thought_ids: Option<Vec<String>>,
    linked_habit_ids: Option<Vec<String>>,
    progress_mode: Option<GoalProgressMode>,
}

fn shared(fields: &Fields<'_>, ctx: &mut Ctx) -> GoalFields {
    GoalFields {
        why: fields.nullable(ctx, "why", text().max(2_000)),
        domain: fields.optional(ctx, "domain", one_of),
        start_at: fields.nullable(ctx, "startAt", date),
        target_at: fields.nullable(ctx, "targetAt", date),
        color: fields.optional(ctx, "color", HEX_COLOR),
        linked_task_ids: fields.optional(ctx, "linkedTaskIds", id_list()),
        linked_thought_ids: fields.optional(ctx, "linkedThoughtIds", id_list()),
        linked_habit_ids: fields.optional(ctx, "linkedHabitIds", id_list()),
        progress_mode: fields.optional(ctx, "progressMode", one_of),
    }
}

impl Dto for CreateGoalBody {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let title = fields.required(&mut ctx, "title", text().min(1).max(200));
        let rest = shared(&fields, &mut ctx);
        let milestones = fields.optional(&mut ctx, "milestones", list(milestone, 0, 20));
        ctx.finish(Self {
            title: title.unwrap_or_default(),
            why: rest.why,
            domain: rest.domain,
            start_at: rest.start_at,
            target_at: rest.target_at,
            color: rest.color,
            linked_task_ids: rest.linked_task_ids,
            linked_thought_ids: rest.linked_thought_ids,
            linked_habit_ids: rest.linked_habit_ids,
            progress_mode: rest.progress_mode,
            milestones,
        })
    }
}

impl Dto for UpdateGoalBody {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let title = fields.optional(&mut ctx, "title", text().min(1).max(200));
        let rest = shared(&fields, &mut ctx);
        let status = fields.optional(&mut ctx, "status", one_of);
        let completed_at = fields.nullable(&mut ctx, "completedAt", date);
        let progress = fields.optional(&mut ctx, "progress", int().range(0, 100));
        ctx.finish(Self {
            title,
            why: rest.why,
            domain: rest.domain,
            start_at: rest.start_at,
            target_at: rest.target_at,
            color: rest.color,
            linked_task_ids: rest.linked_task_ids,
            linked_thought_ids: rest.linked_thought_ids,
            linked_habit_ids: rest.linked_habit_ids,
            progress_mode: rest.progress_mode,
            status,
            completed_at,
            progress,
        })
    }
}

impl Dto for CreateMilestoneBody {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let parsed = milestone(&mut ctx, input, "");
        ctx.finish(parsed.unwrap_or_default())
    }
}

impl Dto for UpdateMilestoneBody {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let title = fields.optional(&mut ctx, "title", text().min(1).max(200));
        let due_at = fields.nullable(&mut ctx, "dueAt", date);
        let completed_at = fields.nullable(&mut ctx, "completedAt", date);
        ctx.finish(Self { title, due_at, completed_at })
    }
}

impl Dto for MilestoneParams {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let goal_id = fields.required(&mut ctx, "id", text().min(1));
        let milestone_id = fields.required(&mut ctx, "milestoneId", text().min(1));
        ctx.finish(Self { goal_id: goal_id.unwrap_or_default(), milestone_id: milestone_id.unwrap_or_default() })
    }
}

impl Dto for GoalProgressQuery {
    fn parse(input: &Value) -> Result<Self, Vec<Issue>> {
        let mut ctx = Ctx::new();
        let fields = object(&mut ctx, input, "");
        let from = fields.optional(&mut ctx, "from", DAY_KEY);
        let to = fields.optional(&mut ctx, "to", DAY_KEY);
        ctx.finish(Self { from, to })
    }
}

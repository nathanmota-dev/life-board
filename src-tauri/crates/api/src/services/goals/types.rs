use crate::db::columns::{Timestamp, js_date, js_date_opt, string_enum};
use crate::db::schema::goals::{Goal, GoalMilestone};
use serde::Serialize;

pub const DAY_MS: i64 = 24 * 60 * 60 * 1000;
/// How far below the expected progress an active goal may fall before it's at risk.
pub const RISK_MARGIN: i64 = 10;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct ProgressPart {
    pub done: i64,
    pub total: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct GoalBreakdown {
    pub milestones: Option<ProgressPart>,
    pub tasks: Option<ProgressPart>,
    pub habits: Option<ProgressPart>,
}

string_enum! {
    /// `GoalRisk` without its `null`.
    pub enum GoalRisk { AtRisk = "at_risk", Overdue = "overdue" }
}

/// What `goalRisk` returns.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RiskInfo {
    pub expected_progress: Option<i64>,
    pub risk: Option<GoalRisk>,
}

/// A milestone with a due date, for the timeline.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MilestoneMarker {
    pub id: String,
    pub title: String,
    #[serde(with = "js_date")]
    pub due_at: Timestamp,
    #[serde(with = "js_date_opt")]
    pub completed_at: Option<Timestamp>,
}

/// `GoalSummary`: the goal with its derived progress (`goal.progress`), breakdown and risk.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalSummary {
    #[serde(flatten)]
    pub goal: Goal,
    pub breakdown: GoalBreakdown,
    pub expected_progress: Option<i64>,
    pub risk: Option<GoalRisk>,
    pub milestone_markers: Vec<MilestoneMarker>,
}

/// `HabitRow`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HabitRow {
    pub id: String,
    pub target: i64,
    pub created_at: Timestamp,
}

/// `LogRow`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LogRow {
    pub habit_id: String,
    pub day: String,
    pub count: i64,
    pub target: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MilestoneRow {
    pub id: String,
    pub goal_id: String,
    pub title: String,
    pub due_at: Option<Timestamp>,
    pub completed_at: Option<Timestamp>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskRow {
    pub id: String,
    pub status: String,
}

/// `GoalParts`: everything the goals of one request link to.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct GoalParts {
    pub milestones: Vec<MilestoneRow>,
    pub tasks: Vec<TaskRow>,
    pub habits: Vec<HabitRow>,
    pub logs: Vec<LogRow>,
}

/// `POST /goals` body.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatedGoal {
    pub goal: GoalSummary,
    pub milestones_created: i64,
}

/// `GET /goals/:id` body.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct GoalDetail {
    pub goal: GoalSummary,
    pub milestones: Vec<GoalMilestone>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ProgressPoint {
    pub day: String,
    pub progress: i64,
}

/// `GET /goals/:id/progress` body.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressHistory {
    pub items: Vec<ProgressPoint>,
    /// The value carried into the range, for charts that start before its first snapshot.
    pub starting_progress: Option<i64>,
}

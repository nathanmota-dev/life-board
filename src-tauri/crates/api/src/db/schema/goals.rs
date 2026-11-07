use serde::Serialize;

use crate::db::columns::{Timestamp, js_date, js_date_opt, string_enum};
use crate::db::{Db, DbError};

string_enum! {
    /// `GOAL_STATUSES`.
    pub enum GoalStatus { Active = "active", Paused = "paused", Completed = "completed", Abandoned = "abandoned" }
}

string_enum! {
    /// `GOAL_DOMAINS`.
    pub enum GoalDomain { Health = "health", Career = "career", Learning = "learning", Relationships = "relationships", Personal = "personal" }
}

string_enum! {
    /// `GOAL_PROGRESS_MODES`.
    pub enum GoalProgressMode { Auto = "auto", Manual = "manual" }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Goal {
    pub id: String,
    pub title: String,
    pub why: Option<String>,
    pub domain: GoalDomain,
    pub status: GoalStatus,
    #[serde(with = "js_date_opt")]
    pub start_at: Option<Timestamp>,
    #[serde(with = "js_date_opt")]
    pub target_at: Option<Timestamp>,
    #[serde(with = "js_date_opt")]
    pub completed_at: Option<Timestamp>,
    pub color: String,
    /// Typed by hand in manual mode; auto mode derives it from milestones, tasks and habits.
    pub progress: i64,
    pub progress_mode: GoalProgressMode,
    pub linked_task_ids: Vec<String>,
    pub linked_thought_ids: Vec<String>,
    pub linked_habit_ids: Vec<String>,
    #[serde(with = "js_date")]
    pub created_at: Timestamp,
    #[serde(with = "js_date")]
    pub updated_at: Timestamp,
    #[serde(with = "js_date_opt")]
    pub deleted_at: Option<Timestamp>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalMilestone {
    pub id: String,
    pub goal_id: String,
    pub title: String,
    #[serde(with = "js_date_opt")]
    pub due_at: Option<Timestamp>,
    #[serde(with = "js_date_opt")]
    pub completed_at: Option<Timestamp>,
    pub order: i64,
    #[serde(with = "js_date")]
    pub created_at: Timestamp,
    #[serde(with = "js_date")]
    pub updated_at: Timestamp,
    #[serde(with = "js_date_opt")]
    pub deleted_at: Option<Timestamp>,
}

/// One row per goal per local day, holding the progress it had that day.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoalProgressSnapshot {
    pub id: String,
    pub goal_id: String,
    pub day: String,
    pub progress: i64,
    #[serde(with = "js_date")]
    pub created_at: Timestamp,
    #[serde(with = "js_date")]
    pub updated_at: Timestamp,
}

/// Defaults: domain personal, status active, color "#a855f7", progress 0, mode auto.
#[derive(Debug, Clone, Default)]
pub struct NewGoal {
    pub id: String,
    pub title: String,
    pub why: Option<String>,
    pub domain: Option<GoalDomain>,
    pub status: Option<GoalStatus>,
    pub start_at: Option<Timestamp>,
    pub target_at: Option<Timestamp>,
    pub completed_at: Option<Timestamp>,
    pub color: Option<String>,
    pub progress: Option<i64>,
    pub progress_mode: Option<GoalProgressMode>,
    pub linked_task_ids: Option<Vec<String>>,
    pub linked_thought_ids: Option<Vec<String>>,
    pub linked_habit_ids: Option<Vec<String>>,
    pub created_at: Option<Timestamp>,
    pub updated_at: Option<Timestamp>,
    pub deleted_at: Option<Timestamp>,
}

#[derive(Debug, Clone, Default)]
pub struct NewGoalMilestone {
    pub id: String,
    pub goal_id: String,
    pub title: String,
    pub due_at: Option<Timestamp>,
    pub completed_at: Option<Timestamp>,
    pub order: Option<i64>,
    pub created_at: Option<Timestamp>,
    pub updated_at: Option<Timestamp>,
    pub deleted_at: Option<Timestamp>,
}

#[derive(Debug, Clone, Default)]
pub struct NewGoalProgressSnapshot {
    pub id: String,
    pub goal_id: String,
    pub day: String,
    pub progress: i64,
    pub created_at: Option<Timestamp>,
    pub updated_at: Option<Timestamp>,
}

impl Goal {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        pending!(52, row)
    }
}

impl GoalMilestone {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        pending!(52, row)
    }
}

impl GoalProgressSnapshot {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        pending!(52, row)
    }
}

pub async fn insert_goals(db: &Db, rows: Vec<NewGoal>) -> Result<(), DbError> {
    pending!(52, db, rows)
}

pub async fn insert_milestones(db: &Db, rows: Vec<NewGoalMilestone>) -> Result<(), DbError> {
    pending!(52, db, rows)
}

pub async fn insert_snapshots(db: &Db, rows: Vec<NewGoalProgressSnapshot>) -> Result<(), DbError> {
    pending!(52, db, rows)
}

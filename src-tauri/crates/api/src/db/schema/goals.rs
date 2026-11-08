use crate::clock;
use serde::Serialize;

use rusqlite::params;

use crate::db::columns::{
    Timestamp, get_json_list, get_timestamp, get_timestamp_opt, js_date, js_date_opt, string_enum, to_json_list,
    to_millis,
};
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
    /// Also used by `links.resolve` and `links.backlinks` (#51).
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            title: row.get("title")?,
            why: row.get("why")?,
            domain: row.get("domain")?,
            status: row.get("status")?,
            start_at: get_timestamp_opt(row, "start_at")?,
            target_at: get_timestamp_opt(row, "target_at")?,
            completed_at: get_timestamp_opt(row, "completed_at")?,
            color: row.get("color")?,
            progress: row.get("progress")?,
            progress_mode: row.get("progress_mode")?,
            linked_task_ids: get_json_list(row, "linked_task_ids")?,
            linked_thought_ids: get_json_list(row, "linked_thought_ids")?,
            linked_habit_ids: get_json_list(row, "linked_habit_ids")?,
            created_at: get_timestamp(row, "created_at")?,
            updated_at: get_timestamp(row, "updated_at")?,
            deleted_at: get_timestamp_opt(row, "deleted_at")?,
        })
    }
}

impl GoalMilestone {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            goal_id: row.get("goal_id")?,
            title: row.get("title")?,
            due_at: get_timestamp_opt(row, "due_at")?,
            completed_at: get_timestamp_opt(row, "completed_at")?,
            order: row.get("order")?,
            created_at: get_timestamp(row, "created_at")?,
            updated_at: get_timestamp(row, "updated_at")?,
            deleted_at: get_timestamp_opt(row, "deleted_at")?,
        })
    }
}

impl GoalProgressSnapshot {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            goal_id: row.get("goal_id")?,
            day: row.get("day")?,
            progress: row.get("progress")?,
            created_at: get_timestamp(row, "created_at")?,
            updated_at: get_timestamp(row, "updated_at")?,
        })
    }
}

/// Inserts one goal with the column defaults filled in and returns it.
/// Also used to seed the links tests (#51).
pub fn insert_goal(conn: &rusqlite::Connection, row: NewGoal) -> rusqlite::Result<Goal> {
    let now = clock::now();
    conn.query_row(
        "INSERT INTO goals (id, title, why, domain, status, start_at, target_at, completed_at, color, progress, progress_mode, linked_task_ids, linked_thought_ids, linked_habit_ids, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *",
        params![
            row.id,
            row.title,
            row.why,
            row.domain.unwrap_or(GoalDomain::Personal),
            row.status.unwrap_or(GoalStatus::Active),
            row.start_at.map(to_millis),
            row.target_at.map(to_millis),
            row.completed_at.map(to_millis),
            row.color.unwrap_or_else(|| "#a855f7".to_owned()),
            row.progress.unwrap_or(0),
            row.progress_mode.unwrap_or(GoalProgressMode::Auto),
            to_json_list(&row.linked_task_ids.unwrap_or_default()),
            to_json_list(&row.linked_thought_ids.unwrap_or_default()),
            to_json_list(&row.linked_habit_ids.unwrap_or_default()),
            to_millis(row.created_at.unwrap_or(now)),
            to_millis(row.updated_at.unwrap_or(now)),
            row.deleted_at.map(to_millis),
        ],
        Goal::from_row,
    )
}

pub async fn insert_goals(db: &Db, rows: Vec<NewGoal>) -> Result<(), DbError> {
    db.call(move |conn| {
        let tx = conn.transaction()?;
        for row in rows {
            insert_goal(&tx, row)?;
        }
        tx.commit()
    })
    .await
}

/// Inserts one milestone with the column defaults filled in and returns it.
pub fn insert_milestone(conn: &rusqlite::Connection, row: NewGoalMilestone) -> rusqlite::Result<GoalMilestone> {
    let now = clock::now();
    conn.query_row(
        r#"INSERT INTO goal_milestones (id, goal_id, title, due_at, completed_at, "order", created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *"#,
        params![
            row.id,
            row.goal_id,
            row.title,
            row.due_at.map(to_millis),
            row.completed_at.map(to_millis),
            row.order.unwrap_or(0),
            to_millis(row.created_at.unwrap_or(now)),
            to_millis(row.updated_at.unwrap_or(now)),
            row.deleted_at.map(to_millis),
        ],
        GoalMilestone::from_row,
    )
}

pub async fn insert_milestones(db: &Db, rows: Vec<NewGoalMilestone>) -> Result<(), DbError> {
    db.call(move |conn| {
        let tx = conn.transaction()?;
        for row in rows {
            insert_milestone(&tx, row)?;
        }
        tx.commit()
    })
    .await
}

pub async fn insert_snapshots(db: &Db, rows: Vec<NewGoalProgressSnapshot>) -> Result<(), DbError> {
    db.call(move |conn| {
        let tx = conn.transaction()?;
        let now = clock::now();
        for row in rows {
            tx.execute(
                "INSERT INTO goal_progress_snapshots (id, goal_id, day, progress, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
                params![
                    row.id,
                    row.goal_id,
                    row.day,
                    row.progress,
                    to_millis(row.created_at.unwrap_or(now)),
                    to_millis(row.updated_at.unwrap_or(now)),
                ],
            )?;
        }
        tx.commit()
    })
    .await
}

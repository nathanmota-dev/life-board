use crate::clock;
use std::collections::HashSet;

use rusqlite::Connection;
use rusqlite::types::Value;
use serde::Serialize;

use crate::db::Db;
use crate::db::columns::{
    Timestamp, get_timestamp, get_timestamp_opt, js_date, js_date_opt, new_id, string_enum, to_millis,
};
use crate::db::schema::goals::{
    Goal, GoalMilestone, GoalProgressMode, GoalStatus, NewGoal, NewGoalMilestone, insert_goal, insert_milestone,
};
use crate::dto::goals::{CreateGoalBody, CreateMilestoneBody, GoalProgressQuery, UpdateGoalBody, UpdateMilestoneBody};
use crate::error::{ApiError, ApiResult};
use crate::services::date::{add_days, from_day_key, to_day_key};
use crate::services::query::{
    Assignments, enum_value, list_value, placeholders, query_all, query_first, time_opt, time_value,
};

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

/// `Math.round`: halves go up.
fn js_round(value: f64) -> i64 {
    let floor = value.floor();
    (if value - floor >= 0.5 { floor + 1.0 } else { floor }) as i64
}

fn ratio(part: &ProgressPart) -> f64 {
    if part.total == 0 { 0.0 } else { part.done as f64 / part.total as f64 }
}

/// Mean of the parts the goal has, rounded; a goal without parts sits at 0%.
pub fn auto_progress(breakdown: &GoalBreakdown) -> i64 {
    let parts: Vec<&ProgressPart> =
        [&breakdown.milestones, &breakdown.tasks, &breakdown.habits].into_iter().flatten().collect();
    if parts.is_empty() {
        return 0;
    }
    let sum = parts.iter().fold(0.0, |sum, part| sum + ratio(part));
    js_round((sum / parts.len() as f64) * 100.0)
}

/// The day habit tracking counts from: the goal's start (or creation), never before the habit existed.
fn habit_start_day(goal: &Goal, habit: &HabitRow) -> String {
    let goal_start = to_day_key(goal.start_at.unwrap_or(goal.created_at));
    let created = to_day_key(habit.created_at);
    if goal_start > created { goal_start } else { created }
}

fn day_millis(day: &str) -> f64 {
    from_day_key(day).map_or(0.0, |date| to_millis(date) as f64)
}

/// Days the daily goal was met over the days since the start; today only counts once it's met.
pub fn habits_part(goal: &Goal, linked: &[HabitRow], logs: &[LogRow], today: Timestamp) -> ProgressPart {
    let today_key = to_day_key(today);
    linked.iter().fold(ProgressPart { done: 0, total: 0 }, |part, habit| {
        let from = habit_start_day(goal, habit);
        if from > today_key {
            return part;
        }
        let past_days = js_round((day_millis(&today_key) - day_millis(&from)) / DAY_MS as f64);
        let met: Vec<&LogRow> = logs
            .iter()
            .filter(|log| {
                let target = if log.day == today_key { habit.target } else { log.target.unwrap_or(habit.target) };
                log.habit_id == habit.id && log.day >= from && log.day <= today_key && log.count >= target
            })
            .collect();
        let met_today = met.iter().any(|log| log.day == today_key);
        ProgressPart { done: part.done + met.len() as i64, total: part.total + past_days + i64::from(met_today) }
    })
}

pub fn goal_breakdown(goal: &Goal, parts: &GoalParts, today: Timestamp) -> GoalBreakdown {
    let milestones: Vec<&MilestoneRow> = parts.milestones.iter().filter(|item| item.goal_id == goal.id).collect();
    let tasks: Vec<&TaskRow> = parts.tasks.iter().filter(|task| goal.linked_task_ids.contains(&task.id)).collect();
    let habits: Vec<HabitRow> =
        parts.habits.iter().filter(|habit| goal.linked_habit_ids.contains(&habit.id)).cloned().collect();
    GoalBreakdown {
        milestones: (!milestones.is_empty()).then(|| ProgressPart {
            done: milestones.iter().filter(|item| item.completed_at.is_some()).count() as i64,
            total: milestones.len() as i64,
        }),
        tasks: (!tasks.is_empty()).then(|| ProgressPart {
            done: tasks.iter().filter(|task| task.status == "done").count() as i64,
            total: tasks.len() as i64,
        }),
        habits: (!habits.is_empty()).then(|| habits_part(goal, &habits, &parts.logs, today)),
    }
}

/// Expected progress is the elapsed share of the time between start (or creation) and target.
pub fn goal_risk(goal: &Goal, progress: i64, now: Timestamp) -> RiskInfo {
    let Some(target_at) = goal.target_at else { return RiskInfo { expected_progress: None, risk: None } };
    let start = to_millis(goal.start_at.unwrap_or(goal.created_at));
    let (now_ms, target_ms) = (to_millis(now), to_millis(target_at));
    let span = target_ms - start;
    let elapsed = if span > 0 { (now_ms - start) as f64 / span as f64 } else { 1.0 };
    let expected = js_round(elapsed.clamp(0.0, 1.0) * 100.0);
    let risk = if goal.status == GoalStatus::Active && progress < 100 {
        if now_ms > target_ms {
            Some(GoalRisk::Overdue)
        } else if progress < expected - RISK_MARGIN {
            Some(GoalRisk::AtRisk)
        } else {
            None
        }
    } else {
        None
    };
    RiskInfo { expected_progress: Some(expected), risk }
}

#[derive(Clone)]
pub struct GoalsService {
    db: Db,
}

impl GoalsService {
    pub fn new(db: Db) -> Self {
        Self { db }
    }

    /// Newest first, summarized (which records today's snapshot when progress moved).
    pub async fn list(&self, now: Timestamp) -> ApiResult<Vec<GoalSummary>> {
        Ok(self
            .db
            .call(move |conn| {
                let rows = query_all(
                    conn,
                    "SELECT * FROM goals WHERE deleted_at IS NULL ORDER BY created_at DESC",
                    &[],
                    Goal::from_row,
                )?;
                summarize(conn, rows, now)
            })
            .await?)
    }

    pub async fn create(&self, input: CreateGoalBody) -> ApiResult<CreatedGoal> {
        self.db
            .call(move |conn| {
                let goal_id = new_id();
                let milestones = input.milestones.unwrap_or_default();
                let milestones_created = milestones.len() as i64;
                let tx = conn.transaction()?;
                let goal = insert_goal(
                    &tx,
                    NewGoal {
                        id: goal_id.clone(),
                        title: input.title,
                        why: input.why.flatten(),
                        domain: input.domain,
                        start_at: input.start_at.flatten(),
                        target_at: input.target_at.flatten(),
                        color: input.color,
                        progress_mode: input.progress_mode,
                        linked_task_ids: input.linked_task_ids,
                        linked_thought_ids: input.linked_thought_ids,
                        linked_habit_ids: input.linked_habit_ids,
                        ..Default::default()
                    },
                )?;
                for (order, milestone) in (0_i64..).zip(milestones) {
                    insert_milestone(
                        &tx,
                        NewGoalMilestone {
                            id: new_id(),
                            goal_id: goal_id.clone(),
                            title: milestone.title,
                            due_at: milestone.due_at.flatten(),
                            order: Some(order),
                            ..Default::default()
                        },
                    )?;
                }
                tx.commit()?;
                let summary = summarize_one(conn, goal, clock::now())?;
                Ok(summary.map(|goal| CreatedGoal { goal, milestones_created }).ok_or_else(not_found))
            })
            .await?
    }

    pub async fn get(&self, id: &str, now: Timestamp) -> ApiResult<GoalDetail> {
        let id = id.to_owned();
        self.db
            .call(move |conn| {
                let Some(goal) = find_goal(conn, &id)? else { return Ok(Err(not_found())) };
                let Some(goal) = summarize_one(conn, goal, now)? else { return Ok(Err(not_found())) };
                let milestones = milestones_of(conn, &id)?;
                Ok(Ok(GoalDetail { goal, milestones }))
            })
            .await?
    }

    /// Completing stamps `completedAt`; any other status clears it.
    pub async fn update(&self, id: &str, input: UpdateGoalBody) -> ApiResult<GoalSummary> {
        let mut completed_at = input.completed_at;
        match input.status {
            Some(GoalStatus::Completed) if completed_at.is_none() => completed_at = Some(Some(clock::now())),
            Some(status) if status != GoalStatus::Completed => completed_at = Some(None),
            _ => {}
        }
        let mut set = Assignments::new();
        set.maybe("title", input.title)
            .maybe("why", input.why)
            .maybe("domain", input.domain.map(enum_value))
            .maybe("start_at", input.start_at.map(time_opt))
            .maybe("target_at", input.target_at.map(time_opt))
            .maybe("color", input.color)
            .maybe("linked_task_ids", input.linked_task_ids.as_deref().map(list_value))
            .maybe("linked_thought_ids", input.linked_thought_ids.as_deref().map(list_value))
            .maybe("linked_habit_ids", input.linked_habit_ids.as_deref().map(list_value))
            .maybe("progress_mode", input.progress_mode.map(enum_value))
            .maybe("status", input.status.map(enum_value))
            .maybe("completed_at", completed_at.map(time_opt))
            .maybe("progress", input.progress)
            .set("updated_at", time_value(clock::now()));
        let set = set.into_fragment();
        let mut params = set.params;
        params.push(Value::Text(id.to_owned()));
        self.db
            .call(move |conn| {
                let row = query_first(
                    conn,
                    &format!("UPDATE goals SET {} WHERE id = ? AND deleted_at IS NULL RETURNING *", set.sql),
                    &params,
                    Goal::from_row,
                )?;
                let Some(row) = row else { return Ok(Err(not_found())) };
                Ok(summarize_one(conn, row, clock::now())?.ok_or_else(not_found))
            })
            .await?
    }

    /// Soft deletes the goal and drops its snapshots.
    pub async fn remove(&self, id: &str) -> ApiResult<()> {
        let id = id.to_owned();
        self.db
            .call(move |conn| {
                let row = query_first(
                    conn,
                    "UPDATE goals SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL RETURNING id",
                    &[time_value(clock::now()), Value::Text(id.clone())],
                    |row| row.get::<_, String>(0),
                )?;
                if row.is_none() {
                    return Ok(Err(not_found()));
                }
                // Goals are soft-deleted, so the cascade never fires; drop the history here.
                conn.execute("DELETE FROM goal_progress_snapshots WHERE goal_id = ?", [id])?;
                Ok(Ok(()))
            })
            .await?
    }

    pub async fn progress_history(&self, id: &str, query: GoalProgressQuery) -> ApiResult<ProgressHistory> {
        let id = id.to_owned();
        self.db
            .call(move |conn| {
                if find_goal(conn, &id)?.is_none() {
                    return Ok(Err(not_found()));
                }
                // Day keys are zero-padded, so string comparison is chronological.
                let mut sql = "SELECT day, progress FROM goal_progress_snapshots WHERE goal_id = ?".to_owned();
                let mut params = vec![Value::Text(id.clone())];
                if let Some(from) = query.from.as_ref().filter(|from| !from.is_empty()) {
                    sql.push_str(" AND day >= ?");
                    params.push(Value::Text(from.clone()));
                }
                if let Some(to) = query.to.as_ref().filter(|to| !to.is_empty()) {
                    sql.push_str(" AND day <= ?");
                    params.push(Value::Text(to.clone()));
                }
                sql.push_str(" ORDER BY day ASC");
                let items = query_all(conn, &sql, &params, |row| {
                    Ok(ProgressPoint { day: row.get(0)?, progress: row.get(1)? })
                })?;
                // The value carried into the range, for charts that start before the first snapshot in it.
                let starting_progress = match query.from.filter(|from| !from.is_empty()) {
                    Some(from) => query_first(
                        conn,
                        "SELECT progress FROM goal_progress_snapshots WHERE goal_id = ? AND day < ? ORDER BY day DESC LIMIT 1",
                        &[Value::Text(id), Value::Text(from)],
                        |row| row.get::<_, i64>(0),
                    )?,
                    None => None,
                };
                Ok(Ok(ProgressHistory { items, starting_progress }))
            })
            .await?
    }

    /// Appends the milestone at the end of the goal's list.
    pub async fn add_milestone(&self, goal_id: &str, input: CreateMilestoneBody) -> ApiResult<GoalMilestone> {
        let goal_id = goal_id.to_owned();
        self.db
            .call(move |conn| {
                let Some(goal) = find_goal(conn, &goal_id)? else { return Ok(Err(not_found())) };
                let total = query_first(
                    conn,
                    "SELECT count(*) FROM goal_milestones WHERE goal_id = ? AND deleted_at IS NULL",
                    &[Value::Text(goal_id.clone())],
                    |row| row.get::<_, i64>(0),
                )?
                .unwrap_or(0);
                let row = insert_milestone(
                    conn,
                    NewGoalMilestone {
                        id: new_id(),
                        goal_id,
                        title: input.title,
                        due_at: input.due_at.flatten(),
                        order: Some(total),
                        ..Default::default()
                    },
                )?;
                summarize(conn, vec![goal], clock::now())?;
                Ok(Ok(row))
            })
            .await?
    }

    pub async fn update_milestone(
        &self,
        goal_id: &str,
        milestone_id: &str,
        input: UpdateMilestoneBody,
    ) -> ApiResult<GoalMilestone> {
        let mut set = Assignments::new();
        set.maybe("title", input.title)
            .maybe("due_at", input.due_at.map(time_opt))
            .maybe("completed_at", input.completed_at.map(time_opt))
            .set("updated_at", time_value(clock::now()));
        let set = set.into_fragment();
        let mut params = set.params;
        params.push(Value::Text(milestone_id.to_owned()));
        params.push(Value::Text(goal_id.to_owned()));
        let goal_id = goal_id.to_owned();
        self.db
            .call(move |conn| {
                let row = query_first(
                    conn,
                    &format!("UPDATE goal_milestones SET {} WHERE {MILESTONE_WHERE} RETURNING *", set.sql),
                    &params,
                    GoalMilestone::from_row,
                )?;
                let Some(row) = row else { return Ok(Err(milestone_not_found())) };
                let Some(goal) = find_goal(conn, &goal_id)? else { return Ok(Err(not_found())) };
                summarize(conn, vec![goal], clock::now())?;
                Ok(Ok(row))
            })
            .await?
    }

    pub async fn remove_milestone(&self, goal_id: &str, milestone_id: &str) -> ApiResult<()> {
        let params =
            vec![time_value(clock::now()), Value::Text(milestone_id.to_owned()), Value::Text(goal_id.to_owned())];
        let goal_id = goal_id.to_owned();
        self.db
            .call(move |conn| {
                let row = query_first(
                    conn,
                    &format!("UPDATE goal_milestones SET deleted_at = ? WHERE {MILESTONE_WHERE} RETURNING id"),
                    &params,
                    |row| row.get::<_, String>(0),
                )?;
                if row.is_none() {
                    return Ok(Err(milestone_not_found()));
                }
                let Some(goal) = find_goal(conn, &goal_id)? else { return Ok(Err(not_found())) };
                summarize(conn, vec![goal], clock::now())?;
                Ok(Ok(()))
            })
            .await?
    }
}

const MILESTONE_WHERE: &str = "id = ? AND goal_id = ? AND deleted_at IS NULL";

fn not_found() -> ApiError {
    ApiError::not_found("Goal not found.")
}

fn milestone_not_found() -> ApiError {
    ApiError::not_found("Milestone not found.")
}

fn find_goal(conn: &Connection, id: &str) -> rusqlite::Result<Option<Goal>> {
    query_first(
        conn,
        "SELECT * FROM goals WHERE id = ? AND deleted_at IS NULL",
        &[Value::Text(id.to_owned())],
        Goal::from_row,
    )
}

fn milestones_of(conn: &Connection, goal_id: &str) -> rusqlite::Result<Vec<GoalMilestone>> {
    query_all(
        conn,
        r#"SELECT * FROM goal_milestones WHERE goal_id = ? AND deleted_at IS NULL ORDER BY "order" ASC"#,
        &[Value::Text(goal_id.to_owned())],
        GoalMilestone::from_row,
    )
}

fn summarize_one(conn: &Connection, goal: Goal, now: Timestamp) -> rusqlite::Result<Option<GoalSummary>> {
    Ok(summarize(conn, vec![goal], now)?.into_iter().next())
}

/// Adds the derived progress, breakdown and risk, and records today's snapshot when progress moved.
fn summarize(conn: &Connection, rows: Vec<Goal>, now: Timestamp) -> rusqlite::Result<Vec<GoalSummary>> {
    if rows.is_empty() {
        return Ok(Vec::new());
    }
    let parts = load_parts(conn, &rows, now)?;
    let summaries: Vec<GoalSummary> = rows
        .into_iter()
        .map(|mut goal| {
            let breakdown = goal_breakdown(&goal, &parts, now);
            if goal.progress_mode == GoalProgressMode::Auto {
                goal.progress = auto_progress(&breakdown);
            }
            let RiskInfo { expected_progress, risk } = goal_risk(&goal, goal.progress, now);
            let milestone_markers = parts
                .milestones
                .iter()
                .filter(|item| item.goal_id == goal.id)
                .filter_map(|item| {
                    item.due_at.map(|due_at| MilestoneMarker {
                        id: item.id.clone(),
                        title: item.title.clone(),
                        due_at,
                        completed_at: item.completed_at,
                    })
                })
                .collect();
            GoalSummary { goal, breakdown, expected_progress, risk, milestone_markers }
        })
        .collect();
    record_snapshots(conn, &summaries, &to_day_key(now))?;
    Ok(summaries)
}

fn text_values<'a>(ids: impl IntoIterator<Item = &'a String>) -> Vec<Value> {
    ids.into_iter().collect::<HashSet<_>>().into_iter().map(|id| Value::Text(id.clone())).collect()
}

fn load_parts(conn: &Connection, rows: &[Goal], now: Timestamp) -> rusqlite::Result<GoalParts> {
    let goal_ids: Vec<Value> = rows.iter().map(|goal| Value::Text(goal.id.clone())).collect();
    let task_ids = text_values(rows.iter().flat_map(|goal| &goal.linked_task_ids));
    let habit_ids = text_values(rows.iter().flat_map(|goal| &goal.linked_habit_ids));
    let earliest = rows.iter().fold(to_day_key(add_days(now, 1)), |day, goal| {
        let start = to_day_key(goal.start_at.unwrap_or(goal.created_at));
        if start < day { start } else { day }
    });

    let milestones = query_all(
        conn,
        &format!(
            r#"SELECT id, goal_id, title, due_at, completed_at FROM goal_milestones WHERE goal_id IN ({}) AND deleted_at IS NULL ORDER BY "order" ASC"#,
            placeholders(goal_ids.len())
        ),
        &goal_ids,
        |row| {
            Ok(MilestoneRow {
                id: row.get("id")?,
                goal_id: row.get("goal_id")?,
                title: row.get("title")?,
                due_at: get_timestamp_opt(row, "due_at")?,
                completed_at: get_timestamp_opt(row, "completed_at")?,
            })
        },
    )?;
    let tasks = if task_ids.is_empty() {
        Vec::new()
    } else {
        query_all(
            conn,
            &format!(
                "SELECT id, status FROM tasks WHERE id IN ({}) AND deleted_at IS NULL",
                placeholders(task_ids.len())
            ),
            &task_ids,
            |row| Ok(TaskRow { id: row.get("id")?, status: row.get("status")? }),
        )?
    };
    let (habits, logs) = if habit_ids.is_empty() {
        (Vec::new(), Vec::new())
    } else {
        let marks = placeholders(habit_ids.len());
        let habits = query_all(
            conn,
            &format!("SELECT id, target, created_at FROM habits WHERE id IN ({marks}) AND deleted_at IS NULL"),
            &habit_ids,
            |row| {
                Ok(HabitRow {
                    id: row.get("id")?,
                    target: row.get("target")?,
                    created_at: get_timestamp(row, "created_at")?,
                })
            },
        )?;
        let mut params = habit_ids;
        params.push(Value::Text(earliest));
        let logs = query_all(
            conn,
            &format!("SELECT habit_id, day, count, target FROM habit_logs WHERE habit_id IN ({marks}) AND day >= ?"),
            &params,
            |row| {
                Ok(LogRow {
                    habit_id: row.get("habit_id")?,
                    day: row.get("day")?,
                    count: row.get("count")?,
                    target: row.get("target")?,
                })
            },
        )?;
        (habits, logs)
    };
    Ok(GoalParts { milestones, tasks, habits, logs })
}

fn record_snapshots(conn: &Connection, summaries: &[GoalSummary], day: &str) -> rusqlite::Result<()> {
    let goal_ids: Vec<Value> = summaries.iter().map(|summary| Value::Text(summary.goal.id.clone())).collect();
    // With max(), SQLite takes the bare `progress` from the row holding the latest day.
    let latest = query_all(
        conn,
        &format!(
            "SELECT goal_id, max(day), progress FROM goal_progress_snapshots WHERE goal_id IN ({}) GROUP BY goal_id",
            placeholders(goal_ids.len())
        ),
        &goal_ids,
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(2)?)),
    )?;
    let changed: Vec<&GoalSummary> = summaries
        .iter()
        .filter(|summary| {
            latest.iter().find(|(goal_id, _)| *goal_id == summary.goal.id).map(|(_, progress)| *progress)
                != Some(summary.goal.progress)
        })
        .collect();
    if changed.is_empty() {
        return Ok(());
    }

    let now = time_value(clock::now());
    let mut params = Vec::with_capacity(changed.len() * 6 + 1);
    for summary in &changed {
        params.extend([
            Value::Text(new_id()),
            Value::Text(summary.goal.id.clone()),
            Value::Text(day.to_owned()),
            Value::Integer(summary.goal.progress),
            now.clone(),
            now.clone(),
        ]);
    }
    params.push(now);
    let values = vec!["(?, ?, ?, ?, ?, ?)"; changed.len()].join(", ");
    conn.execute(
        &format!(
            "INSERT INTO goal_progress_snapshots (id, goal_id, day, progress, created_at, updated_at) VALUES {values} ON CONFLICT (goal_id, day) DO UPDATE SET progress = excluded.progress, updated_at = ?"
        ),
        rusqlite::params_from_iter(params.iter()),
    )?;
    Ok(())
}

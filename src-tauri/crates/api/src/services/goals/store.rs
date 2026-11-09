use super::*;
use crate::clock;
use crate::db::columns::{Timestamp, get_timestamp, get_timestamp_opt, new_id};
use crate::db::schema::goals::{Goal, GoalMilestone, GoalProgressMode};
use crate::error::ApiError;
use crate::services::date::{add_days, to_day_key};
use crate::services::query::{placeholders, query_all, query_first, time_value};
use rusqlite::Connection;
use rusqlite::types::Value;
use std::collections::HashSet;

pub(super) const MILESTONE_WHERE: &str = "id = ? AND goal_id = ? AND deleted_at IS NULL";

pub(super) fn not_found() -> ApiError {
    ApiError::not_found("Goal not found.")
}

pub(super) fn milestone_not_found() -> ApiError {
    ApiError::not_found("Milestone not found.")
}

pub(super) fn find_goal(conn: &Connection, id: &str) -> rusqlite::Result<Option<Goal>> {
    query_first(
        conn,
        "SELECT * FROM goals WHERE id = ? AND deleted_at IS NULL",
        &[Value::Text(id.to_owned())],
        Goal::from_row,
    )
}

pub(super) fn milestones_of(conn: &Connection, goal_id: &str) -> rusqlite::Result<Vec<GoalMilestone>> {
    query_all(
        conn,
        r#"SELECT * FROM goal_milestones WHERE goal_id = ? AND deleted_at IS NULL ORDER BY "order" ASC"#,
        &[Value::Text(goal_id.to_owned())],
        GoalMilestone::from_row,
    )
}

pub(super) fn summarize_one(conn: &Connection, goal: Goal, now: Timestamp) -> rusqlite::Result<Option<GoalSummary>> {
    Ok(summarize(conn, vec![goal], now)?.into_iter().next())
}

/// Adds the derived progress, breakdown and risk, and records today's snapshot when progress moved.
pub(super) fn summarize(conn: &Connection, rows: Vec<Goal>, now: Timestamp) -> rusqlite::Result<Vec<GoalSummary>> {
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

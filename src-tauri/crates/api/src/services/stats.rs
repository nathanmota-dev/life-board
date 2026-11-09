use rusqlite::types::Value;
use rusqlite::{Connection, params};
use serde::Serialize;

use crate::db::Db;
use crate::db::columns::{Timestamp, to_iso, to_millis};
use crate::error::ApiResult;
use crate::services::date::{add_days, start_of_week, to_day_key};

/// `GET /stats/this-week`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeekStats {
    /// ISO string of the local Sunday midnight that starts the week.
    pub week_start: String,
    pub thoughts_created: i64,
    pub tasks_completed: i64,
    pub events_count: i64,
    pub milestones_hit: i64,
    pub habit_goals_met: i64,
}

#[derive(Clone)]
pub struct StatsService {
    db: Db,
}

impl StatsService {
    pub fn new(db: Db) -> Self {
        Self { db }
    }

    /// Counts from Sunday to Saturday of the week containing `now`.
    pub async fn this_week(&self, now: Timestamp) -> ApiResult<WeekStats> {
        let start = start_of_week(now);
        let end = add_days(start, 7);
        let (from, to) = (to_millis(start), to_millis(end));
        let (first_day, end_day) = (to_day_key(start), to_day_key(end));
        Ok(self
            .db
            .call(move |conn| {
                Ok(WeekStats {
                    week_start: to_iso(start),
                    thoughts_created: count_between(conn, "thoughts", "created_at", "", from, to)?,
                    // Ticked checklist items aren't tasks of their own.
                    tasks_completed: count_between(conn, "tasks", "completed_at", "AND parent_task_id IS NULL", from, to)?,
                    events_count: count_between(conn, "calendar_events", "start_at", "", from, to)?,
                    milestones_hit: count_between(conn, "goal_milestones", "completed_at", "", from, to)?,
                    // Days in the week where a habit's daily goal was met.
                    habit_goals_met: conn.query_row(
                        "SELECT count(*) FROM habit_logs INNER JOIN habits ON habits.id = habit_logs.habit_id WHERE habits.deleted_at IS NULL AND habit_logs.day >= ? AND habit_logs.day < ? AND habit_logs.count >= coalesce(habit_logs.target, habits.target)",
                        [Value::Text(first_day), Value::Text(end_day)],
                        |row| row.get(0),
                    )?,
                })
            })
            .await?)
    }
}

/// Rows of `table` that aren't deleted with `column` inside the week.
fn count_between(
    conn: &Connection,
    table: &str,
    column: &str,
    extra: &str,
    from: i64,
    to: i64,
) -> rusqlite::Result<i64> {
    conn.query_row(
        &format!("SELECT count(*) FROM {table} WHERE deleted_at IS NULL {extra} AND {column} >= ? AND {column} < ?"),
        params![from, to],
        |row| row.get(0),
    )
}

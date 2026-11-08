use std::collections::HashSet;

use chrono::Utc;
use rusqlite::params;
use rusqlite::types::Value;
use serde::Serialize;

use crate::db::Db;
use crate::db::columns::{Timestamp, new_id};
use crate::db::schema::habits::{Habit, NewHabit, insert_habit};
use crate::dto::habits::{CreateHabitBody, ListHabitLogsQuery, LogHabitBody, SetHabitLogBody, UpdateHabitBody};
use crate::error::{ApiError, ApiResult};
use crate::services::date::{add_days, to_day_key};
use crate::services::query::{Assignments, SqlFragment, and, placeholders, query_all, query_first, time_value};

/// `HabitSummary`: the habit plus today's progress.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitSummary {
    #[serde(flatten)]
    pub habit: Habit,
    pub today_count: i64,
    pub done_today: bool,
    pub streak: i64,
}

/// What `log` and `setLog` return.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitDayCount {
    pub habit_id: String,
    pub day: String,
    pub count: i64,
}

/// One row of `GET /habits/logs`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitLogEntry {
    pub habit_id: String,
    pub day: String,
    pub count: i64,
    pub target: Option<i64>,
}

/// Consecutive days the goal was met. An unfinished today doesn't break the streak.
pub fn get_streak(done_days: &HashSet<String>, today: Timestamp) -> i64 {
    let mut offset = if done_days.contains(&to_day_key(today)) { 0 } else { 1 };
    let mut streak = 0;
    while done_days.contains(&to_day_key(add_days(today, -offset))) {
        streak += 1;
        offset += 1;
    }
    streak
}

#[derive(Clone)]
pub struct HabitsService {
    db: Db,
}

impl HabitsService {
    pub fn new(db: Db) -> Self {
        Self { db }
    }

    /// Habits by creation; past days count against the goal recorded that day.
    pub async fn list(&self, today: Timestamp) -> ApiResult<Vec<HabitSummary>> {
        let (habits, logs) = self
            .db
            .call(|conn| {
                let habits = query_all(
                    conn,
                    "SELECT * FROM habits WHERE deleted_at IS NULL ORDER BY created_at ASC",
                    &[],
                    Habit::from_row,
                )?;
                if habits.is_empty() {
                    return Ok((habits, Vec::new()));
                }
                let ids: Vec<Value> = habits.iter().map(|habit| Value::Text(habit.id.clone())).collect();
                let logs = query_all(
                    conn,
                    &format!(
                        "SELECT habit_id, day, count, target FROM habit_logs WHERE habit_id IN ({})",
                        placeholders(ids.len())
                    ),
                    &ids,
                    log_entry,
                )?;
                Ok((habits, logs))
            })
            .await?;

        let today_key = to_day_key(today);
        Ok(habits
            .into_iter()
            .map(|habit| {
                let own: Vec<&HabitLogEntry> = logs.iter().filter(|log| log.habit_id == habit.id).collect();
                let done_days: HashSet<String> = own
                    .iter()
                    .filter(|log| {
                        let goal = if log.day == today_key { habit.target } else { log.target.unwrap_or(habit.target) };
                        log.count >= goal
                    })
                    .map(|log| log.day.clone())
                    .collect();
                let today_count = own.iter().find(|log| log.day == today_key).map_or(0, |log| log.count);
                HabitSummary {
                    today_count,
                    done_today: today_count >= habit.target,
                    streak: get_streak(&done_days, today),
                    habit,
                }
            })
            .collect())
    }

    pub async fn create(&self, input: CreateHabitBody) -> ApiResult<Habit> {
        let row = NewHabit {
            id: new_id(),
            name: input.name,
            unit: input.unit,
            target: input.target,
            step: input.step,
            emoji: input.emoji,
            ..Default::default()
        };
        Ok(self.db.call(move |conn| insert_habit(conn, row)).await?)
    }

    /// A new `target` also becomes today's recorded goal.
    pub async fn update(&self, id: &str, input: UpdateHabitBody) -> ApiResult<Habit> {
        let id = id.to_owned();
        let today = to_day_key(Utc::now());
        self.db
            .call(move |conn| {
                let tx = conn.transaction()?;
                let mut set = Assignments::new();
                set.maybe("name", input.name)
                    .maybe("unit", input.unit)
                    .maybe("target", input.target)
                    .maybe("step", input.step)
                    .maybe("emoji", input.emoji)
                    .set("updated_at", time_value(Utc::now()));
                let set = set.into_fragment();
                let mut params = set.params;
                params.push(Value::Text(id.clone()));
                let row = query_first(
                    &tx,
                    &format!("UPDATE habits SET {} WHERE id = ? AND deleted_at IS NULL RETURNING *", set.sql),
                    &params,
                    Habit::from_row,
                )?;
                let Some(row) = row else { return Ok(Err(not_found())) };
                if let Some(target) = input.target {
                    tx.execute(
                        "UPDATE habit_logs SET target = ? WHERE habit_id = ? AND day = ?",
                        params![target, id, today],
                    )?;
                }
                tx.commit()?;
                Ok(Ok(row))
            })
            .await?
    }

    /// Soft delete.
    pub async fn remove(&self, id: &str) -> ApiResult<()> {
        let params = vec![time_value(Utc::now()), Value::Text(id.to_owned())];
        self.db
            .call(move |conn| {
                query_first(
                    conn,
                    "UPDATE habits SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL RETURNING id",
                    &params,
                    |row| row.get::<_, String>(0),
                )
            })
            .await?
            .map(|_| ())
            .ok_or_else(not_found)
    }

    /// Adds `delta` to the day's count (never below zero); `400 future_day` after today.
    pub async fn log(&self, habit_id: &str, input: LogHabitBody) -> ApiResult<HabitDayCount> {
        let day = input.day.unwrap_or_else(|| to_day_key(Utc::now()));
        let count = SqlFragment::new("max(0, habit_logs.count + ?)", vec![Value::Integer(input.delta)]);
        self.upsert_log(habit_id, day, input.delta.max(0), count).await
    }

    /// Replaces the day's count, so a forgotten or wrong check-in on a past day can be fixed.
    pub async fn set_log(&self, habit_id: &str, day: &str, input: SetHabitLogBody) -> ApiResult<HabitDayCount> {
        let count = SqlFragment::new("?", vec![Value::Integer(input.count)]);
        self.upsert_log(habit_id, day.to_owned(), input.count, count).await
    }

    async fn upsert_log(
        &self,
        habit_id: &str,
        day: String,
        initial: i64,
        count: SqlFragment,
    ) -> ApiResult<HabitDayCount> {
        let habit_id = habit_id.to_owned();
        let habit = self
            .db
            .call({
                let habit_id = habit_id.clone();
                move |conn| {
                    query_first(
                        conn,
                        "SELECT id, target FROM habits WHERE id = ? AND deleted_at IS NULL",
                        &[Value::Text(habit_id)],
                        |row| row.get::<_, i64>("target"),
                    )
                }
            })
            .await?;
        let Some(target) = habit else { return Err(not_found()) };
        let today = to_day_key(Utc::now());
        if day > today {
            return Err(ApiError::bad_request("future_day", "Habits can't be logged for a future day."));
        }

        let now = time_value(Utc::now());
        // Past days keep the goal recorded at the time; only today follows the current goal.
        let target_update = if day == today {
            SqlFragment::new("?", vec![Value::Integer(target)])
        } else {
            SqlFragment::new("coalesce(habit_logs.target, ?)", vec![Value::Integer(target)])
        };
        let sql = format!(
            "INSERT INTO habit_logs (id, habit_id, day, count, target, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) \
             ON CONFLICT (habit_id, day) DO UPDATE SET count = {}, target = {}, updated_at = ? \
             RETURNING habit_id, day, count",
            count.sql, target_update.sql
        );
        let mut params = vec![
            Value::Text(new_id()),
            Value::Text(habit_id),
            Value::Text(day),
            Value::Integer(initial),
            Value::Integer(target),
            now.clone(),
            now.clone(),
        ];
        params.extend(count.params);
        params.extend(target_update.params);
        params.push(now);
        self.db
            .call(move |conn| {
                query_first(conn, &sql, &params, |row| {
                    Ok(HabitDayCount { habit_id: row.get(0)?, day: row.get(1)?, count: row.get(2)? })
                })
            })
            .await?
            .ok_or_else(not_found)
    }

    /// Logs by day within the optional range and habit.
    pub async fn logs(&self, query: ListHabitLogsQuery) -> ApiResult<Vec<HabitLogEntry>> {
        let mut conditions = Vec::new();
        // Day keys are zero-padded, so string comparison is chronological.
        if let Some(from) = query.from.filter(|from| !from.is_empty()) {
            conditions.push(SqlFragment::new("day >= ?", vec![Value::Text(from)]));
        }
        if let Some(to) = query.to.filter(|to| !to.is_empty()) {
            conditions.push(SqlFragment::new("day <= ?", vec![Value::Text(to)]));
        }
        if let Some(habit_id) = query.habit_id.filter(|habit_id| !habit_id.is_empty()) {
            conditions.push(SqlFragment::new("habit_id = ?", vec![Value::Text(habit_id)]));
        }
        let filter = (!conditions.is_empty()).then(|| and(conditions));
        let (clause, params) =
            filter.map_or((String::new(), Vec::new()), |filter| (format!(" WHERE {}", filter.sql), filter.params));
        let sql = format!("SELECT habit_id, day, count, target FROM habit_logs{clause} ORDER BY day ASC");
        Ok(self.db.call(move |conn| query_all(conn, &sql, &params, log_entry)).await?)
    }
}

fn not_found() -> ApiError {
    ApiError::not_found("Habit not found.")
}

fn log_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<HabitLogEntry> {
    Ok(HabitLogEntry {
        habit_id: row.get("habit_id")?,
        day: row.get("day")?,
        count: row.get("count")?,
        target: row.get("target")?,
    })
}

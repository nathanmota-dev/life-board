use std::collections::HashSet;

use serde::Serialize;

use crate::db::Db;
use crate::db::columns::Timestamp;
use crate::db::schema::habits::Habit;
use crate::dto::habits::{CreateHabitBody, ListHabitLogsQuery, LogHabitBody, SetHabitLogBody, UpdateHabitBody};
use crate::error::ApiResult;

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
    pending!(51, done_days, today)
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
        pending!(51, self.db, today)
    }

    pub async fn create(&self, input: CreateHabitBody) -> ApiResult<Habit> {
        pending!(51, self.db, input)
    }

    /// A new `target` also becomes today's recorded goal.
    pub async fn update(&self, id: &str, input: UpdateHabitBody) -> ApiResult<Habit> {
        pending!(51, self.db, id, input)
    }

    /// Soft delete.
    pub async fn remove(&self, id: &str) -> ApiResult<()> {
        pending!(51, self.db, id)
    }

    /// Adds `delta` to the day's count (never below zero); `400 future_day` after today.
    pub async fn log(&self, habit_id: &str, input: LogHabitBody) -> ApiResult<HabitDayCount> {
        pending!(51, self.db, habit_id, input)
    }

    /// Replaces the day's count, so a forgotten or wrong check-in on a past day can be fixed.
    pub async fn set_log(&self, habit_id: &str, day: &str, input: SetHabitLogBody) -> ApiResult<HabitDayCount> {
        pending!(51, self.db, habit_id, day, input)
    }

    /// Logs by day within the optional range and habit.
    pub async fn logs(&self, query: ListHabitLogsQuery) -> ApiResult<Vec<HabitLogEntry>> {
        pending!(51, self.db, query)
    }
}

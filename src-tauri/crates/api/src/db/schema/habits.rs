use serde::Serialize;

use crate::db::columns::{Timestamp, js_date, js_date_opt};
use crate::db::{Db, DbError};

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Habit {
    pub id: String,
    pub name: String,
    pub unit: String,
    pub target: i64,
    pub step: i64,
    pub emoji: String,
    #[serde(with = "js_date")]
    pub created_at: Timestamp,
    #[serde(with = "js_date")]
    pub updated_at: Timestamp,
    #[serde(with = "js_date_opt")]
    pub deleted_at: Option<Timestamp>,
}

/// One row per habit per local day, holding how many times it was logged.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitLog {
    pub id: String,
    pub habit_id: String,
    pub day: String,
    pub count: i64,
    /// The daily goal recorded for that day; `None` on rows from before 0003.
    pub target: Option<i64>,
    #[serde(with = "js_date")]
    pub created_at: Timestamp,
    #[serde(with = "js_date")]
    pub updated_at: Timestamp,
}

/// Defaults: unit "times", step 1, emoji "🌱", timestamps now.
#[derive(Debug, Clone, Default)]
pub struct NewHabit {
    pub id: String,
    pub name: String,
    pub unit: Option<String>,
    pub target: i64,
    pub step: Option<i64>,
    pub emoji: Option<String>,
    pub created_at: Option<Timestamp>,
    pub updated_at: Option<Timestamp>,
    pub deleted_at: Option<Timestamp>,
}

/// Defaults: count 0, target NULL, timestamps now.
#[derive(Debug, Clone, Default)]
pub struct NewHabitLog {
    pub id: String,
    pub habit_id: String,
    pub day: String,
    pub count: Option<i64>,
    pub target: Option<i64>,
    pub created_at: Option<Timestamp>,
    pub updated_at: Option<Timestamp>,
}

impl Habit {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        pending!(51, row)
    }
}

impl HabitLog {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        pending!(51, row)
    }
}

pub async fn insert_habits(db: &Db, rows: Vec<NewHabit>) -> Result<(), DbError> {
    pending!(51, db, rows)
}

pub async fn insert_logs(db: &Db, rows: Vec<NewHabitLog>) -> Result<(), DbError> {
    pending!(51, db, rows)
}

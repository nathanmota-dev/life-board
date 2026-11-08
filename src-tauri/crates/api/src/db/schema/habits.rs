use serde::Serialize;

use chrono::Utc;
use rusqlite::params;

use crate::db::columns::{Timestamp, get_timestamp, get_timestamp_opt, js_date, js_date_opt, to_millis};
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
        Ok(Self {
            id: row.get("id")?,
            name: row.get("name")?,
            unit: row.get("unit")?,
            target: row.get("target")?,
            step: row.get("step")?,
            emoji: row.get("emoji")?,
            created_at: get_timestamp(row, "created_at")?,
            updated_at: get_timestamp(row, "updated_at")?,
            deleted_at: get_timestamp_opt(row, "deleted_at")?,
        })
    }
}

impl HabitLog {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            habit_id: row.get("habit_id")?,
            day: row.get("day")?,
            count: row.get("count")?,
            target: row.get("target")?,
            created_at: get_timestamp(row, "created_at")?,
            updated_at: get_timestamp(row, "updated_at")?,
        })
    }
}

/// Inserts one habit with the column defaults filled in and returns it.
pub fn insert_habit(conn: &rusqlite::Connection, row: NewHabit) -> rusqlite::Result<Habit> {
    let now = Utc::now();
    conn.query_row(
        "INSERT INTO habits (id, name, unit, target, step, emoji, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *",
        params![
            row.id,
            row.name,
            row.unit.unwrap_or_else(|| "times".to_owned()),
            row.target,
            row.step.unwrap_or(1),
            row.emoji.unwrap_or_else(|| "🌱".to_owned()),
            to_millis(row.created_at.unwrap_or(now)),
            to_millis(row.updated_at.unwrap_or(now)),
            row.deleted_at.map(to_millis),
        ],
        Habit::from_row,
    )
}

pub async fn insert_habits(db: &Db, rows: Vec<NewHabit>) -> Result<(), DbError> {
    db.call(move |conn| {
        let tx = conn.transaction()?;
        for row in rows {
            insert_habit(&tx, row)?;
        }
        tx.commit()
    })
    .await
}

pub async fn insert_logs(db: &Db, rows: Vec<NewHabitLog>) -> Result<(), DbError> {
    db.call(move |conn| {
        let tx = conn.transaction()?;
        let now = Utc::now();
        for row in rows {
            tx.execute(
                "INSERT INTO habit_logs (id, habit_id, day, count, target, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                params![
                    row.id,
                    row.habit_id,
                    row.day,
                    row.count.unwrap_or(0),
                    row.target,
                    to_millis(row.created_at.unwrap_or(now)),
                    to_millis(row.updated_at.unwrap_or(now)),
                ],
            )?;
        }
        tx.commit()
    })
    .await
}

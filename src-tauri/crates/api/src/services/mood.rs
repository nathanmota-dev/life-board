use crate::clock;
use serde::Serialize;

use rusqlite::types::Value;

use crate::db::Db;
use crate::db::columns::{Timestamp, new_id, to_iso};
use crate::db::schema::mood::{MoodEntry, NewMoodEntry, insert_row};
use crate::dto::mood::UpsertMoodBody;
use crate::error::{ApiError, ApiResult};
use crate::services::date::{add_days, from_day_key, to_day_key};
use crate::services::query::{Assignments, list_value, query_all, query_first, time_value};

/// `GET /mood/today`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoodToday {
    pub day: String,
    pub entry: Option<MoodEntry>,
    /// Local midnight of the next day, as an ISO string.
    pub next_available_at: String,
}

/// The entry and whether it was created (201) or updated (200).
#[derive(Debug, Clone, PartialEq)]
pub struct MoodUpsert {
    pub entry: MoodEntry,
    pub created: bool,
}

#[derive(Clone)]
pub struct MoodService {
    db: Db,
}

impl MoodService {
    pub fn new(db: Db) -> Self {
        Self { db }
    }

    pub async fn today(&self, now: Timestamp) -> ApiResult<MoodToday> {
        let day = to_day_key(now);
        let entry = self.find_day(&day).await?;
        let next = from_day_key(&day).map(|midnight| add_days(midnight, 1)).unwrap_or(now);
        Ok(MoodToday { day, entry, next_available_at: to_iso(next) })
    }

    /// Newest day first.
    pub async fn list(&self, limit: i64) -> ApiResult<Vec<MoodEntry>> {
        Ok(self
            .db
            .call(move |conn| {
                query_all(
                    conn,
                    "SELECT * FROM mood_entries ORDER BY day DESC LIMIT ?",
                    &[Value::Integer(limit)],
                    MoodEntry::from_row,
                )
            })
            .await?)
    }

    /// One entry per day: re-submitting the same day refines the existing entry.
    pub async fn upsert(&self, input: UpsertMoodBody) -> ApiResult<MoodUpsert> {
        let day = input.day.unwrap_or_else(|| to_day_key(clock::now()));
        let note = input.note.flatten();
        if let Some(existing) = self.find_day(&day).await? {
            let mut set = Assignments::new();
            set.set("score", input.score)
                .set("note", note)
                .maybe("linked_task_ids", input.linked_task_ids.as_deref().map(list_value))
                .set("updated_at", time_value(clock::now()));
            let set = set.into_fragment();
            let mut params = set.params;
            params.push(Value::Text(existing.id));
            let sql = format!("UPDATE mood_entries SET {} WHERE id = ? RETURNING *", set.sql);
            let entry = self
                .db
                .call(move |conn| query_first(conn, &sql, &params, MoodEntry::from_row))
                .await?
                .ok_or_else(|| ApiError::not_found("Mood entry not found."))?;
            return Ok(MoodUpsert { entry, created: false });
        }
        let row = NewMoodEntry {
            id: new_id(),
            day,
            score: input.score,
            note,
            linked_task_ids: input.linked_task_ids,
            ..Default::default()
        };
        let entry = self.db.call(move |conn| insert_row(conn, row)).await?;
        Ok(MoodUpsert { entry, created: true })
    }

    /// Hard delete.
    pub async fn remove(&self, id: &str) -> ApiResult<()> {
        let id = id.to_owned();
        self.db
            .call(move |conn| {
                query_first(conn, "DELETE FROM mood_entries WHERE id = ? RETURNING id", &[Value::Text(id)], |row| {
                    row.get::<_, String>(0)
                })
            })
            .await?
            .map(|_| ())
            .ok_or_else(|| ApiError::not_found("Mood entry not found."))
    }

    async fn find_day(&self, day: &str) -> ApiResult<Option<MoodEntry>> {
        let day = day.to_owned();
        Ok(self
            .db
            .call(move |conn| {
                query_first(conn, "SELECT * FROM mood_entries WHERE day = ?", &[Value::Text(day)], MoodEntry::from_row)
            })
            .await?)
    }
}

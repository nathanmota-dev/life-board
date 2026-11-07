use serde::Serialize;

use crate::db::Db;
use crate::db::columns::Timestamp;
use crate::db::schema::mood::MoodEntry;
use crate::dto::mood::UpsertMoodBody;
use crate::error::ApiResult;

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
        pending!(51, self.db, now)
    }

    /// Newest day first.
    pub async fn list(&self, limit: i64) -> ApiResult<Vec<MoodEntry>> {
        pending!(51, self.db, limit)
    }

    /// One entry per day: re-submitting the same day refines the existing entry.
    pub async fn upsert(&self, input: UpsertMoodBody) -> ApiResult<MoodUpsert> {
        pending!(51, self.db, input)
    }

    /// Hard delete.
    pub async fn remove(&self, id: &str) -> ApiResult<()> {
        pending!(51, self.db, id)
    }
}

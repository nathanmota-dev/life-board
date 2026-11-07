use serde::Serialize;

use crate::db::Db;
use crate::db::columns::Timestamp;
use crate::error::ApiResult;

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
        pending!(52, self.db, now)
    }
}

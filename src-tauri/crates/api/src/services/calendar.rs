use crate::db::Db;
use crate::db::columns::Timestamp;
use crate::db::schema::calendar::CalendarEvent;
use crate::dto::calendar::{CreateEventBody, ListEventsQuery, UpdateEventBody};
use crate::error::ApiResult;

#[derive(Clone)]
pub struct CalendarService {
    db: Db,
}

impl CalendarService {
    pub fn new(db: Db) -> Self {
        Self { db }
    }

    /// Events not deleted, by `startAt`, within the optional `from`/`to` range.
    pub async fn list(&self, query: ListEventsQuery) -> ApiResult<Vec<CalendarEvent>> {
        pending!(51, self.db, query)
    }

    /// `400 invalid_range` when `endAt` is before `startAt`.
    pub async fn create(&self, input: CreateEventBody) -> ApiResult<CalendarEvent> {
        pending!(51, self.db, input)
    }

    /// Checks the range against the stored dates; `404` for missing or deleted events.
    pub async fn update(&self, id: &str, input: UpdateEventBody) -> ApiResult<CalendarEvent> {
        pending!(51, self.db, id, input)
    }

    /// Soft delete.
    pub async fn remove(&self, id: &str) -> ApiResult<()> {
        pending!(51, self.db, id)
    }
}

/// `assertValidRange`.
pub fn assert_valid_range(start_at: Timestamp, end_at: Timestamp) -> ApiResult<()> {
    pending!(51, start_at, end_at)
}

use chrono::Utc;
use rusqlite::types::Value;

use crate::db::Db;
use crate::db::columns::{Timestamp, new_id, to_bool};
use crate::db::schema::calendar::{CalendarEvent, NewCalendarEvent, insert_row};
use crate::dto::calendar::{CreateEventBody, ListEventsQuery, UpdateEventBody};
use crate::error::{ApiError, ApiResult};
use crate::services::query::{Assignments, SqlFragment, and, list_value, query_all, query_first, time_value};

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
        let mut conditions = vec![SqlFragment::raw("deleted_at IS NULL")];
        if let Some(from) = query.from {
            conditions.push(SqlFragment::new("start_at >= ?", vec![time_value(from)]));
        }
        if let Some(to) = query.to {
            conditions.push(SqlFragment::new("start_at <= ?", vec![time_value(to)]));
        }
        let filter = and(conditions);
        let mut params = filter.params;
        params.push(Value::Integer(query.limit));
        let sql = format!("SELECT * FROM calendar_events WHERE {} ORDER BY start_at ASC LIMIT ?", filter.sql);
        Ok(self.db.call(move |conn| query_all(conn, &sql, &params, CalendarEvent::from_row)).await?)
    }

    /// `400 invalid_range` when `endAt` is before `startAt`.
    pub async fn create(&self, input: CreateEventBody) -> ApiResult<CalendarEvent> {
        assert_valid_range(input.start_at, input.end_at)?;
        let row = NewCalendarEvent {
            id: new_id(),
            title: input.title,
            description: input.description.flatten(),
            start_at: input.start_at,
            end_at: input.end_at,
            all_day: input.all_day,
            location: input.location.flatten(),
            color: input.color,
            linked_task_ids: input.linked_task_ids,
            linked_thought_ids: input.linked_thought_ids,
            ..Default::default()
        };
        Ok(self.db.call(move |conn| insert_row(conn, row)).await?)
    }

    /// Checks the range against the stored dates; `404` for missing or deleted events.
    pub async fn update(&self, id: &str, input: UpdateEventBody) -> ApiResult<CalendarEvent> {
        let current = self.find(id).await?;
        assert_valid_range(input.start_at.unwrap_or(current.start_at), input.end_at.unwrap_or(current.end_at))?;
        let mut set = Assignments::new();
        set.maybe("title", input.title)
            .maybe("description", input.description)
            .maybe("start_at", input.start_at.map(time_value))
            .maybe("end_at", input.end_at.map(time_value))
            .maybe("all_day", input.all_day.map(to_bool))
            .maybe("location", input.location)
            .maybe("color", input.color)
            .maybe("linked_task_ids", input.linked_task_ids.as_deref().map(list_value))
            .maybe("linked_thought_ids", input.linked_thought_ids.as_deref().map(list_value))
            .set("updated_at", time_value(Utc::now()));
        let set = set.into_fragment();
        let mut params = set.params;
        params.push(Value::Text(id.to_owned()));
        let sql = format!("UPDATE calendar_events SET {} WHERE id = ? RETURNING *", set.sql);
        self.db.call(move |conn| query_first(conn, &sql, &params, CalendarEvent::from_row)).await?.ok_or_else(not_found)
    }

    /// Soft delete.
    pub async fn remove(&self, id: &str) -> ApiResult<()> {
        self.find(id).await?;
        let params = [time_value(Utc::now()), Value::Text(id.to_owned())];
        self.db
            .call(move |conn| {
                conn.execute(
                    "UPDATE calendar_events SET deleted_at = ? WHERE id = ?",
                    rusqlite::params_from_iter(params.iter()),
                )
            })
            .await?;
        Ok(())
    }

    async fn find(&self, id: &str) -> ApiResult<CalendarEvent> {
        let id = id.to_owned();
        self.db
            .call(move |conn| {
                query_first(
                    conn,
                    "SELECT * FROM calendar_events WHERE id = ? AND deleted_at IS NULL",
                    &[Value::Text(id)],
                    CalendarEvent::from_row,
                )
            })
            .await?
            .ok_or_else(not_found)
    }
}

fn not_found() -> ApiError {
    ApiError::not_found("Event not found.")
}

/// `assertValidRange`.
pub fn assert_valid_range(start_at: Timestamp, end_at: Timestamp) -> ApiResult<()> {
    if end_at < start_at {
        return Err(ApiError::bad_request("invalid_range", "endAt must be after startAt."));
    }
    Ok(())
}

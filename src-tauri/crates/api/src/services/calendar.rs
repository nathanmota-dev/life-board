use std::sync::Arc;

use chrono::TimeDelta;
use rusqlite::types::Value;
use tokio::sync::Notify;

use crate::clock;

use crate::db::Db;
use crate::db::columns::{Timestamp, new_id, to_bool};
use crate::db::schema::calendar::{CalendarEvent, NewCalendarEvent, SyncState, insert_row};
use crate::dto::calendar::{CreateEventBody, ListEventsQuery, UpdateEventBody};
use crate::error::{ApiError, ApiResult};
use crate::services::query::{Assignments, SqlFragment, and, list_value, query_all, query_first, time_value};

#[derive(Clone)]
pub struct CalendarService {
    db: Db,
    /// Rung after each change that has to reach Google.
    wake: Arc<Notify>,
}

impl CalendarService {
    pub fn new(db: Db) -> Self {
        Self::with_wake(db, Arc::default())
    }

    /// Rings `wake` after each change to send, so the Google worker doesn't wait for the next sync.
    pub fn with_wake(db: Db, wake: Arc<Notify>) -> Self {
        Self { db, wake }
    }

    async fn google_connected(&self) -> ApiResult<bool> {
        Ok(self
            .db
            .call(|conn| {
                conn.query_row(
                    "SELECT EXISTS(SELECT 1 FROM google_settings WHERE refresh_token_ciphertext IS NOT NULL)",
                    [],
                    |row| row.get(0),
                )
            })
            .await?)
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

    /// `400 invalid_range` when `endAt` is before `startAt`. While a Google account is
    /// connected the event waits to be sent (`pending_create`); the answer doesn't.
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
            sync_state: self.google_connected().await?.then_some(SyncState::PendingCreate),
            ..Default::default()
        };
        let created = self.db.call(move |conn| insert_row(conn, row)).await?;
        self.notify(created.sync_state);
        Ok(created)
    }

    fn notify(&self, state: Option<SyncState>) {
        if state.is_some() {
            self.wake.notify_one();
        }
    }

    /// Checks the range against the stored dates; `404` for missing or deleted events. A
    /// linked event, or one still waiting to be created in Google, is marked to be sent when a
    /// field Google keeps changed. The state is chosen inside the `UPDATE`, so a worker that
    /// links the event meanwhile is taken into account.
    pub async fn update(&self, id: &str, input: UpdateEventBody) -> ApiResult<CalendarEvent> {
        let current = self.find(id).await?;
        assert_valid_range(input.start_at.unwrap_or(current.start_at), input.end_at.unwrap_or(current.end_at))?;
        // Linked tasks and thoughts stay local, so changing only them sends nothing.
        let touches_google = input.title.is_some()
            || input.description.is_some()
            || input.start_at.is_some()
            || input.end_at.is_some()
            || input.all_day.is_some()
            || input.location.is_some()
            || input.color.is_some();
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
            // Strictly after the stored value, so the worker can tell this edit from the one it sent.
            .set("updated_at", time_value(clock::now().max(current.updated_at + TimeDelta::milliseconds(1))));
        let set = set.into_fragment();
        let mut params = set.params;
        params.push(Value::Text(id.to_owned()));
        let state = if touches_google { SYNC_ON_UPDATE } else { "" };
        let sql = format!("UPDATE calendar_events SET {}{state} WHERE id = ? RETURNING *", set.sql);
        let updated = self
            .db
            .call(move |conn| query_first(conn, &sql, &params, CalendarEvent::from_row))
            .await?
            .ok_or_else(not_found)?;
        self.notify(updated.sync_state);
        Ok(updated)
    }

    /// Soft delete. A linked event waits to be deleted in Google (`pending_delete`); one
    /// that was never sent just goes away.
    pub async fn remove(&self, id: &str) -> ApiResult<()> {
        let current = self.find(id).await?;
        let now = clock::now();
        let params = [
            time_value(now),
            time_value(now.max(current.updated_at + TimeDelta::milliseconds(1))),
            Value::Text(id.to_owned()),
        ];
        let state: Option<SyncState> = self
            .db
            .call(move |conn| {
                conn.query_row(
                    "UPDATE calendar_events SET deleted_at = ?, updated_at = ?, sync_state = CASE WHEN sync_state = 'pending_create' THEN NULL WHEN external_id IS NOT NULL THEN 'pending_delete' ELSE NULL END WHERE id = ? RETURNING sync_state",
                    rusqlite::params_from_iter(params.iter()),
                    |row| row.get(0),
                )
            })
            .await?;
        self.notify(state);
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

/// Marks a row to be sent after an edit: a row already waiting keeps its state (a
/// `pending_create` stays one); a linked row becomes `pending_update`.
const SYNC_ON_UPDATE: &str = ", sync_state = CASE WHEN sync_state IS NOT NULL THEN sync_state WHEN external_id IS NOT NULL THEN 'pending_update' ELSE NULL END";

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

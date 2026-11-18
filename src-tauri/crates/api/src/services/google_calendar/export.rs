//! Sends the changes made in Life Board to Google, one event at a time.
//!
//! The calendar writes rows with a `sync_state` and answers at once; this worker
//! then sends them. A result is only written to a row that didn't change while
//! the request ran, so a newer edit is never overwritten: it stays pending and
//! goes out in the next run.

use std::collections::HashMap;
use std::future::Future;
use std::sync::PoisonError;

use chrono::{Local, TimeDelta};
use rusqlite::{Connection, OptionalExtension, params};

use super::{GoogleCalendarService, SyncFailure, import};
use crate::db::columns::{Timestamp, to_millis};
use crate::db::schema::calendar::{CalendarEvent, SyncState, upsert_external};
use crate::error::ApiResult;
use crate::services::google::GoogleTokenError;
use crate::services::google_calendar_client::{
    CalendarResult, EventRef, GoogleCalendarError, GoogleEvent, GoogleEventBody, GoogleEventFields, from_google,
    to_google,
};

/// The waits after the first, second and every later failed attempt on one event.
const BACKOFF: [TimeDelta; 3] = [TimeDelta::minutes(1), TimeDelta::minutes(5), TimeDelta::minutes(15)];

/// When an event may be tried again. It only holds for the version of the row it failed with.
#[derive(Debug, Clone, Copy)]
pub(super) struct Backoff {
    attempts: usize,
    next_at: Timestamp,
    updated_at: Timestamp,
}

/// Why one event could not be sent.
enum PushError {
    Api(GoogleCalendarError),
    /// There is no usable access token: the whole run stops.
    Token(SyncFailure),
    Store(String),
}

impl From<GoogleTokenError> for PushError {
    fn from(error: GoogleTokenError) -> Self {
        Self::Token(SyncFailure::from_token(error))
    }
}

impl From<rusqlite::Error> for PushError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Store(error.to_string())
    }
}

impl From<crate::db::DbError> for PushError {
    fn from(error: crate::db::DbError) -> Self {
        Self::Store(error.to_string())
    }
}

/// The parts of a row that tell whether it changed while a request ran.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Version {
    updated_at: Timestamp,
    deleted_at: Option<Timestamp>,
    sync_state: Option<SyncState>,
}

impl Version {
    fn of(row: &CalendarEvent) -> Self {
        Self { updated_at: row.updated_at, deleted_at: row.deleted_at, sync_state: row.sync_state }
    }
}

impl GoogleCalendarService {
    /// The worker's entry point: sends every pending change now. It waits for a
    /// running sync, so sending and importing never overlap.
    pub async fn flush(&self) -> ApiResult<()> {
        let _flight = self.flight.lock().await;
        let calendar_id = self.google.calendar_id().await.map_err(SyncFailure::from_token)?;
        if let Some(message) = self.export(&calendar_id).await? {
            self.record_error(&message).await;
        }
        Ok(())
    }

    /// A sync asked for by the user: the changes that failed before are tried again
    /// without waiting for their backoff.
    pub async fn sync_now(&self) -> ApiResult<super::SyncResult> {
        self.backoff().clear();
        self.sync().await
    }

    /// Sends the pending changes, oldest first. Returns the last error that
    /// made Google refuse a change for good, for `last_sync_error`.
    pub(super) async fn export(&self, calendar_id: &str) -> Result<Option<String>, SyncFailure> {
        let rows = self
            .db
            .call(|conn| {
                let mut statement =
                    conn.prepare("SELECT * FROM calendar_events WHERE sync_state IS NOT NULL ORDER BY updated_at, id")?;
                statement.query_map([], CalendarEvent::from_row)?.collect::<rusqlite::Result<Vec<_>>>()
            })
            .await?;
        let mut rejected = None;
        for row in rows {
            if self.backed_off(&row) {
                continue;
            }
            match self.push(calendar_id, &row).await {
                Ok(()) => self.forget_backoff(&row.id),
                Err(PushError::Token(failure)) => return Err(failure),
                Err(PushError::Store(message)) => return Err(SyncFailure::Internal(message)),
                Err(PushError::Api(GoogleCalendarError::Unauthorized)) => {
                    return Err(SyncFailure::Google(GoogleCalendarError::Unauthorized.to_string()));
                }
                Err(PushError::Api(error)) => match error {
                    GoogleCalendarError::Http { status, ref message } if (400..500).contains(&status) => {
                        let message = format!("Google refused \"{}\": {message}", row.title);
                        self.settle(&row).await?;
                        self.forget_backoff(&row.id);
                        rejected = Some(message);
                    }
                    GoogleCalendarError::Network(_) | GoogleCalendarError::RateLimited => {
                        self.back_off(&row);
                        break;
                    }
                    _ => self.back_off(&row),
                },
            }
        }
        Ok(rejected)
    }

    async fn push(&self, calendar_id: &str, row: &CalendarEvent) -> Result<(), PushError> {
        let version = Version::of(row);
        let body = body_of(row);
        let api = self.api.clone();
        let Some(state) = row.sync_state else { return Ok(()) };
        if state == SyncState::PendingCreate {
            let event = self
                .authorized(|token| {
                    let api = api.clone();
                    let body = &body;
                    async move { api.insert_event(&token, calendar_id, body).await }
                })
                .await?;
            return self.store(row.id.clone(), version, Outcome::Created { calendar_id, event }).await;
        }
        let (Some(external_calendar), Some(external_id)) = (&row.external_calendar_id, &row.external_id) else {
            // A change to an event that was never linked has nowhere to go.
            return self.store(row.id.clone(), version, Outcome::Unlinked).await;
        };
        let event = EventRef { calendar_id: external_calendar, event_id: external_id };
        if state == SyncState::PendingDelete {
            return match self
                .authorized(|token| {
                    let api = api.clone();
                    async move { api.delete_event(&token, event).await }
                })
                .await
            {
                Ok(()) | Err(PushError::Api(GoogleCalendarError::Gone)) => {
                    self.store(row.id.clone(), version, Outcome::Deleted).await
                }
                Err(error) => Err(error),
            };
        }
        let etag = row.external_etag.as_deref().unwrap_or("*");
        match self
            .authorized(|token| {
                let api = api.clone();
                let body = &body;
                async move { api.patch_event(&token, event, etag, body).await }
            })
            .await
        {
            Ok(sent) => self.store(row.id.clone(), version, Outcome::Patched(sent)).await,
            Err(PushError::Api(GoogleCalendarError::Gone)) => {
                self.store(row.id.clone(), version, Outcome::Deleted).await
            }
            Err(PushError::Api(GoogleCalendarError::Conflict)) => {
                self.keep_google_version(calendar_id, row, event).await
            }
            Err(error) => Err(error),
        }
    }

    /// `412`: Google wins. The stored event is replaced by Google's, and a notice is recorded.
    async fn keep_google_version(
        &self,
        calendar_id: &str,
        row: &CalendarEvent,
        event: EventRef<'_>,
    ) -> Result<(), PushError> {
        let api = self.api.clone();
        match self
            .authorized(|token| {
                let api = api.clone();
                async move { api.get_event(&token, event).await }
            })
            .await
        {
            Ok(google) if google.status.as_deref() != Some("cancelled") => {
                let replaced = self
                    .store(row.id.clone(), Version::of(row), Outcome::Replaced { calendar_id, event: google })
                    .await;
                replaced?;
                self.google.record_conflict(&row.title, (self.now)());
                Ok(())
            }
            Ok(_) | Err(PushError::Api(GoogleCalendarError::Gone)) => {
                self.store(row.id.clone(), Version::of(row), Outcome::Deleted).await
            }
            Err(error) => Err(error),
        }
    }

    /// Runs `call` with an access token; after a `401` it refreshes the token once and retries.
    async fn authorized<T, F, Fut>(&self, call: F) -> Result<T, PushError>
    where
        F: Fn(String) -> Fut,
        Fut: Future<Output = CalendarResult<T>>,
    {
        let token = self.google.access_token().await?;
        match call(token.clone()).await {
            Err(GoogleCalendarError::Unauthorized) => {
                self.google.expire_access_token(&token).await;
                let token = self.google.access_token().await?;
                call(token).await.map_err(PushError::Api)
            }
            other => other.map_err(PushError::Api),
        }
    }

    /// Writes what Google answered to the row, unless the row changed meanwhile.
    async fn store(&self, id: String, version: Version, outcome: Outcome<'_>) -> Result<(), PushError> {
        let now = (self.now)();
        let outcome = outcome.into_owned();
        self.db.call(move |conn| apply(conn, &id, version, outcome, now)).await?;
        Ok(())
    }

    /// Gives up on a change for good: the state is cleared and the row stays as it is.
    async fn settle(&self, row: &CalendarEvent) -> Result<(), SyncFailure> {
        let (id, version) = (row.id.clone(), Version::of(row));
        self.db
            .call(move |conn| {
                conn.execute(
                    "UPDATE calendar_events SET sync_state = NULL WHERE id = ?1 AND updated_at = ?2",
                    params![id, to_millis(version.updated_at)],
                )
            })
            .await?;
        Ok(())
    }

    fn backoff(&self) -> std::sync::MutexGuard<'_, HashMap<String, Backoff>> {
        self.backoff.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn backed_off(&self, row: &CalendarEvent) -> bool {
        let now = (self.now)();
        self.backoff().get(&row.id).is_some_and(|entry| entry.updated_at == row.updated_at && entry.next_at > now)
    }

    fn back_off(&self, row: &CalendarEvent) {
        let now = (self.now)();
        let mut entries = self.backoff();
        let attempts =
            entries.get(&row.id).filter(|entry| entry.updated_at == row.updated_at).map_or(0, |e| e.attempts) + 1;
        let wait = BACKOFF[(attempts - 1).min(BACKOFF.len() - 1)];
        entries.insert(row.id.clone(), Backoff { attempts, next_at: now + wait, updated_at: row.updated_at });
    }

    fn forget_backoff(&self, id: &str) {
        self.backoff().remove(id);
    }
}

/// What Google answered, as the row must record it.
enum Outcome<'a> {
    Created {
        calendar_id: &'a str,
        event: GoogleEvent,
    },
    Patched(GoogleEvent),
    /// Deleted in Google, or already gone.
    Deleted,
    /// Google's copy replaces the stored one.
    Replaced {
        calendar_id: &'a str,
        event: GoogleEvent,
    },
    /// The change had no Google event to go to.
    Unlinked,
}

enum Owned {
    Created { calendar_id: String, event: GoogleEvent },
    Patched(GoogleEvent),
    Deleted,
    Replaced { calendar_id: String, event: GoogleEvent },
    Unlinked,
}

impl Outcome<'_> {
    fn into_owned(self) -> Owned {
        match self {
            Self::Created { calendar_id, event } => Owned::Created { calendar_id: calendar_id.to_owned(), event },
            Self::Patched(event) => Owned::Patched(event),
            Self::Deleted => Owned::Deleted,
            Self::Replaced { calendar_id, event } => Owned::Replaced { calendar_id: calendar_id.to_owned(), event },
            Self::Unlinked => Owned::Unlinked,
        }
    }
}

fn body_of(row: &CalendarEvent) -> GoogleEventBody {
    to_google(
        &GoogleEventFields {
            title: Some(row.title.clone()),
            description: row.description.clone(),
            location: row.location.clone(),
            start_at: Some(row.start_at),
            end_at: Some(row.end_at),
            all_day: row.all_day,
            color: row.color.clone(),
            ..Default::default()
        },
        &Local,
    )
}

fn current(conn: &Connection, id: &str) -> rusqlite::Result<Option<CalendarEvent>> {
    conn.query_row("SELECT * FROM calendar_events WHERE id = ?", [id], CalendarEvent::from_row).optional()
}

/// The one place a result reaches a row.
fn apply(conn: &mut Connection, id: &str, sent: Version, outcome: Owned, now: Timestamp) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    if let Some(row) = current(&tx, id)? {
        let unchanged = Version::of(&row) == sent;
        match outcome {
            Owned::Created { calendar_id, event } => {
                // The event exists in Google now, so the link is kept even when the row changed:
                // sending it again would duplicate it.
                let fields = from_google(&event, &Local);
                let state = match (unchanged, row.deleted_at) {
                    (true, _) => None,
                    (false, Some(_)) => Some(SyncState::PendingDelete),
                    (false, None) => Some(SyncState::PendingUpdate),
                };
                tx.execute(
                    "UPDATE calendar_events SET external_id = ?1, external_calendar_id = ?2, external_etag = ?3, external_updated_at = ?4, external_url = ?5, sync_state = ?6 WHERE id = ?7",
                    params![fields.id, calendar_id, fields.etag, fields.updated.map(to_millis), fields.html_link, state, id],
                )?;
            }
            Owned::Patched(event) => {
                let fields = from_google(&event, &Local);
                let state = if unchanged { None } else { row.sync_state };
                tx.execute(
                    "UPDATE calendar_events SET external_etag = ?1, external_updated_at = ?2, external_url = COALESCE(?3, external_url), sync_state = ?4 WHERE id = ?5",
                    params![fields.etag, fields.updated.map(to_millis), fields.html_link, state, id],
                )?;
            }
            Owned::Deleted => {
                tx.execute(
                    "UPDATE calendar_events SET deleted_at = COALESCE(deleted_at, ?1), sync_state = NULL, external_id = NULL, external_calendar_id = NULL, external_etag = NULL, external_updated_at = NULL, external_url = NULL, recurring_event_id = NULL WHERE id = ?2",
                    params![to_millis(now), id],
                )?;
            }
            Owned::Replaced { calendar_id, event } => {
                // An event deleted here meanwhile stays deleted; the delete goes out next.
                if row.deleted_at.is_none()
                    && let Some(replacement) = import::new_row(&calendar_id, &from_google(&event, &Local), now)
                {
                    upsert_external(&tx, replacement)?;
                }
            }
            Owned::Unlinked => {
                tx.execute("UPDATE calendar_events SET sync_state = NULL WHERE id = ?1", [id])?;
            }
        }
    }
    tx.commit()
}

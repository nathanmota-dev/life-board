//! Imports the events of the account's primary Google calendar into
//! `calendar_events`, and keeps them up to date.
//!
//! Each sync reads the whole window (see [`sync_window`]) and writes it in one
//! transaction, so a failure halfway keeps the previous events. One sync runs at
//! a time: a second caller waits for the running one and returns its result.

mod import;
mod scheduler;
mod types;
pub use scheduler::*;
pub use types::*;

use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use tokio::sync::Mutex;

use crate::clock;
use crate::db::Db;
use crate::error::{ApiError, ApiResult};
use crate::services::date::{add_days, from_day_key, to_day_key};
use crate::services::google::{GoogleService, GoogleTokenError, Now, SETTINGS_ID, unavailable};
use crate::services::google_calendar_client::{
    CalendarResult, EventWindow, GoogleCalendarApi, GoogleCalendarError, GoogleEvent,
};

/// How far back the import reaches, from the start of the local day.
pub const PAST_DAYS: i64 = 30;
/// How far ahead the import reaches.
pub const FUTURE_DAYS: i64 = 365;

/// The span a sync reads: from the start of the local day 30 days ago to 365 days from `now`.
pub fn sync_window(now: crate::db::columns::Timestamp) -> EventWindow {
    let today = from_day_key(&to_day_key(now)).unwrap_or(now);
    EventWindow { time_min: add_days(today, -PAST_DAYS), time_max: add_days(now, FUTURE_DAYS) }
}

/// What the running sync left behind, for the callers that waited for it.
#[derive(Default)]
struct Flight {
    last: Option<Result<SyncResult, SyncFailure>>,
}

#[derive(Clone)]
pub struct GoogleCalendarService {
    db: Db,
    google: GoogleService,
    api: Arc<dyn GoogleCalendarApi>,
    now: Now,
    /// Held while a sync runs.
    flight: Arc<Mutex<Flight>>,
    /// Syncs finished so far: a caller that saw a newer count after waiting took part in a finished one.
    finished: Arc<AtomicU64>,
}

impl GoogleCalendarService {
    pub fn new(db: Db, google: GoogleService, api: Arc<dyn GoogleCalendarApi>) -> Self {
        Self::with_clock(db, google, api, Arc::new(clock::now))
    }

    pub fn with_clock(db: Db, google: GoogleService, api: Arc<dyn GoogleCalendarApi>, now: Now) -> Self {
        Self { db, google, api, now, flight: Arc::default(), finished: Arc::default() }
    }

    /// Whether an account is connected, so the scheduler has something to do.
    pub async fn is_connected(&self) -> bool {
        self.google.calendar_id().await.is_ok()
    }

    /// Reads the window from Google and brings the stored events up to date.
    /// `409 not_connected` without an account, `400 reauth_required` once Google
    /// refused it, `502 google_unavailable` when Google failed (the error is also
    /// kept in `last_sync_error`).
    pub async fn sync(&self) -> ApiResult<SyncResult> {
        let seen = self.finished.load(Ordering::SeqCst);
        let mut flight = self.flight.lock().await;
        if self.finished.load(Ordering::SeqCst) != seen
            && let Some(last) = &flight.last
        {
            return last.clone().map_err(ApiError::from);
        }
        let outcome = self.run().await;
        if let Err(SyncFailure::Google(message)) = &outcome {
            self.record_error(message).await;
        }
        flight.last = Some(outcome.clone());
        self.finished.fetch_add(1, Ordering::SeqCst);
        outcome.map_err(ApiError::from)
    }

    async fn run(&self) -> Result<SyncResult, SyncFailure> {
        let calendar_id = self.google.calendar_id().await.map_err(SyncFailure::from_token)?;
        let now = (self.now)();
        let window = sync_window(now);
        let events = self.list(&calendar_id, window).await?;
        let result = self
            .db
            .call(move |conn| {
                let tx = conn.transaction()?;
                let result = import::apply(&tx, &calendar_id, window, now, &events)?;
                tx.execute(
                    "UPDATE google_settings SET last_sync_at = ?1, last_sync_error = NULL, updated_at = ?1 WHERE id = ?2",
                    rusqlite::params![crate::db::columns::to_millis(now), SETTINGS_ID],
                )?;
                tx.commit()?;
                Ok(result)
            })
            .await
            .map_err(|error| SyncFailure::Internal(error.to_string()))?;
        Ok(result)
    }

    /// Lists the window; after a `401` it refreshes the token once and retries.
    async fn list(&self, calendar_id: &str, window: EventWindow) -> Result<Vec<GoogleEvent>, SyncFailure> {
        let token = self.google.access_token().await.map_err(SyncFailure::from_token)?;
        let first = self.api.list_events(&token, calendar_id, window).await;
        let events: CalendarResult<_> = match first {
            Err(GoogleCalendarError::Unauthorized) => {
                self.google.expire_access_token(&token).await;
                let token = self.google.access_token().await.map_err(SyncFailure::from_token)?;
                self.api.list_events(&token, calendar_id, window).await
            }
            other => other,
        };
        events.map_err(|error| SyncFailure::Google(error.to_string()))
    }

    async fn record_error(&self, message: &str) {
        let (now, message) = (crate::db::columns::to_millis((self.now)()), message.to_owned());
        let recorded = self
            .db
            .call(move |conn| {
                conn.execute(
                    "UPDATE google_settings SET last_sync_error = ?1, updated_at = ?2 WHERE id = ?3",
                    rusqlite::params![message, now, SETTINGS_ID],
                )
            })
            .await;
        if let Err(error) = recorded {
            tracing::warn!("recording the Google sync error failed: {error}");
        }
    }
}

impl From<SyncFailure> for ApiError {
    fn from(failure: SyncFailure) -> Self {
        match failure {
            SyncFailure::NotConnected => ApiError::http(
                axum::http::StatusCode::CONFLICT,
                "not_connected",
                GoogleTokenError::NotConnected.to_string(),
            ),
            SyncFailure::ReauthRequired => GoogleTokenError::ReauthRequired.into(),
            SyncFailure::Google(message) => unavailable(message),
            SyncFailure::Internal(message) => ApiError::internal(message),
        }
    }
}

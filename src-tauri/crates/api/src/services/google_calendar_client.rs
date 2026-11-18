//! Thin wrapper over the Google Calendar API v3; all HTTP lives here so it can be
//! replaced (a fake [`GoogleCalendarApi`]) or pointed at `wiremock` (a base URL).
//!
//! Every call takes the access token, which only travels in the `Authorization`
//! header. The client never refreshes the token or retries: the sync decides.

mod mapping;
mod types;
pub use mapping::*;
pub use types::*;

use async_trait::async_trait;
use reqwest::header::IF_MATCH;
use reqwest::{Method, StatusCode, Url};
use serde::Deserialize;
use serde::de::DeserializeOwned;

use crate::db::columns::to_iso;
use crate::services::github_client::encode_uri_component;
use crate::services::google_auth_client::GOOGLE_APIS_URL;

/// The Calendar API under [`GOOGLE_APIS_URL`].
pub const CALENDAR_PATH: &str = "/calendar/v3";
/// Events asked for per page, Google's own maximum being 2500.
pub const PAGE_SIZE: usize = 250;
/// Pages a listing follows before giving up, so a server that keeps sending a
/// `nextPageToken` can't loop forever.
pub const MAX_PAGES: usize = 200;
/// How much of Google's error message goes into [`GoogleCalendarError::Http`].
const MAX_MESSAGE: usize = 200;

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum GoogleCalendarError {
    /// `401`: the access token is no longer valid.
    #[error("Google refused the access token.")]
    Unauthorized,
    /// `412`: the event changed in Google since its `etag` was read.
    #[error("The event changed in Google.")]
    Conflict,
    /// `404` or `410` on a patch or delete: the event no longer exists.
    #[error("The event no longer exists in Google.")]
    Gone,
    /// `429`, or `403` with `rateLimitExceeded` or `userRateLimitExceeded`.
    #[error("Google Calendar is limiting requests.")]
    RateLimited,
    #[error("{message}")]
    Http { status: u16, message: String },
    #[error("Google Calendar could not be reached: {0}")]
    Network(String),
}

pub type CalendarResult<T> = Result<T, GoogleCalendarError>;

/// The calls the sync makes, so tests can plug in a fake.
#[async_trait]
pub trait GoogleCalendarApi: Send + Sync + 'static {
    async fn get_primary_calendar(&self, token: &str) -> CalendarResult<PrimaryCalendar>;
    /// Every event (and occurrence of a recurring one, deleted ones included)
    /// in `window`, across all pages.
    async fn list_events(&self, token: &str, calendar: &str, window: EventWindow) -> CalendarResult<Vec<GoogleEvent>>;
    /// One event as Google has it now. [`GoogleCalendarError::Gone`] when it no longer exists.
    async fn get_event(&self, token: &str, event: EventRef<'_>) -> CalendarResult<GoogleEvent>;
    async fn insert_event(&self, token: &str, calendar: &str, body: &GoogleEventBody) -> CalendarResult<GoogleEvent>;
    /// Fails with [`GoogleCalendarError::Conflict`] when the event's etag is no longer `etag`.
    async fn patch_event(
        &self,
        token: &str,
        event: EventRef<'_>,
        etag: &str,
        body: &GoogleEventBody,
    ) -> CalendarResult<GoogleEvent>;
    async fn delete_event(&self, token: &str, event: EventRef<'_>) -> CalendarResult<()>;
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct EventsPage {
    #[serde(default)]
    items: Vec<GoogleEvent>,
    next_page_token: Option<String>,
}

#[derive(Deserialize)]
struct ErrorBody {
    error: ErrorDetail,
}

#[derive(Deserialize)]
struct ErrorDetail {
    message: Option<String>,
    #[serde(default)]
    errors: Vec<ErrorReason>,
}

#[derive(Deserialize)]
struct ErrorReason {
    reason: Option<String>,
}

/// One request: its method, path under the base URL, query and body.
struct Call<'a> {
    method: Method,
    path: String,
    query: Vec<(&'static str, String)>,
    if_match: Option<&'a str>,
    body: Option<&'a GoogleEventBody>,
    /// A `404` or `410` means the event is gone (patch and delete).
    on_event: bool,
}

impl Call<'_> {
    fn new(method: Method, path: String) -> Self {
        Self { method, path, query: Vec::new(), if_match: None, body: None, on_event: false }
    }
}

fn events_path(calendar_id: &str) -> String {
    format!("/calendars/{}/events", encode_uri_component(calendar_id))
}

fn event_path(event: EventRef<'_>) -> String {
    format!("{}/{}", events_path(event.calendar_id), encode_uri_component(event.event_id))
}

fn network(error: reqwest::Error) -> GoogleCalendarError {
    GoogleCalendarError::Network(error.without_url().to_string())
}

fn invalid_response(status: StatusCode) -> GoogleCalendarError {
    GoogleCalendarError::Http { status: status.as_u16(), message: "Google Calendar sent an invalid response.".into() }
}

/// `text` cut to `max` characters.
fn shorten(text: &str, max: usize) -> String {
    text.chars().take(max).collect()
}

/// A failed response as a [`GoogleCalendarError`]. The body only lends its
/// `error.message` and reasons, never its raw text.
fn http_error(status: StatusCode, body: &[u8], on_event: bool) -> GoogleCalendarError {
    let detail = serde_json::from_slice::<ErrorBody>(body).ok().map(|body| body.error);
    let reasons = detail.as_ref().map(|detail| detail.errors.iter().filter_map(|error| error.reason.as_deref()));
    let rate_limited =
        reasons.into_iter().flatten().any(|reason| reason == "rateLimitExceeded" || reason == "userRateLimitExceeded");
    match status {
        StatusCode::UNAUTHORIZED => GoogleCalendarError::Unauthorized,
        StatusCode::PRECONDITION_FAILED => GoogleCalendarError::Conflict,
        StatusCode::TOO_MANY_REQUESTS => GoogleCalendarError::RateLimited,
        StatusCode::FORBIDDEN if rate_limited => GoogleCalendarError::RateLimited,
        StatusCode::NOT_FOUND | StatusCode::GONE if on_event => GoogleCalendarError::Gone,
        status => {
            let message = match detail.and_then(|detail| detail.message).filter(|message| !message.is_empty()) {
                Some(message) => {
                    format!("Google Calendar answered {}: {}", status.as_u16(), shorten(&message, MAX_MESSAGE))
                }
                None => format!("Google Calendar answered {}.", status.as_u16()),
            };
            GoogleCalendarError::Http { status: status.as_u16(), message }
        }
    }
}

/// The real client (`reqwest` with rustls).
#[derive(Debug, Clone)]
pub struct GoogleCalendarClient {
    http: reqwest::Client,
    base_url: String,
}

impl GoogleCalendarClient {
    /// Talks to `https://www.googleapis.com/calendar/v3`. Under the `e2e` feature,
    /// `LIFE_BOARD_E2E_GOOGLE_URL` replaces the host, as for the OAuth client.
    pub fn new() -> Self {
        #[cfg(feature = "e2e")]
        if let Ok(base_url) = std::env::var("LIFE_BOARD_E2E_GOOGLE_URL") {
            return Self::with_base_url(format!("{}{CALENDAR_PATH}", base_url.trim_end_matches('/')));
        }
        Self::with_base_url(format!("{GOOGLE_APIS_URL}{CALENDAR_PATH}"))
    }

    /// Talks to another server, such as a `wiremock` instance: `base_url` stands
    /// for `https://www.googleapis.com/calendar/v3`.
    pub fn with_base_url(base_url: impl Into<String>) -> Self {
        let base_url = base_url.into().trim_end_matches('/').to_owned();
        Self { http: reqwest::Client::new(), base_url }
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// Sends `call` and returns the body of a successful answer.
    async fn send(&self, token: &str, call: Call<'_>) -> CalendarResult<(StatusCode, bytes::Bytes)> {
        let mut url = Url::parse(&format!("{}{}", self.base_url, call.path)).map_err(|error| {
            GoogleCalendarError::Http { status: 0, message: format!("Invalid Google Calendar URL: {error}") }
        })?;
        if !call.query.is_empty() {
            url.query_pairs_mut().extend_pairs(call.query.iter().map(|(key, value)| (*key, value.as_str())));
        }
        let mut builder = self.http.request(call.method, url).bearer_auth(token);
        if let Some(etag) = call.if_match {
            builder = builder.header(IF_MATCH, etag);
        }
        if let Some(body) = call.body {
            builder = builder.json(body);
        }
        let response = builder.send().await.map_err(network)?;
        let status = response.status();
        let body = response.bytes().await.map_err(network)?;
        if !status.is_success() {
            return Err(http_error(status, &body, call.on_event));
        }
        Ok((status, body))
    }

    async fn json<T: DeserializeOwned>(&self, token: &str, call: Call<'_>) -> CalendarResult<T> {
        let (status, body) = self.send(token, call).await?;
        serde_json::from_slice(&body).map_err(|_| invalid_response(status))
    }
}

impl Default for GoogleCalendarClient {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl GoogleCalendarApi for GoogleCalendarClient {
    async fn get_primary_calendar(&self, token: &str) -> CalendarResult<PrimaryCalendar> {
        let calendar: PrimaryCalendar = self.json(token, Call::new(Method::GET, "/calendars/primary".into())).await?;
        if calendar.id.is_empty() {
            return Err(GoogleCalendarError::Http {
                status: 200,
                message: "Google Calendar returned no primary calendar.".into(),
            });
        }
        Ok(calendar)
    }

    async fn list_events(&self, token: &str, calendar: &str, window: EventWindow) -> CalendarResult<Vec<GoogleEvent>> {
        let mut events = Vec::new();
        let mut page_token: Option<String> = None;
        for _ in 0..MAX_PAGES {
            let mut call = Call::new(Method::GET, events_path(calendar));
            call.query = vec![
                ("singleEvents", "true".into()),
                ("showDeleted", "true".into()),
                ("timeMin", to_iso(window.time_min)),
                ("timeMax", to_iso(window.time_max)),
                ("maxResults", PAGE_SIZE.to_string()),
            ];
            call.query.extend(page_token.take().map(|token| ("pageToken", token)));
            let page: EventsPage = self.json(token, call).await?;
            events.extend(page.items);
            match page.next_page_token.filter(|token| !token.is_empty()) {
                Some(next) => page_token = Some(next),
                None => return Ok(events),
            }
        }
        Err(GoogleCalendarError::Http { status: 200, message: "Google Calendar sent too many pages.".into() })
    }

    async fn get_event(&self, token: &str, event: EventRef<'_>) -> CalendarResult<GoogleEvent> {
        let mut call = Call::new(Method::GET, event_path(event));
        call.on_event = true;
        self.json(token, call).await
    }

    async fn insert_event(&self, token: &str, calendar: &str, body: &GoogleEventBody) -> CalendarResult<GoogleEvent> {
        let mut call = Call::new(Method::POST, events_path(calendar));
        call.body = Some(body);
        self.json(token, call).await
    }

    async fn patch_event(
        &self,
        token: &str,
        event: EventRef<'_>,
        etag: &str,
        body: &GoogleEventBody,
    ) -> CalendarResult<GoogleEvent> {
        let mut call = Call::new(Method::PATCH, event_path(event));
        call.if_match = Some(etag);
        call.body = Some(body);
        call.on_event = true;
        self.json(token, call).await
    }

    async fn delete_event(&self, token: &str, event: EventRef<'_>) -> CalendarResult<()> {
        let mut call = Call::new(Method::DELETE, event_path(event));
        call.on_event = true;
        self.send(token, call).await.map(|_| ())
    }
}

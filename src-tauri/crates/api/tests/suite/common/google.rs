//! A fake [`GoogleAuthApi`] and a clock the Google tests move by hand.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use async_trait::async_trait;
use chrono::TimeDelta;
use life_board_api::db::columns::Timestamp;
use life_board_api::services::google::{GoogleService, Now};
use life_board_api::services::google_auth_client::{
    CodeGrant, GoogleAuthApi, GoogleAuthResult, GoogleCredentials, GoogleTokens,
};
use life_board_api::services::google_calendar::GoogleCalendarService;
use life_board_api::services::google_calendar_client::{
    CalendarResult, EventRef, EventWindow, GoogleCalendarApi, GoogleCalendarError, GoogleEvent, GoogleEventBody,
    PrimaryCalendar,
};

use super::{crypto, ms};

pub const CLIENT_ID: &str = "1234-synthetic.apps.googleusercontent.com";
pub const CLIENT_SECRET: &str = "GOCSPX-synthetic-client-secret";
pub const REFRESH_TOKEN: &str = "1//synthetic-refresh-token";
pub const EMAIL: &str = "someone@gmail.com";
pub const SERVER_URL: &str = "http://127.0.0.1:4567";
pub const REDIRECT_URI: &str = "http://127.0.0.1:4567/api/google/oauth/callback";

type Answer<T> = Box<dyn Fn(usize) -> GoogleAuthResult<T> + Send + Sync>;
type PrimaryAnswer = Box<dyn Fn(&str) -> GoogleAuthResult<String> + Send + Sync>;

/// Records every call; each method answers with its closure, given how many times
/// that method ran before. Refreshes hand out `access-1`, `access-2`, …
pub struct FakeGoogle {
    calls: Mutex<Vec<String>>,
    exchange: Mutex<Answer<GoogleTokens>>,
    refresh: Mutex<Answer<GoogleTokens>>,
    revoke: Mutex<Answer<()>>,
    primary: Mutex<PrimaryAnswer>,
}

pub fn tokens(access_token: &str, refresh_token: Option<&str>) -> GoogleTokens {
    GoogleTokens {
        access_token: access_token.into(),
        refresh_token: refresh_token.map(str::to_owned),
        expires_in: Some(Duration::from_secs(3600)),
    }
}

impl Default for FakeGoogle {
    fn default() -> Self {
        Self {
            calls: Mutex::new(Vec::new()),
            exchange: Mutex::new(Box::new(|_| Ok(tokens("access-0", Some(REFRESH_TOKEN))))),
            refresh: Mutex::new(Box::new(|count| Ok(tokens(&format!("access-{}", count + 1), None)))),
            revoke: Mutex::new(Box::new(|_| Ok(()))),
            primary: Mutex::new(Box::new(|_| Ok(EMAIL.into()))),
        }
    }
}

impl FakeGoogle {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    pub fn calls(&self) -> Vec<String> {
        self.calls.lock().unwrap().clone()
    }

    /// How many recorded calls start with `prefix`.
    pub fn count(&self, prefix: &str) -> usize {
        self.calls().iter().filter(|call| call.starts_with(prefix)).count()
    }

    fn record(&self, call: String) -> usize {
        let mut calls = self.calls.lock().unwrap();
        let name = call.split('(').next().unwrap_or_default().to_owned();
        let count = calls.iter().filter(|recorded| recorded.starts_with(&format!("{name}("))).count();
        calls.push(call);
        count
    }

    pub fn on_exchange(&self, answer: impl Fn(usize) -> GoogleAuthResult<GoogleTokens> + Send + Sync + 'static) {
        *self.exchange.lock().unwrap() = Box::new(answer);
    }

    pub fn on_refresh(&self, answer: impl Fn(usize) -> GoogleAuthResult<GoogleTokens> + Send + Sync + 'static) {
        *self.refresh.lock().unwrap() = Box::new(answer);
    }

    pub fn on_revoke(&self, answer: impl Fn(usize) -> GoogleAuthResult<()> + Send + Sync + 'static) {
        *self.revoke.lock().unwrap() = Box::new(answer);
    }

    pub fn on_primary(&self, answer: impl Fn(&str) -> GoogleAuthResult<String> + Send + Sync + 'static) {
        *self.primary.lock().unwrap() = Box::new(answer);
    }
}

fn client(credentials: &GoogleCredentials) -> String {
    format!("{}:{}", credentials.client_id, credentials.client_secret)
}

#[async_trait]
impl GoogleAuthApi for FakeGoogle {
    async fn exchange_code(
        &self,
        credentials: &GoogleCredentials,
        grant: CodeGrant<'_>,
    ) -> GoogleAuthResult<GoogleTokens> {
        let CodeGrant { code, code_verifier, redirect_uri } = grant;
        let count =
            self.record(format!("exchange_code({}, {code}, {code_verifier}, {redirect_uri})", client(credentials)));
        (self.exchange.lock().unwrap())(count)
    }

    async fn refresh(&self, credentials: &GoogleCredentials, refresh_token: &str) -> GoogleAuthResult<GoogleTokens> {
        let count = self.record(format!("refresh({}, {refresh_token})", client(credentials)));
        (self.refresh.lock().unwrap())(count)
    }

    async fn revoke(&self, credentials: &GoogleCredentials, token: &str) -> GoogleAuthResult<()> {
        let count = self.record(format!("revoke({}, {token})", client(credentials)));
        (self.revoke.lock().unwrap())(count)
    }

    async fn primary_calendar_id(&self, access_token: &str) -> GoogleAuthResult<String> {
        self.record(format!("primary_calendar_id({access_token})"));
        (self.primary.lock().unwrap())(access_token)
    }
}

/// A clock that only moves when told to.
#[derive(Clone)]
pub struct TestClock(Arc<Mutex<Timestamp>>);

impl TestClock {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(ms(1_795_000_000_000))))
    }

    pub fn advance(&self, by: TimeDelta) {
        *self.0.lock().unwrap() += by;
    }

    pub fn now(&self) -> Now {
        let time = self.0.clone();
        Arc::new(move || *time.lock().unwrap())
    }
}

/// A service on `db` with the fake, the test clock and the test key.
pub fn google_service(db: &life_board_api::db::Db, fake: &Arc<FakeGoogle>, clock: &TestClock) -> GoogleService {
    GoogleService::with_clock(db.clone(), fake.clone(), crypto(3), clock.now())
}

/// The `state` query parameter of an authorization URL.
pub fn state_of(auth_url: &str) -> String {
    query_param(auth_url, "state").expect("state")
}

pub fn query_param(url: &str, name: &str) -> Option<String> {
    let url = reqwest::Url::parse(url).expect("URL");
    url.query_pairs().find(|(key, _)| key == name).map(|(_, value)| value.into_owned())
}

type ListAnswer = Box<dyn Fn(usize) -> CalendarResult<Vec<GoogleEvent>> + Send + Sync>;
type EventAnswer = Box<dyn Fn(usize) -> CalendarResult<GoogleEvent> + Send + Sync>;
type DeleteAnswer = Box<dyn Fn(usize) -> CalendarResult<()> + Send + Sync>;

/// What the sync sent, in order.
#[derive(Debug, Clone, PartialEq)]
pub enum Sent {
    Insert { token: String, calendar: String, body: GoogleEventBody },
    Patch { token: String, calendar: String, event: String, etag: String, body: GoogleEventBody },
    Delete { token: String, calendar: String, event: String },
    Get { calendar: String, event: String },
}

/// A fake [`GoogleCalendarApi`] for the sync: `list_events` answers with its closure (given how
/// many listings ran before) after an optional delay, and records the token and window of each call.
/// The writes answer with their own closures (given how many of that kind ran before) and are recorded
/// in [`FakeCalendar::sent`]. [`FakeCalendar::hold`] makes the next writes wait until released.
pub struct FakeCalendar {
    listed: Mutex<Vec<(String, String, EventWindow)>>,
    list: Mutex<ListAnswer>,
    delay: Mutex<Duration>,
    sent: Mutex<Vec<Sent>>,
    insert: Mutex<EventAnswer>,
    patch: Mutex<EventAnswer>,
    get: Mutex<EventAnswer>,
    delete: Mutex<DeleteAnswer>,
    held: Mutex<bool>,
    gate: tokio::sync::Semaphore,
    entered: tokio::sync::Notify,
}

fn answered(prefix: &str, etag: &str) -> EventAnswer {
    let (prefix, etag) = (prefix.to_owned(), etag.to_owned());
    Box::new(move |count| {
        Ok(GoogleEvent {
            id: format!("{prefix}{count}"),
            etag: Some(format!("\"{etag}{count}\"")),
            html_link: Some(format!("https://www.google.com/calendar/event?eid={prefix}{count}")),
            ..Default::default()
        })
    })
}

impl Default for FakeCalendar {
    fn default() -> Self {
        Self {
            listed: Mutex::new(Vec::new()),
            list: Mutex::new(Box::new(|_| Ok(Vec::new()))),
            delay: Mutex::default(),
            sent: Mutex::default(),
            insert: Mutex::new(answered("created-", "i")),
            patch: Mutex::new(answered("patched-", "p")),
            get: Mutex::new(Box::new(|_| Err(GoogleCalendarError::Gone))),
            delete: Mutex::new(Box::new(|_| Ok(()))),
            held: Mutex::default(),
            gate: tokio::sync::Semaphore::new(0),
            entered: tokio::sync::Notify::new(),
        }
    }
}

impl FakeCalendar {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    pub fn on_list(&self, answer: impl Fn(usize) -> CalendarResult<Vec<GoogleEvent>> + Send + Sync + 'static) {
        *self.list.lock().unwrap() = Box::new(answer);
    }

    /// Always answers with `events`.
    pub fn lists(&self, events: Vec<GoogleEvent>) {
        self.on_list(move |_| Ok(events.clone()));
    }

    pub fn on_insert(&self, answer: impl Fn(usize) -> CalendarResult<GoogleEvent> + Send + Sync + 'static) {
        *self.insert.lock().unwrap() = Box::new(answer);
    }

    pub fn on_patch(&self, answer: impl Fn(usize) -> CalendarResult<GoogleEvent> + Send + Sync + 'static) {
        *self.patch.lock().unwrap() = Box::new(answer);
    }

    pub fn on_get(&self, answer: impl Fn(usize) -> CalendarResult<GoogleEvent> + Send + Sync + 'static) {
        *self.get.lock().unwrap() = Box::new(answer);
    }

    pub fn on_delete(&self, answer: impl Fn(usize) -> CalendarResult<()> + Send + Sync + 'static) {
        *self.delete.lock().unwrap() = Box::new(answer);
    }

    pub fn delay(&self, delay: Duration) {
        *self.delay.lock().unwrap() = delay;
    }

    /// `(token, calendar, window)` of every listing.
    pub fn listings(&self) -> Vec<(String, String, EventWindow)> {
        self.listed.lock().unwrap().clone()
    }

    /// Every write and fetch, in order.
    pub fn sent(&self) -> Vec<Sent> {
        self.sent.lock().unwrap().clone()
    }

    /// The writes from now on wait for [`release`](Self::release).
    pub fn hold(&self) {
        *self.held.lock().unwrap() = true;
    }

    /// Lets the held writes go, and stops holding.
    pub fn release(&self) {
        *self.held.lock().unwrap() = false;
        self.gate.add_permits(1024);
    }

    /// Completes once a write is waiting in [`hold`](Self::hold).
    pub async fn entered(&self) {
        self.entered.notified().await;
    }

    fn record(&self, call: Sent) -> usize {
        let mut sent = self.sent.lock().unwrap();
        let kind = std::mem::discriminant(&call);
        let count = sent.iter().filter(|recorded| std::mem::discriminant(*recorded) == kind).count();
        sent.push(call);
        count
    }

    async fn wait_if_held(&self) {
        let held = *self.held.lock().unwrap();
        if held {
            self.entered.notify_one();
            if let Ok(permit) = self.gate.acquire().await {
                permit.forget();
            }
        }
    }
}

fn unused() -> GoogleCalendarError {
    GoogleCalendarError::Http { status: 0, message: "not used by the tests".into() }
}

#[async_trait]
impl GoogleCalendarApi for FakeCalendar {
    async fn get_primary_calendar(&self, _token: &str) -> CalendarResult<PrimaryCalendar> {
        Err(unused())
    }

    async fn list_events(&self, token: &str, calendar: &str, window: EventWindow) -> CalendarResult<Vec<GoogleEvent>> {
        let count = {
            let mut listed = self.listed.lock().unwrap();
            listed.push((token.to_owned(), calendar.to_owned(), window));
            listed.len() - 1
        };
        let delay = *self.delay.lock().unwrap();
        if !delay.is_zero() {
            tokio::time::sleep(delay).await;
        }
        (self.list.lock().unwrap())(count)
    }

    async fn get_event(&self, _token: &str, event: EventRef<'_>) -> CalendarResult<GoogleEvent> {
        let count = self.record(Sent::Get { calendar: event.calendar_id.to_owned(), event: event.event_id.to_owned() });
        (self.get.lock().unwrap())(count)
    }

    async fn insert_event(&self, token: &str, calendar: &str, body: &GoogleEventBody) -> CalendarResult<GoogleEvent> {
        let count =
            self.record(Sent::Insert { token: token.to_owned(), calendar: calendar.to_owned(), body: body.clone() });
        self.wait_if_held().await;
        (self.insert.lock().unwrap())(count)
    }

    async fn patch_event(
        &self,
        token: &str,
        event: EventRef<'_>,
        etag: &str,
        body: &GoogleEventBody,
    ) -> CalendarResult<GoogleEvent> {
        let count = self.record(Sent::Patch {
            token: token.to_owned(),
            calendar: event.calendar_id.to_owned(),
            event: event.event_id.to_owned(),
            etag: etag.to_owned(),
            body: body.clone(),
        });
        self.wait_if_held().await;
        (self.patch.lock().unwrap())(count)
    }

    async fn delete_event(&self, token: &str, event: EventRef<'_>) -> CalendarResult<()> {
        let count = self.record(Sent::Delete {
            token: token.to_owned(),
            calendar: event.calendar_id.to_owned(),
            event: event.event_id.to_owned(),
        });
        self.wait_if_held().await;
        (self.delete.lock().unwrap())(count)
    }
}

/// A calendar service on `db` over `google`, the fake and the test clock.
pub fn calendar_service(
    db: &life_board_api::db::Db,
    google: &GoogleService,
    api: &Arc<FakeCalendar>,
    clock: &TestClock,
) -> GoogleCalendarService {
    GoogleCalendarService::with_clock(db.clone(), google.clone(), api.clone(), clock.now())
}

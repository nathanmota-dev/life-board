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

//! Test harness (`src/test/create-test-app.ts`): a fresh SQLite file per test,
//! `TestApp` driving the router with `oneshot`, JSON matchers, a fake GitHub
//! client and a disk that injects failures.

#![allow(dead_code)]

use std::collections::VecDeque;
use std::fmt::Debug;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use axum::Router;
use axum::body::Body;
use axum::http::{HeaderMap, Method, Request, StatusCode};
use chrono::{Local, NaiveDate, TimeZone, Utc};
use http_body_util::BodyExt;
use life_board_api::db::columns::Timestamp;
use life_board_api::db::{Db, MIGRATIONS, Migration};
use life_board_api::error::ApiResult;
use life_board_api::services::crypto::CryptoService;
use life_board_api::services::file_storage::{Disk, RealDisk};
use life_board_api::services::github::SyncLogger;
use life_board_api::services::github_client::{
    GithubApi, GithubApiError, GithubResult, RawContributedRepo, RawContributionCalendar, RawContributionDay,
    RawContributionWeek, RawLanguage, RawPull, RawRepoContribution, RawSearchItem, RepoRef,
};
use life_board_api::{AppOptions, AppState, build_app};
use serde::Serialize;
use serde_json::Value;
use tempfile::TempDir;
use tower::ServiceExt;

/// The folder prefix of every test database: spaces, non-ASCII and URL-reserved
/// characters that are valid on every OS, like real profile paths can have.
pub const TEST_DIR_PREFIX: &str = "life board ção #%20-";

pub fn temp_dir(prefix: &str) -> TempDir {
    tempfile::Builder::new().prefix(prefix).tempdir().expect("temporary folder")
}

/// `createTestDb()`.
pub struct TestDb {
    pub db: Db,
    pub dir: TempDir,
}

impl TestDb {
    pub fn path(&self) -> &Path {
        self.dir.path()
    }

    /// The database file, `test.db`.
    pub fn file(&self) -> PathBuf {
        self.dir.path().join("test.db")
    }
}

pub async fn test_db() -> TestDb {
    let dir = temp_dir(TEST_DIR_PREFIX);
    let db = Db::open(&dir.path().join("test.db")).await.expect("test database");
    TestDb { db, dir }
}

/// The migrations whose tag sorts before `tag` (`entry.tag < "0006"`).
pub fn migrations_before(tag: &str) -> &'static [Migration] {
    let end = MIGRATIONS.iter().position(|migration| migration.tag >= tag).unwrap_or(MIGRATIONS.len());
    &MIGRATIONS[..end]
}

/// `Buffer.alloc(32, byte)`.
pub fn key(byte: u8) -> Vec<u8> {
    vec![byte; 32]
}

pub fn crypto(byte: u8) -> CryptoService {
    CryptoService::new(&key(byte)).expect("32-byte key")
}

/// `createTestApp()`.
pub struct TestApp {
    pub app: Router,
    pub state: AppState,
    pub db: Db,
    pub data_dir: PathBuf,
    _dir: TempDir,
}

impl TestApp {
    pub async fn new() -> Self {
        Self::with(|_| {}).await
    }

    /// `createTestApp({ githubClient, authenticate })`: adjust the options before the app is built.
    pub async fn with(configure: impl FnOnce(&mut AppOptions)) -> Self {
        let database = test_db().await;
        let mut options = AppOptions::new(database.db.clone(), database.path(), crypto(7));
        configure(&mut options);
        let state = AppState::new(options).await.expect("app state");
        let app = build_app(state.clone());
        Self { app, state, db: database.db, data_dir: database.dir.path().to_path_buf(), _dir: database.dir }
    }

    /// `app.inject(...)`.
    pub async fn send(&self, request: Request<Body>) -> TestResponse {
        let response = self.app.clone().oneshot(request).await.expect("infallible router");
        let status = response.status();
        let headers = response.headers().clone();
        let body = response.into_body().collect().await.expect("response body").to_bytes().to_vec();
        TestResponse { status, headers, body }
    }

    pub async fn request(&self, method: Method, uri: &str, payload: Option<Value>) -> TestResponse {
        let builder = Request::builder().method(method).uri(uri);
        let request = match payload {
            Some(payload) => builder
                .header("content-type", "application/json")
                .body(Body::from(payload.to_string()))
                .expect("request"),
            None => builder.body(Body::empty()).expect("request"),
        };
        self.send(request).await
    }

    pub async fn get(&self, uri: &str) -> TestResponse {
        self.request(Method::GET, uri, None).await
    }

    pub async fn post(&self, uri: &str, payload: Value) -> TestResponse {
        self.request(Method::POST, uri, Some(payload)).await
    }

    /// A POST without a body (`inject({ method: "POST", url })`).
    pub async fn post_empty(&self, uri: &str) -> TestResponse {
        self.request(Method::POST, uri, None).await
    }

    pub async fn patch(&self, uri: &str, payload: Value) -> TestResponse {
        self.request(Method::PATCH, uri, Some(payload)).await
    }

    pub async fn put(&self, uri: &str, payload: Value) -> TestResponse {
        self.request(Method::PUT, uri, Some(payload)).await
    }

    pub async fn delete(&self, uri: &str) -> TestResponse {
        self.request(Method::DELETE, uri, None).await
    }
}

pub struct TestResponse {
    pub status: StatusCode,
    pub headers: HeaderMap,
    pub body: Vec<u8>,
}

impl TestResponse {
    pub fn status(&self) -> u16 {
        self.status.as_u16()
    }

    pub fn json(&self) -> Value {
        serde_json::from_slice(&self.body)
            .unwrap_or_else(|error| panic!("not JSON ({error}): {}", String::from_utf8_lossy(&self.body)))
    }

    pub fn text(&self) -> String {
        String::from_utf8_lossy(&self.body).into_owned()
    }

    pub fn header(&self, name: &str) -> Option<&str> {
        self.headers.get(name).and_then(|value| value.to_str().ok())
    }
}

/// A multipart body like the controller test builds by hand.
pub fn multipart(fields: &[(&str, &str)], file: Option<(&str, &str, &[u8])>) -> (String, Vec<u8>) {
    let boundary = "life-board-boundary";
    let mut body = Vec::new();
    for (name, value) in fields {
        body.extend_from_slice(
            format!("--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n").as_bytes(),
        );
    }
    if let Some((name, mime, content)) = file {
        body.extend_from_slice(
            format!(
                "--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{name}\"\r\nContent-Type: {mime}\r\n\r\n"
            )
            .as_bytes(),
        );
        body.extend_from_slice(content);
        body.extend_from_slice(b"\r\n");
    }
    body.extend_from_slice(format!("--{boundary}--\r\n").as_bytes());
    (format!("multipart/form-data; boundary={boundary}"), body)
}

pub fn multipart_request(uri: &str, fields: &[(&str, &str)], file: Option<(&str, &str, &[u8])>) -> Request<Body> {
    let (content_type, body) = multipart(fields, file);
    Request::builder()
        .method(Method::POST)
        .uri(uri)
        .header("content-type", content_type)
        .body(Body::from(body))
        .expect("request")
}

/// `new Date(year, month - 1, day, hour, minute)`: local time, months from 1.
pub fn local(year: i32, month: u32, day: u32, hour: u32, minute: u32) -> Timestamp {
    let naive = NaiveDate::from_ymd_opt(year, month, day)
        .and_then(|date| date.and_hms_opt(hour, minute, 0))
        .expect("valid date");
    Local.from_local_datetime(&naive).earliest().expect("local time").to_utc()
}

/// `new Date(year, month - 1, day)`.
pub fn local_day(year: i32, month: u32, day: u32) -> Timestamp {
    local(year, month, day, 0, 0)
}

/// `new Date(ms)`.
pub fn ms(millis: i64) -> Timestamp {
    Utc.timestamp_millis_opt(millis).single().expect("valid timestamp")
}

pub fn now() -> Timestamp {
    Utc::now()
}

pub fn to_json<T: Serialize>(value: &T) -> Value {
    serde_json::to_value(value).expect("serializable")
}

/// `expect.any(String)` inside [`assert_match`] patterns.
pub const ANY_STRING: &str = "<any string>";
/// `expect.any(Number)` inside [`assert_match`] patterns.
pub const ANY_NUMBER: &str = "<any number>";

fn matches(actual: &Value, expected: &Value) -> bool {
    match (actual, expected) {
        (Value::String(_), Value::String(pattern)) if pattern == ANY_STRING => true,
        (Value::Number(_), Value::String(pattern)) if pattern == ANY_NUMBER => true,
        (Value::Object(actual), Value::Object(expected)) => {
            expected.iter().all(|(key, value)| actual.get(key).is_some_and(|found| matches(found, value)))
        }
        (Value::Array(actual), Value::Array(expected)) => {
            actual.len() == expected.len() && actual.iter().zip(expected).all(|(a, e)| matches(a, e))
        }
        _ => actual == expected,
    }
}

/// `toMatchObject` (objects match a subset of keys, arrays match item by item).
#[track_caller]
pub fn assert_match(actual: &Value, expected: &Value) {
    assert!(
        matches(actual, expected),
        "\nexpected to match: {}\n            actual: {}",
        serde_json::to_string_pretty(expected).unwrap_or_default(),
        serde_json::to_string_pretty(actual).unwrap_or_default()
    );
}

#[track_caller]
pub fn assert_not_found<T: Debug>(result: ApiResult<T>) {
    match result {
        Err(error) => assert!(error.is_not_found(), "expected a NotFoundError, got {error:?}"),
        Ok(value) => panic!("expected a NotFoundError, got {value:?}"),
    }
}

#[track_caller]
pub fn assert_bad_request<T: Debug>(result: ApiResult<T>) {
    match result {
        Err(error) => assert!(error.is_bad_request(), "expected a BadRequestError, got {error:?}"),
        Ok(value) => panic!("expected a BadRequestError, got {value:?}"),
    }
}

/// `rejects.toMatchObject({ statusCode, code })`.
#[track_caller]
pub fn assert_error<T: Debug>(result: ApiResult<T>, status: u16, code: &str) {
    match result {
        Err(error) => {
            assert_eq!(error.status().as_u16(), status, "{error:?}");
            assert_eq!(error.code(), code, "{error:?}");
        }
        Ok(value) => panic!("expected {status} {code}, got {value:?}"),
    }
}

/// `rejects.toMatchObject({ code })`.
#[track_caller]
pub fn assert_code<T: Debug>(result: ApiResult<T>, code: &str) {
    match result {
        Err(error) => assert_eq!(error.code(), code, "{error:?}"),
        Ok(value) => panic!("expected {code}, got {value:?}"),
    }
}

/// `logger = { warn: vi.fn() }`.
#[derive(Default)]
pub struct RecordingLogger {
    pub warnings: Mutex<Vec<String>>,
}

impl RecordingLogger {
    pub fn warnings(&self) -> Vec<String> {
        self.warnings.lock().expect("logger").clone()
    }
}

impl SyncLogger for RecordingLogger {
    fn warn(&self, message: &str) {
        self.warnings.lock().expect("logger").push(message.to_owned());
    }
}

type Handler<A, T> = Box<dyn Fn(A) -> GithubResult<T> + Send + Sync>;

/// `fakeClient(overrides)`: every call is recorded; each method answers with
/// its closure, which tests replace like `vi.fn` overrides.
pub struct FakeGithub {
    pub calls: Mutex<Vec<String>>,
    pub get_login: Mutex<Handler<String, String>>,
    pub search_issues: Mutex<Handler<(String, String), Vec<RawSearchItem>>>,
    pub list_owned_repos: Mutex<Handler<(String, String, usize), Vec<RepoRef>>>,
    pub list_open_pulls: Mutex<Handler<(String, RepoRef), Vec<RawPull>>>,
    pub get_pull: Mutex<Handler<(String, RepoRef, i64), RawPull>>,
    pub get_contributions: Mutex<Handler<(String, String), RawContributionCalendar>>,
    pub get_contributed_repos: Mutex<Handler<(String, String, usize), Vec<RawRepoContribution>>>,
}

pub fn github_error(message: &str) -> GithubApiError {
    GithubApiError::new(0, message)
}

/// The `pull(number, extra)` fixture of the GitHub service tests.
pub fn pull(number: i64) -> RawPull {
    RawPull {
        number,
        title: format!("PR {number}"),
        state: "open".into(),
        draft: false,
        html_url: format!("https://github.com/me/app/pull/{number}"),
        user: Some(life_board_api::services::github_client::GithubUser { login: "friend".into(), avatar_url: None }),
        base: life_board_api::services::github_client::BranchRef { name: "main".into() },
        head: life_board_api::services::github_client::BranchRef { name: format!("feature-{number}") },
        created_at: "2026-10-01T00:00:00Z".into(),
        updated_at: "2026-10-10T00:00:00Z".into(),
        merged_at: None,
        additions: Some(10),
        deletions: Some(2),
        changed_files: Some(3),
    }
}

/// The `searchItem(owner, number, updatedAt)` fixture.
pub fn search_item(owner: &str, number: i64, updated_at: &str) -> RawSearchItem {
    RawSearchItem {
        number,
        title: format!("PR {number}"),
        state: "open".into(),
        draft: None,
        html_url: format!("https://github.com/{owner}/app/pull/{number}"),
        user: Some(life_board_api::services::github_client::GithubUser {
            login: "author".into(),
            avatar_url: Some("https://avatar".into()),
        }),
        repository_url: format!("https://api.github.com/repos/{owner}/app"),
        created_at: "2026-10-01T00:00:00Z".into(),
        updated_at: updated_at.into(),
        pull_request: None,
        labels: None,
        comments: None,
    }
}

impl Default for FakeGithub {
    fn default() -> Self {
        Self {
            calls: Mutex::new(Vec::new()),
            get_login: Mutex::new(Box::new(|_| Ok("me".into()))),
            search_issues: Mutex::new(Box::new(|_| Ok(Vec::new()))),
            list_owned_repos: Mutex::new(Box::new(|_| Ok(Vec::new()))),
            list_open_pulls: Mutex::new(Box::new(|_| Ok(Vec::new()))),
            get_pull: Mutex::new(Box::new(|(_, _, number)| Ok(pull(number)))),
            get_contributions: Mutex::new(Box::new(|_| {
                let day = |date: &str, count, level: &str| RawContributionDay {
                    date: date.into(),
                    contribution_count: count,
                    contribution_level: level.into(),
                };
                Ok(RawContributionCalendar {
                    total_contributions: 5,
                    weeks: vec![RawContributionWeek {
                        contribution_days: vec![day("2026-10-11", 0, "NONE"), day("2026-10-12", 5, "FOURTH_QUARTILE")],
                    }],
                })
            })),
            get_contributed_repos: Mutex::new(Box::new(|_| {
                Ok(vec![
                    RawRepoContribution {
                        repository: RawContributedRepo {
                            name_with_owner: "me/app".into(),
                            url: "https://github.com/me/app".into(),
                            description: Some("My app".into()),
                            is_private: true,
                            stargazer_count: 3,
                            primary_language: Some(RawLanguage {
                                name: "TypeScript".into(),
                                color: Some("#3178c6".into()),
                            }),
                        },
                        last_contributed_at: "2026-10-12T00:00:00Z".into(),
                    },
                    RawRepoContribution {
                        repository: RawContributedRepo {
                            name_with_owner: "org/lib".into(),
                            url: "https://github.com/org/lib".into(),
                            description: None,
                            is_private: false,
                            stargazer_count: 0,
                            primary_language: None,
                        },
                        last_contributed_at: "2026-09-01T00:00:00Z".into(),
                    },
                ])
            })),
        }
    }
}

impl FakeGithub {
    fn record(&self, call: String) {
        self.calls.lock().expect("calls").push(call);
    }

    /// Calls recorded as `method(arg, ...)`.
    pub fn calls(&self) -> Vec<String> {
        self.calls.lock().expect("calls").clone()
    }
}

#[async_trait]
impl GithubApi for FakeGithub {
    async fn get_login(&self, token: &str) -> GithubResult<String> {
        self.record(format!("get_login({token})"));
        (self.get_login.lock().expect("fake"))(token.to_owned())
    }

    async fn search_issues(&self, token: &str, query: &str) -> GithubResult<Vec<RawSearchItem>> {
        self.record(format!("search_issues({token}, {query})"));
        (self.search_issues.lock().expect("fake"))((token.to_owned(), query.to_owned()))
    }

    async fn list_owned_repos(&self, token: &str, login: &str, max: usize) -> GithubResult<Vec<RepoRef>> {
        self.record(format!("list_owned_repos({token}, {login}, {max})"));
        (self.list_owned_repos.lock().expect("fake"))((token.to_owned(), login.to_owned(), max))
    }

    async fn list_open_pulls(&self, token: &str, repo: &RepoRef) -> GithubResult<Vec<RawPull>> {
        self.record(format!("list_open_pulls({token}, {}/{})", repo.owner, repo.name));
        (self.list_open_pulls.lock().expect("fake"))((token.to_owned(), repo.clone()))
    }

    async fn get_pull(&self, token: &str, repo: &RepoRef, number: i64) -> GithubResult<RawPull> {
        self.record(format!("get_pull({token}, {}/{}, {number})", repo.owner, repo.name));
        (self.get_pull.lock().expect("fake"))((token.to_owned(), repo.clone(), number))
    }

    async fn get_contributions(&self, token: &str, login: &str) -> GithubResult<RawContributionCalendar> {
        self.record(format!("get_contributions({token}, {login})"));
        (self.get_contributions.lock().expect("fake"))((token.to_owned(), login.to_owned()))
    }

    async fn get_contributed_repos(
        &self,
        token: &str,
        login: &str,
        first: usize,
    ) -> GithubResult<Vec<RawRepoContribution>> {
        self.record(format!("get_contributed_repos({token}, {login}, {first})"));
        (self.get_contributed_repos.lock().expect("fake"))((token.to_owned(), login.to_owned(), first))
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DiskOp {
    CreateDirAll,
    Write,
    Copy,
    Size,
    Open,
    RemoveFile,
    CheckWritableDir,
}

type Fault = Box<dyn Fn(&Path) -> Option<io::Error> + Send + Sync>;

/// [`RealDisk`] with queued failures (`mockRejectedValueOnce`) and a call log
/// (`vi.spyOn(...)` assertions).
#[derive(Default)]
pub struct FaultyDisk {
    pub calls: Mutex<Vec<(DiskOp, PathBuf)>>,
    once: Mutex<VecDeque<(DiskOp, io::ErrorKind)>>,
    always: Mutex<Vec<(DiskOp, Fault)>>,
}

impl FaultyDisk {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    /// The next `op` fails with `kind`.
    pub fn fail_once(&self, op: DiskOp, kind: io::ErrorKind) {
        self.once.lock().expect("faults").push_back((op, kind));
    }

    /// Every `op` whose path makes `fault` return an error fails with it.
    pub fn fail_when(&self, op: DiskOp, fault: impl Fn(&Path) -> Option<io::Error> + Send + Sync + 'static) {
        self.always.lock().expect("faults").push((op, Box::new(fault)));
    }

    pub fn count(&self, op: DiskOp) -> usize {
        self.calls.lock().expect("calls").iter().filter(|(called, _)| *called == op).count()
    }

    fn check(&self, op: DiskOp, path: &Path) -> io::Result<()> {
        self.calls.lock().expect("calls").push((op, path.to_path_buf()));
        let mut once = self.once.lock().expect("faults");
        if let Some(index) = once.iter().position(|(queued, _)| *queued == op) {
            let (_, kind) = once.remove(index).expect("queued fault");
            return Err(io::Error::new(kind, format!("injected {op:?} failure")));
        }
        drop(once);
        for (faulty, fault) in self.always.lock().expect("faults").iter() {
            if *faulty == op
                && let Some(error) = fault(path)
            {
                return Err(error);
            }
        }
        Ok(())
    }
}

#[async_trait]
impl Disk for FaultyDisk {
    async fn create_dir_all(&self, path: &Path) -> io::Result<()> {
        self.check(DiskOp::CreateDirAll, path)?;
        RealDisk.create_dir_all(path).await
    }

    async fn write(&self, path: &Path, bytes: &[u8]) -> io::Result<()> {
        self.check(DiskOp::Write, path)?;
        RealDisk.write(path, bytes).await
    }

    async fn copy(&self, from: &Path, to: &Path) -> io::Result<()> {
        self.check(DiskOp::Copy, from)?;
        RealDisk.copy(from, to).await
    }

    async fn size(&self, path: &Path) -> io::Result<u64> {
        self.check(DiskOp::Size, path)?;
        RealDisk.size(path).await
    }

    async fn open(&self, path: &Path) -> io::Result<tokio::fs::File> {
        self.check(DiskOp::Open, path)?;
        RealDisk.open(path).await
    }

    async fn remove_file(&self, path: &Path) -> io::Result<()> {
        self.check(DiskOp::RemoveFile, path)?;
        RealDisk.remove_file(path).await
    }

    async fn check_writable_dir(&self, path: &Path) -> io::Result<()> {
        self.check(DiskOp::CheckWritableDir, path)?;
        RealDisk.check_writable_dir(path).await
    }
}

/// Reads a whole opened file (`text(stream)`).
pub async fn read_all(mut file: tokio::fs::File) -> String {
    use tokio::io::AsyncReadExt;
    let mut text = String::new();
    file.read_to_string(&mut text).await.expect("readable file");
    text
}

/// Sorted file names of a folder (`readdir`).
pub fn list_dir(path: &Path) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(path)
        .expect("readable folder")
        .map(|entry| entry.expect("entry").file_name().to_string_lossy().into_owned())
        .collect();
    names.sort();
    names
}

/// The length of a JSON array (`toHaveLength`).
#[track_caller]
pub fn len(value: &Value) -> usize {
    value.as_array().unwrap_or_else(|| panic!("expected an array, got {value}")).len()
}

/// A string field, such as the `id` of a created row.
#[track_caller]
pub fn text(value: &Value, key: &str) -> String {
    value[key].as_str().unwrap_or_else(|| panic!("expected a string at {key}: {value}")).to_owned()
}

/// `items.map((item) => item[key])`.
#[track_caller]
pub fn pluck(items: &Value, key: &str) -> Vec<Value> {
    items
        .as_array()
        .unwrap_or_else(|| panic!("expected an array, got {items}"))
        .iter()
        .map(|item| item[key].clone())
        .collect()
}

/// `{ ...base, ...extra }`.
pub fn merge(base: Value, extra: &Value) -> Value {
    let mut merged = base;
    if let (Some(target), Some(source)) = (merged.as_object_mut(), extra.as_object()) {
        for (key, value) in source {
            target.insert(key.clone(), value.clone());
        }
    }
    merged
}

impl FakeGithub {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    pub fn on_get_login(&self, f: impl Fn(String) -> GithubResult<String> + Send + Sync + 'static) {
        *self.get_login.lock().expect("fake") = Box::new(f);
    }

    /// `searchIssues: vi.fn(async (_token, query) => ...)`.
    pub fn on_search_issues(&self, f: impl Fn(&str) -> GithubResult<Vec<RawSearchItem>> + Send + Sync + 'static) {
        *self.search_issues.lock().expect("fake") = Box::new(move |(_, query)| f(&query));
    }

    pub fn on_list_owned_repos(&self, f: impl Fn() -> GithubResult<Vec<RepoRef>> + Send + Sync + 'static) {
        *self.list_owned_repos.lock().expect("fake") = Box::new(move |_| f());
    }

    pub fn on_list_open_pulls(&self, f: impl Fn(&RepoRef) -> GithubResult<Vec<RawPull>> + Send + Sync + 'static) {
        *self.list_open_pulls.lock().expect("fake") = Box::new(move |(_, repo)| f(&repo));
    }

    pub fn on_get_pull(&self, f: impl Fn(i64) -> GithubResult<RawPull> + Send + Sync + 'static) {
        *self.get_pull.lock().expect("fake") = Box::new(move |(_, _, number)| f(number));
    }

    pub fn on_get_contributions(&self, f: impl Fn() -> GithubResult<RawContributionCalendar> + Send + Sync + 'static) {
        *self.get_contributions.lock().expect("fake") = Box::new(move |_| f());
    }

    pub fn on_get_contributed_repos(
        &self,
        f: impl Fn() -> GithubResult<Vec<RawRepoContribution>> + Send + Sync + 'static,
    ) {
        *self.get_contributed_repos.lock().expect("fake") = Box::new(move |_| f());
    }
}

/// `tests/fixtures/<name>`.
pub fn fixture(name: &str) -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures").join(name)
}

/// The profile recorded from the Node API (`record-node-fixtures.mjs`).
pub const NODE_PROFILE: &str = "node-1.1.2";

impl TestApp {
    /// An app on a copy of `profile.db`, so the fixture itself never changes.
    pub async fn on_copy_of(profile: &str, crypto: CryptoService) -> Self {
        let dir = temp_dir(TEST_DIR_PREFIX);
        std::fs::copy(fixture(&format!("{profile}.db")), dir.path().join("life-board.db")).expect("fixture database");
        let db = Db::open(&dir.path().join("life-board.db")).await.expect("fixture database");
        let state = AppState::new(AppOptions::new(db.clone(), dir.path(), crypto)).await.expect("app state");
        let app = build_app(state.clone());
        Self { app, state, db, data_dir: dir.path().to_path_buf(), _dir: dir }
    }
}

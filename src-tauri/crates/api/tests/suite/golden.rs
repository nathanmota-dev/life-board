//! Rust-only: the Rust API answers the recorded GET requests exactly like the
//! Node API did on the same profile (`tests/fixtures/node-1.1.2`). Error
//! messages may differ; codes, issue paths and everything else may not.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use chrono::{Local, Offset, TimeZone, Utc};
use life_board_api::db::columns::Timestamp;
use life_board_api::services::crypto::{CryptoService, SealedSecret};
use life_board_api::services::github::{GithubService, TracingLogger};
use serde::Deserialize;
use serde_json::Value;

use crate::common::{FakeGithub, NODE_PROFILE, TestApp, fixture, to_json};

#[derive(Deserialize)]
struct Entry {
    module: String,
    name: String,
    path: String,
}

#[derive(Deserialize)]
struct Recorded {
    status: u16,
    body: Value,
}

/// `clock.<zone>.json`: what the Node services answered at a fixed instant.
#[derive(Deserialize)]
struct ClockCase {
    #[serde(with = "life_board_api::db::columns::js_date")]
    at: Timestamp,
    stats: Value,
    goals: Value,
    goal: Value,
}

#[derive(Deserialize)]
struct CryptoCase {
    plaintext: String,
    sealed: SealedSecret,
}

#[derive(Deserialize)]
struct CryptoFixture {
    key: String,
    cases: Vec<CryptoCase>,
}

fn read<T: serde::de::DeserializeOwned>(path: std::path::PathBuf) -> T {
    serde_json::from_str(&std::fs::read_to_string(&path).unwrap_or_else(|error| panic!("{}: {error}", path.display())))
        .unwrap()
}

fn crypto_fixture() -> CryptoFixture {
    read(fixture("crypto.json"))
}

fn node_crypto() -> CryptoService {
    CryptoService::new(&STANDARD.decode(crypto_fixture().key).unwrap()).unwrap()
}

/// Error bodies keep `error` and the issue paths; their messages are free text.
fn comparable(status: u16, mut body: Value) -> Value {
    if status >= 400
        && let Some(object) = body.as_object_mut()
    {
        object.remove("message");
        if let Some(Value::Array(issues)) = object.get_mut("issues") {
            for issue in issues.iter_mut().filter_map(Value::as_object_mut) {
                issue.remove("message");
            }
        }
    }
    body
}

/// Replays, in order, the recorded requests of `module` on a copy of the Node profile.
async fn answers_like_node(module: &str) {
    let ctx = TestApp::on_copy_of(NODE_PROFILE, node_crypto()).await;
    let manifest: Vec<Entry> = read(fixture(&format!("{NODE_PROFILE}/manifest.json")));
    let entries: Vec<&Entry> = manifest.iter().filter(|entry| entry.module == module).collect();
    assert!(!entries.is_empty(), "no recorded requests for {module}");
    for entry in entries {
        let expected: Recorded = read(fixture(&format!("{NODE_PROFILE}/{}.json", entry.name)));
        let response = ctx.get(&entry.path).await;
        assert_eq!(response.status(), expected.status, "{}", entry.path);
        assert_eq!(
            comparable(response.status(), response.json()),
            comparable(expected.status, expected.body),
            "{}",
            entry.path
        );
    }
}

#[test]
fn opens_secrets_sealed_by_node() {
    let crypto = node_crypto();
    for case in crypto_fixture().cases {
        assert_eq!(crypto.open(&case.sealed).unwrap(), case.plaintext);
    }
}

#[tokio::test]
async fn tasks_answer_like_node() {
    answers_like_node("tasks").await;
}

#[tokio::test]
async fn thoughts_answer_like_node() {
    answers_like_node("thoughts").await;
}

#[tokio::test]
async fn links_answer_like_node() {
    answers_like_node("links").await;
}

#[tokio::test]
async fn calendar_answers_like_node() {
    answers_like_node("calendar").await;
}

#[tokio::test]
async fn mood_answers_like_node() {
    answers_like_node("mood").await;
}

#[tokio::test]
async fn habits_answer_like_node() {
    answers_like_node("habits").await;
}

#[tokio::test]
async fn goals_answer_like_node() {
    answers_like_node("goals").await;
}

#[tokio::test]
async fn projects_answer_like_node() {
    answers_like_node("projects").await;
}

#[tokio::test]
async fn file_boards_answer_like_node() {
    answers_like_node("file_boards").await;
}

#[tokio::test]
async fn settings_answer_like_node() {
    let ctx = TestApp::on_copy_of(NODE_PROFILE, node_crypto()).await;
    let expected: Recorded = read(fixture(&format!("{NODE_PROFILE}/settings.files.json")));
    let uploads = ctx.data_dir.join("uploads").to_string_lossy().into_owned();
    let response = ctx.get("/api/settings/files").await;
    assert_eq!(response.status(), expected.status);
    let mut actual = response.json();
    for key in ["uploadsDir", "defaultUploadsDir"] {
        assert_eq!(actual[key], uploads, "{key}");
        actual[key] = "<data>/uploads".into();
    }
    assert_eq!(actual, expected.body);
}

/// The recorded zone with the process's UTC offset, if there is one.
fn recorded_zone() -> Option<&'static str> {
    match Local.offset_from_utc_datetime(&Utc::now().naive_utc()).fix().local_minus_utc() {
        0 => Some("UTC"),
        -10_800 => Some("America_Sao_Paulo"),
        _ => None,
    }
}

#[tokio::test]
async fn goals_and_stats_at_fixed_instants_answer_like_node() {
    let Some(zone) = recorded_zone() else {
        eprintln!("skipped: Node's answers were recorded for UTC and America/Sao_Paulo only");
        return;
    };
    let ctx = TestApp::on_copy_of(NODE_PROFILE, node_crypto()).await;
    let cases: Vec<ClockCase> = read(fixture(&format!("{NODE_PROFILE}/clock.{zone}.json")));
    assert_eq!(cases.len(), 3);
    for case in cases {
        assert_eq!(to_json(&ctx.state.stats.this_week(case.at).await.unwrap()), case.stats, "stats at {}", case.at);
        assert_eq!(to_json(&ctx.state.goals.list(case.at).await.unwrap()), case.goals, "goals at {}", case.at);
        assert_eq!(to_json(&ctx.state.goals.get("g-books", case.at).await.unwrap()), case.goal, "goal at {}", case.at);
    }
}

#[tokio::test]
async fn github_answers_like_node() {
    answers_like_node("github").await;
}

#[tokio::test]
async fn github_token_in_the_profile_opens_like_node() {
    let ctx = TestApp::on_copy_of(NODE_PROFILE, node_crypto()).await;
    let client = FakeGithub::new();
    let service = GithubService::new(
        ctx.db.clone(),
        client.clone(),
        ctx.state.crypto.clone(),
        std::sync::Arc::new(TracingLogger),
    );

    service.contributions().await.unwrap();

    let token = &crypto_fixture().cases[0].plaintext;
    assert!(client.calls().contains(&format!("get_contributions({token}, octocat)")));
}

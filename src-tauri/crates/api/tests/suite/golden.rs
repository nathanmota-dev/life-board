//! Rust-only: the Rust API answers the recorded GET requests exactly like the
//! Node API did on the same profile (`tests/fixtures/node-1.1.2`). Error
//! messages may differ; codes, issue paths and everything else may not.

use base64::Engine;
use base64::engine::general_purpose::STANDARD;
use life_board_api::services::crypto::{CryptoService, SealedSecret};
use serde::Deserialize;
use serde_json::Value;

use crate::common::{NODE_PROFILE, TestApp, fixture};

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
#[ignore = "pending #51"]
fn opens_secrets_sealed_by_node() {
    let crypto = node_crypto();
    for case in crypto_fixture().cases {
        assert_eq!(crypto.open(&case.sealed).unwrap(), case.plaintext);
    }
}

#[tokio::test]
#[ignore = "pending #51"]
async fn tasks_answer_like_node() {
    answers_like_node("tasks").await;
}

#[tokio::test]
#[ignore = "pending #51"]
async fn thoughts_answer_like_node() {
    answers_like_node("thoughts").await;
}

#[tokio::test]
#[ignore = "pending #51"]
async fn links_answer_like_node() {
    answers_like_node("links").await;
}

#[tokio::test]
#[ignore = "pending #51"]
async fn calendar_answers_like_node() {
    answers_like_node("calendar").await;
}

#[tokio::test]
#[ignore = "pending #51"]
async fn mood_answers_like_node() {
    answers_like_node("mood").await;
}

#[tokio::test]
#[ignore = "pending #51"]
async fn habits_answer_like_node() {
    answers_like_node("habits").await;
}

#[tokio::test]
#[ignore = "pending #52"]
async fn goals_answer_like_node() {
    answers_like_node("goals").await;
}

#[tokio::test]
#[ignore = "pending #52"]
async fn projects_answer_like_node() {
    answers_like_node("projects").await;
}

#[tokio::test]
#[ignore = "pending #52"]
async fn file_boards_answer_like_node() {
    answers_like_node("file_boards").await;
}

#[tokio::test]
#[ignore = "pending #53"]
async fn github_answers_like_node() {
    answers_like_node("github").await;
}

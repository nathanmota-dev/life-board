use life_board_api::db::Db;
use life_board_api::services::github::GithubService;
use life_board_api::services::google::GoogleService;
use std::sync::Arc;

use crate::common::google::{FakeGoogle, TestClock, google_service};
use crate::common::{FakeGithub, RecordingLogger, crypto, migrations_before, temp_dir};

#[tokio::test]
async fn upgrades_from_before_0009_keeping_the_data_and_starting_without_google() {
    let dir = temp_dir("google-migration-");
    let path = dir.path().join("legacy.db");
    let legacy = Db::open_with(&path, migrations_before("0009")).await.unwrap();
    legacy
        .call(|conn| {
            conn.execute_batch(
                "INSERT INTO tasks (id, title, tags, linked_thought_ids, created_at, updated_at) VALUES ('kept', 'Kept task', '[]', '[]', 1792195200000, 1792195200000);
                 INSERT INTO github_settings (id, token_ciphertext, token_iv, token_tag, login, created_at, updated_at) VALUES ('default', 'c', 'i', 't', 'octocat', 1792195200000, 1792195200000);",
            )
        })
        .await
        .unwrap();
    legacy.close().await.unwrap();

    let upgraded = Db::open(&path).await.unwrap();
    let title: String = upgraded
        .call(|conn| conn.query_row("SELECT title FROM tasks WHERE id = 'kept'", [], |row| row.get(0)))
        .await
        .unwrap();
    assert_eq!(title, "Kept task");
    let github =
        GithubService::new(upgraded.clone(), FakeGithub::new(), crypto(3), Arc::new(RecordingLogger::default()));
    assert_eq!(github.status().await.unwrap().login.as_deref(), Some("octocat"));
    let google: GoogleService = google_service(&upgraded, &FakeGoogle::new(), &TestClock::new());
    let status = google.status().await.unwrap();
    assert!(!status.has_credentials && !status.connected);
    drop((github, google));
    upgraded.close().await.unwrap();
}

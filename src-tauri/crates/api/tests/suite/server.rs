use life_board_api::db::Db;
use life_board_api::db::schema::calendar::{EventSource, NewCalendarEvent, insert_row};
use life_board_api::db::schema::github::{NewGithubSettings, insert_settings};
use life_board_api::{ServerOptions, start_server};
use rstest::rstest;
use serde_json::{Value, json};

use crate::common::{assert_match, key, list_dir, temp_dir};

async fn get_json(url: &str) -> Value {
    reqwest::get(url).await.unwrap().json().await.unwrap()
}

#[tokio::test]
async fn creates_the_database_listens_on_a_free_port_and_shuts_down_cleanly() {
    let root = temp_dir("life-board-server-");
    let data_dir = root.path().join("data");
    let server = start_server(ServerOptions::new(&data_dir, key(3))).await.unwrap();

    assert!(server.port > 0);
    assert_match(&get_json(&format!("{}/api/health", server.url)).await, &json!({ "ok": true }));
    assert!(data_dir.join("life-board.db").is_file());
    server.close().await;
}

#[tokio::test]
async fn keeps_the_database_inside_a_profile_path_with_spaces_non_ascii_and_url_syntax() {
    let root = temp_dir("life-board-server-");
    let data_dir = root.path().join("Usuário Ç #1 %20").join("life-board-app");
    let server = start_server(ServerOptions::new(&data_dir, key(3))).await.unwrap();

    assert_match(&get_json(&format!("{}/api/health", server.url)).await, &json!({ "ok": true }));
    assert_eq!(list_dir(root.path()), ["Usuário Ç #1 %20"]);
    assert!(list_dir(&data_dir).contains(&"life-board.db".to_owned()));
    server.close().await;
}

#[rstest]
#[case::kept(false)]
#[case::reset(true)]
#[tokio::test]
async fn drops_only_the_encrypted_secrets_when_the_key_was_replaced_reset(#[case] reset_secrets: bool) {
    let root = temp_dir("life-board-server-");
    let data_dir = root.path().join("data");
    let first = start_server(ServerOptions::new(&data_dir, key(3))).await.unwrap();
    let created: Value = reqwest::Client::new()
        .post(format!("{}/api/tasks", first.url))
        .json(&json!({ "title": "Kept" }))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let task_id = created["id"].as_str().unwrap().to_owned();
    first.close().await;
    let database = Db::open(&data_dir.join("life-board.db")).await.unwrap();
    insert_settings(
        &database,
        vec![NewGithubSettings {
            id: "default".into(),
            token_ciphertext: "c".into(),
            token_iv: "i".into(),
            token_tag: "t".into(),
            login: "octocat".into(),
            ..Default::default()
        }],
    )
    .await
    .unwrap();
    database
        .call(|conn| {
            conn.execute(
                "INSERT INTO google_settings (id, client_id_ciphertext, client_id_iv, client_id_tag, client_secret_ciphertext, client_secret_iv, client_secret_tag, created_at, updated_at) VALUES ('default', 'c', 'i', 't', 'c', 'i', 't', 1, 1)",
                [],
            )
        })
        .await
        .unwrap();
    database
        .call(|conn| {
            let event = |id: &str, source: EventSource| NewCalendarEvent {
                id: id.into(),
                title: id.into(),
                source: Some(source),
                external_id: Some(id.into()),
                external_calendar_id: Some("primary".into()),
                external_url: Some("https://calendar.google.com/x".into()),
                ..Default::default()
            };
            insert_row(conn, event("imported", EventSource::Google))?;
            insert_row(conn, event("mine", EventSource::Local))
        })
        .await
        .unwrap();
    database.close().await.unwrap();

    let options = ServerOptions { reset_secrets, ..ServerOptions::new(&data_dir, key(4)) };
    let server = start_server(options).await.unwrap();
    let saved = get_json(&format!("{}/api/tasks/{task_id}", server.url)).await;
    let github = get_json(&format!("{}/api/github/status", server.url)).await;
    let google = get_json(&format!("{}/api/google/status", server.url)).await;
    assert_eq!(saved["title"], "Kept");
    assert_eq!(github["connected"], !reset_secrets);
    assert_eq!(google["hasCredentials"], !reset_secrets);
    // Without the account the imported events go and the local ones lose their link.
    let events = get_json(&format!("{}/api/calendar/events", server.url)).await;
    let items = events["items"].as_array().unwrap();
    let title = |item: &Value| item["title"].as_str().unwrap().to_owned();
    assert_eq!(
        items.iter().map(title).collect::<Vec<_>>(),
        if reset_secrets { vec!["mine"] } else { vec!["imported", "mine"] }
    );
    let mine = items.iter().find(|item| item["title"] == "mine").unwrap();
    assert_eq!(mine["externalUrl"], if reset_secrets { Value::Null } else { json!("https://calendar.google.com/x") });
    server.close().await;
}

#[tokio::test]
async fn sends_the_google_redirect_back_to_the_address_it_listens_on() {
    let root = temp_dir("life-board-server-");
    let server = start_server(ServerOptions::new(root.path().join("data"), key(3))).await.unwrap();
    let client = reqwest::Client::new();
    let saved = client
        .put(format!("{}/api/google/credentials", server.url))
        .json(&json!({ "clientId": "1-x.apps.googleusercontent.com", "clientSecret": "secret" }))
        .send()
        .await
        .unwrap();
    assert_eq!(saved.status(), 200);
    let started: Value = client
        .post(format!("{}/api/google/connect", server.url))
        .header("host", "evil.example")
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();

    let auth_url = reqwest::Url::parse(started["authUrl"].as_str().unwrap()).unwrap();
    let redirect = auth_url.query_pairs().find(|(key, _)| key == "redirect_uri").unwrap().1.into_owned();
    assert_eq!(redirect, format!("{}/api/google/oauth/callback", server.url));
    assert!(redirect.starts_with("http://127.0.0.1:"));
    server.close().await;
}

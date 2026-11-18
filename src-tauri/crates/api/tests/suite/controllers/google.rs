use std::sync::Arc;

use axum::http::StatusCode;
use axum::http::request::Parts;
use axum::response::{IntoResponse, Response};
use life_board_api::plugins::auth::Authenticator;
use serde_json::json;

use crate::common::google::{CLIENT_ID, CLIENT_SECRET, EMAIL, FakeGoogle, REFRESH_TOKEN, SERVER_URL, state_of};
use crate::common::{TestApp, TestResponse, assert_match};

async fn app(fake: &Arc<FakeGoogle>) -> TestApp {
    let client = fake.clone();
    TestApp::with(|options| {
        options.google_client = Some(client);
        options.server_url = Some(SERVER_URL.into());
    })
    .await
}

async fn with_credentials(fake: &Arc<FakeGoogle>) -> TestApp {
    let ctx = app(fake).await;
    let saved =
        ctx.put("/api/google/credentials", json!({ "clientId": CLIENT_ID, "clientSecret": CLIENT_SECRET })).await;
    assert_eq!(saved.status(), 200, "{}", saved.text());
    ctx
}

/// `POST /google/connect`, returning the flow's `state`.
async fn start(ctx: &TestApp) -> String {
    let started = ctx.post_empty("/api/google/connect").await;
    assert_eq!(started.status(), 200, "{}", started.text());
    state_of(started.json()["authUrl"].as_str().unwrap())
}

#[track_caller]
fn assert_page(response: &TestResponse, status: u16, text: &str) {
    assert_eq!(response.status(), status, "{}", response.text());
    assert_eq!(response.header("content-type"), Some("text/html; charset=utf-8"));
    assert_eq!(response.header("cache-control"), Some("no-store"));
    assert!(response.text().contains(text), "{}", response.text());
}

#[tokio::test]
async fn reports_the_status_without_any_secret() {
    let fake = FakeGoogle::new();
    let ctx = app(&fake).await;
    let empty = ctx.get("/api/google/status").await;
    assert_eq!(empty.status(), 200);
    assert_eq!(
        empty.json(),
        json!({ "connected": false, "email": null, "hasCredentials": false, "pending": false, "reauthRequired": false, "lastSyncAt": null, "lastSyncError": null })
    );

    let saved = ctx
        .put("/api/google/credentials", json!({ "clientId": format!(" {CLIENT_ID} "), "clientSecret": CLIENT_SECRET }))
        .await;
    assert_match(&saved.json(), &json!({ "hasCredentials": true, "connected": false }));
    assert!(!saved.text().contains(CLIENT_SECRET) && !saved.text().contains(CLIENT_ID));
}

#[tokio::test]
async fn validates_the_credentials() {
    let ctx = app(&FakeGoogle::new()).await;
    for body in [
        json!({}),
        json!({ "clientId": "1234.example.com", "clientSecret": CLIENT_SECRET }),
        json!({ "clientId": ".apps.googleusercontent.com", "clientSecret": CLIENT_SECRET }),
        json!({ "clientId": CLIENT_ID, "clientSecret": "   " }),
    ] {
        let response = ctx.put("/api/google/credentials", body.clone()).await;
        assert_eq!(response.status(), 400, "{body}");
        assert_eq!(response.json()["error"], "validation_error");
        assert!(!response.text().contains(CLIENT_SECRET));
    }
}

#[tokio::test]
async fn connects_through_the_callback_and_disconnects() {
    let fake = FakeGoogle::new();
    let ctx = with_credentials(&fake).await;
    let state = start(&ctx).await;
    assert_eq!(ctx.get("/api/google/status").await.json()["pending"], true);

    let page = ctx.get(&format!("/api/google/oauth/callback?code=4%2Fcode&state={state}&scope=x")).await;
    assert_page(&page, 200, "Conectado. Você pode voltar ao Life Board.");
    assert!(page.text().contains("Connected. You can go back to Life Board."));
    let status = ctx.get("/api/google/status").await.json();
    assert_match(&status, &json!({ "connected": true, "email": EMAIL, "pending": false }));
    assert!(!status.to_string().contains(REFRESH_TOKEN));

    let late = ctx.get(&format!("/api/google/oauth/callback?code=again&state={state}")).await;
    assert_page(&late, 400, "no_pending_flow");

    assert_error_code(&ctx.delete("/api/google/disconnect").await, 200, None);
    assert_eq!(fake.count("revoke("), 1);
    assert_match(
        &ctx.get("/api/google/status").await.json(),
        &json!({ "connected": false, "hasCredentials": true, "email": null }),
    );
    assert_error_code(&ctx.delete("/api/google/credentials").await, 200, None);
    assert_eq!(ctx.get("/api/google/status").await.json()["hasCredentials"], false);
}

#[track_caller]
fn assert_error_code(response: &TestResponse, status: u16, code: Option<&str>) {
    assert_eq!(response.status(), status, "{}", response.text());
    match code {
        Some(code) => assert_eq!(response.json()["error"], code),
        None => assert!(response.json().get("error").is_none(), "{}", response.text()),
    }
}

#[tokio::test]
async fn answers_error_pages_for_denied_forged_and_incomplete_callbacks() {
    let fake = FakeGoogle::new();
    let ctx = with_credentials(&fake).await;
    let state = start(&ctx).await;

    let forged = ctx.get("/api/google/oauth/callback?code=x&state=forged").await;
    assert_page(&forged, 400, "invalid_state");
    let missing = ctx.get("/api/google/oauth/callback").await;
    assert_page(&missing, 400, "missing_code");
    assert!(missing.text().contains("Não foi possível conectar o Google Agenda."));
    assert_eq!(ctx.get("/api/google/status").await.json()["pending"], true);

    let injected = ctx.get("/api/google/oauth/callback?error=%3Cscript%3Ealert(1)%3C%2Fscript%3E&state=forged").await;
    assert_page(&injected, 400, "scriptalert1script");
    assert!(!injected.text().contains("<script>"));
    assert_eq!(ctx.get("/api/google/status").await.json()["pending"], true);

    let denied = ctx.get(&format!("/api/google/oauth/callback?error=access_denied&state={state}")).await;
    assert_page(&denied, 400, "access_denied");
    assert_eq!(ctx.get("/api/google/status").await.json()["pending"], false);
    assert_page(&ctx.get("/api/google/oauth/callback?error=%3C%3E").await, 400, "unknown_error");
    assert_eq!(fake.count("exchange_code("), 0);
}

#[tokio::test]
async fn cancels_a_pending_connection() {
    let ctx = with_credentials(&FakeGoogle::new()).await;
    let state = start(&ctx).await;

    assert_error_code(&ctx.delete("/api/google/connect").await, 200, None);
    assert_eq!(ctx.get("/api/google/status").await.json()["pending"], false);
    assert_page(&ctx.get(&format!("/api/google/oauth/callback?code=x&state={state}")).await, 400, "no_pending_flow");
}

#[tokio::test]
async fn needs_credentials_and_the_server_address_to_connect() {
    let fake = FakeGoogle::new();
    let ctx = app(&fake).await;
    assert_error_code(&ctx.post_empty("/api/google/connect").await, 400, Some("missing_credentials"));

    let client = fake.clone();
    let without_address = TestApp::with(|options| options.google_client = Some(client)).await;
    without_address
        .put("/api/google/credentials", json!({ "clientId": CLIENT_ID, "clientSecret": CLIENT_SECRET }))
        .await;
    assert_error_code(&without_address.post_empty("/api/google/connect").await, 500, Some("internal_error"));
}

#[tokio::test]
async fn shows_exchange_failures_on_the_page() {
    let fake = FakeGoogle::new();
    fake.on_exchange(|_| Err(life_board_api::services::google_auth_client::GoogleAuthError::Network("down".into())));
    let ctx = with_credentials(&fake).await;
    let state = start(&ctx).await;

    assert_page(&ctx.get(&format!("/api/google/oauth/callback?code=x&state={state}")).await, 502, "google_unavailable");
    assert_eq!(ctx.get("/api/google/status").await.json()["connected"], false);
}

struct RejectAll;

#[async_trait::async_trait]
impl Authenticator for RejectAll {
    async fn authenticate(&self, _parts: &Parts) -> Result<(), Response> {
        Err(StatusCode::UNAUTHORIZED.into_response())
    }
}

#[tokio::test]
async fn keeps_only_the_callback_outside_the_auth_layer() {
    let ctx = TestApp::with(|options| {
        options.google_client = Some(FakeGoogle::new());
        options.authenticator = Some(Arc::new(RejectAll));
    })
    .await;

    assert_eq!(ctx.get("/api/google/status").await.status(), 401);
    assert_eq!(ctx.post_empty("/api/google/connect").await.status(), 401);
    assert_page(&ctx.get("/api/google/oauth/callback?code=x&state=y").await, 400, "no_pending_flow");
}

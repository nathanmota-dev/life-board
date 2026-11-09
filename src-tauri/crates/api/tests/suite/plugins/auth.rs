use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};

use async_trait::async_trait;
use axum::Json;
use axum::http::StatusCode;
use axum::http::request::Parts;
use axum::response::{IntoResponse, Response};
use life_board_api::plugins::auth::Authenticator;
use serde_json::json;

use crate::common::TestApp;

/// `vi.fn(async (_request, reply) => reply.code(401).send({ error: "unauthorized" }))`.
#[derive(Default)]
struct RejectAll {
    calls: AtomicUsize,
}

#[async_trait]
impl Authenticator for RejectAll {
    async fn authenticate(&self, _parts: &Parts) -> Result<(), Response> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        Err((StatusCode::UNAUTHORIZED, Json(json!({ "error": "unauthorized" }))).into_response())
    }
}

#[tokio::test]
async fn lets_every_request_through_while_there_is_no_auth() {
    let ctx = TestApp::new().await;

    assert_eq!(ctx.get("/api/tasks").await.status(), 200);
}

#[tokio::test]
async fn guards_every_domain_route_but_leaves_health_public() {
    let authenticate = Arc::new(RejectAll::default());
    let shared = Arc::clone(&authenticate);
    let ctx = TestApp::with(|options| options.authenticator = Some(shared)).await;

    for url in [
        "/api/tasks",
        "/api/thoughts",
        "/api/goals",
        "/api/habits",
        "/api/mood/today",
        "/api/github/status",
        "/api/file-boards",
        "/api/stats/this-week",
        "/api/calendar/events",
    ] {
        assert_eq!(ctx.get(url).await.status(), 401, "{url}");
    }
    assert_eq!(ctx.get("/api/health").await.status(), 200);
    assert_eq!(authenticate.calls.load(Ordering::SeqCst), 9);
}

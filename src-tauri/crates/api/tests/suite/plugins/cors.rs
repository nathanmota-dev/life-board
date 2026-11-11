use axum::body::Body;
use axum::http::{Method, Request};
use life_board_api::plugins::cors::ALLOWED_ORIGINS;

use crate::common::{TestApp, TestResponse};

async fn preflight(ctx: &TestApp, origin: &str) -> TestResponse {
    let request = Request::builder()
        .method(Method::OPTIONS)
        .uri("/api/tasks/t1")
        .header("origin", origin)
        .header("access-control-request-method", "PATCH")
        .header("access-control-request-headers", "content-type")
        .body(Body::empty())
        .expect("request");
    ctx.send(request).await
}

#[tokio::test]
async fn allows_a_preflight_from_the_tauri_app() {
    let ctx = TestApp::new().await;
    let response = preflight(&ctx, "tauri://localhost").await;

    assert_eq!(response.status(), 204);
    assert_eq!(response.header("access-control-allow-origin"), Some("tauri://localhost"));
    assert_eq!(response.header("access-control-allow-credentials"), Some("true"));
    assert!(response.header("access-control-allow-methods").unwrap_or_default().contains("PATCH"));
}

#[tokio::test]
async fn still_allows_the_electron_origins() {
    let ctx = TestApp::new().await;

    for origin in ["http://127.0.0.1:5180", "http://localhost:5180", "null"] {
        assert!(ALLOWED_ORIGINS.contains(&origin), "{origin}");
        let response = preflight(&ctx, origin).await;
        assert_eq!(response.status(), 204, "{origin}");
        assert_eq!(response.header("access-control-allow-origin"), Some(origin), "{origin}");
    }
}

#[tokio::test]
async fn refuses_unknown_origins() {
    let ctx = TestApp::new().await;

    for origin in ["https://evil.example", "tauri://evil.example", "http://tauri.localhost", "tauri://localhost:1"] {
        let response = preflight(&ctx, origin).await;
        assert_eq!(response.header("access-control-allow-origin"), None, "{origin}");
    }
}

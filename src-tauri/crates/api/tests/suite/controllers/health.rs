use axum::body::Body;
use axum::http::{Method, Request};
use serde_json::json;

use crate::common::{TestApp, assert_match};

fn request(method: Method, uri: &str, headers: &[(&str, &str)]) -> Request<Body> {
    let builder = headers
        .iter()
        .fold(Request::builder().method(method).uri(uri), |builder, (name, value)| builder.header(*name, *value));
    builder.body(Body::empty()).expect("request")
}

#[tokio::test]
#[ignore = "pending #51"]
async fn reports_the_service_as_up() {
    let ctx = TestApp::new().await;
    let response = ctx.get("/api/health").await;

    assert_eq!(response.status(), 200);
    assert_match(&response.json(), &json!({ "ok": true, "service": "life-board-api" }));
}

#[tokio::test]
#[ignore = "pending #51"]
async fn allows_the_renderer_origins_through_cors() {
    let ctx = TestApp::new().await;
    let dev = ctx.send(request(Method::GET, "/api/health", &[("origin", "http://127.0.0.1:5180")])).await;
    let other = ctx.send(request(Method::GET, "/api/health", &[("origin", "https://evil.example")])).await;

    assert_eq!(dev.header("access-control-allow-origin"), Some("http://127.0.0.1:5180"));
    assert_eq!(other.header("access-control-allow-origin"), None);
}

#[tokio::test]
#[ignore = "pending #51"]
async fn lets_the_renderer_edit_and_delete_through_the_cors_preflight() {
    let ctx = TestApp::new().await;
    let response = ctx
        .send(request(
            Method::OPTIONS,
            "/api/tasks/t1",
            &[("origin", "http://127.0.0.1:5180"), ("access-control-request-method", "PATCH")],
        ))
        .await;

    assert_eq!(response.status(), 204);
    let methods: Vec<String> = response
        .header("access-control-allow-methods")
        .unwrap_or_default()
        .split(',')
        .map(|method| method.trim().to_owned())
        .collect();
    for method in ["PUT", "PATCH", "DELETE"] {
        assert!(methods.iter().any(|allowed| allowed == method), "{methods:?}");
    }
}

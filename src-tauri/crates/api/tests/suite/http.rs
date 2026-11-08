//! Rust-only: the request and routing edges that Fastify handled for the Node
//! API (body parsing, query coercion, unknown routes, HEAD), so the Rust
//! router answers them with the same status and `error` code.

use axum::body::Body;
use axum::http::{Method, Request};
use serde_json::json;

use crate::common::{TestApp, pluck};

fn raw(method: Method, uri: &str, content_type: Option<&str>, body: impl Into<Body>) -> Request<Body> {
    let builder = Request::builder().method(method).uri(uri);
    let builder = match content_type {
        Some(content_type) => builder.header("content-type", content_type),
        None => builder,
    };
    builder.body(body.into()).unwrap()
}

#[tokio::test]
async fn rejects_unreadable_json_bodies_with_fastify_codes() {
    let ctx = TestApp::new().await;
    let cases = [
        (Some("application/json"), "", 400, "FST_ERR_CTP_EMPTY_JSON_BODY"),
        (Some("application/json"), "{", 400, "FST_ERR_CTP_INVALID_JSON_BODY"),
        (Some("application/json; charset=utf-8"), "{", 400, "FST_ERR_CTP_INVALID_JSON_BODY"),
        (Some("text/plain"), "title", 415, "FST_ERR_CTP_INVALID_MEDIA_TYPE"),
        // Without a body there is nothing to parse: it fails the schema like `undefined`.
        (None, "", 400, "validation_error"),
    ];
    for (content_type, body, status, code) in cases {
        let response = ctx.send(raw(Method::POST, "/api/tasks", content_type, body)).await;
        assert_eq!(
            (response.status(), response.json()["error"].clone()),
            (status, json!(code)),
            "{content_type:?} {body:?}"
        );
    }

    let large = format!("{{\"title\":\"{}\"}}", "x".repeat(1024 * 1024));
    let response = ctx.send(raw(Method::POST, "/api/tasks", Some("application/json"), large)).await;
    assert_eq!((response.status(), response.json()["error"].clone()), (413, json!("FST_ERR_CTP_BODY_TOO_LARGE")));
}

#[tokio::test]
async fn reports_validation_issues_as_json_pointers() {
    let ctx = TestApp::new().await;

    let body = ctx.post("/api/tasks", json!({ "title": "", "tags": ["ok", 3] })).await;
    assert_eq!(body.status(), 400);
    assert_eq!(body.json()["error"], "validation_error");
    assert_eq!(pluck(&body.json()["issues"], "path"), [json!("/title"), json!("/tags/1")]);

    let reorder = ctx.patch("/api/tasks/order", json!([{ "id": "a", "order": 1.5, "pinned": true }])).await;
    assert_eq!(pluck(&reorder.json()["issues"], "path"), [json!("/0/order")]);

    let query = ctx.get("/api/tasks?limit=1000").await;
    assert_eq!((query.status(), pluck(&query.json()["issues"], "path")), (400, vec![json!("/limit")]));
    let repeated = ctx.get("/api/tasks?search=a&search=b").await;
    assert_eq!((repeated.status(), pluck(&repeated.json()["issues"], "path")), (400, vec![json!("/search")]));
}

#[tokio::test]
async fn answers_unknown_routes_and_methods_like_fastify() {
    let ctx = TestApp::new().await;

    let unknown = ctx.get("/api/nope?x=1").await;
    assert_eq!(unknown.status(), 404);
    assert_eq!(
        unknown.json(),
        json!({ "message": "Route GET:/api/nope?x=1 not found", "error": "Not Found", "statusCode": 404 })
    );
    let wrong_method = ctx.request(Method::PUT, "/api/tasks", None).await;
    assert_eq!((wrong_method.status(), wrong_method.json()["error"].clone()), (404, json!("Not Found")));
}

#[tokio::test]
async fn answers_head_on_every_get_route() {
    let ctx = TestApp::new().await;
    for uri in ["/api/health", "/api/tasks", "/api/thoughts", "/api/habits/logs"] {
        let response = ctx.send(raw(Method::HEAD, uri, None, Body::empty())).await;
        assert_eq!(response.status(), 200, "{uri}");
        assert!(response.body.is_empty(), "{uri}");
    }
}

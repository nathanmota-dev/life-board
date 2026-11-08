//! Rust-only: the request and routing edges that Fastify handled for the Node
//! API (body parsing, query coercion, unknown routes, HEAD), so the Rust
//! router answers them with the same status and `error` code.

use axum::body::Body;
use axum::http::{Method, Request};
use life_board_api::dto::file_boards::MAX_UPLOAD_BYTES;
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
        (Some("text/plain"), "title", 400, "validation_error"),
        (Some("application/x-foo"), "title", 415, "FST_ERR_CTP_INVALID_MEDIA_TYPE"),
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

const BOUNDARY: &str = "life-board-boundary";

fn field_part(name: &str, value: &str) -> String {
    format!("--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n")
}

fn file_part(name: &str, filename: &str, mime: &str, content: &str) -> String {
    format!(
        "--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{filename}\"\r\nContent-Type: {mime}\r\n\r\n{content}\r\n"
    )
}

async fn upload_board(ctx: &TestApp) -> String {
    ctx.post("/api/file-boards", json!({ "name": "Uploads" })).await.json()["id"].as_str().unwrap().to_owned()
}

/// Sends `parts` plus the closing boundary to the board's upload route.
async fn upload(ctx: &TestApp, board: &str, parts: &[String]) -> crate::common::TestResponse {
    let body = format!("{}--{BOUNDARY}--\r\n", parts.concat());
    ctx.send(raw(
        Method::POST,
        &format!("/api/file-boards/{board}/items"),
        Some(&format!("multipart/form-data; boundary={BOUNDARY}")),
        body,
    ))
    .await
}

#[tokio::test]
async fn limits_uploads_like_fastify_multipart() {
    let ctx = TestApp::new().await;
    let board = upload_board(&ctx).await;
    let content = "a".repeat(MAX_UPLOAD_BYTES);

    let exact = upload(&ctx, &board, &[file_part("file", "a.bin", "application/x-a", &content)]).await;
    assert_eq!((exact.status(), &exact.json()["sizeBytes"]), (201, &json!(MAX_UPLOAD_BYTES)));

    let over = upload(&ctx, &board, &[file_part("file", "a.bin", "application/x-a", &format!("{content}a"))]).await;
    assert_eq!((over.status(), over.json()["error"].clone()), (413, json!("FST_REQ_FILE_TOO_LARGE")));
    // The 21st MiB fits past the 2 MiB default of axum's extractor, and an unknown board is only checked after the size.
    let unknown = upload(&ctx, "missing", &[file_part("file", "a.bin", "x/y", &format!("{content}a"))]).await;
    assert_eq!(unknown.status(), 413);

    let many: Vec<String> = (0..1001).map(|index| field_part(&format!("f{index}"), "1")).collect();
    let too_many = upload(&ctx, &board, &many).await;
    assert_eq!((too_many.status(), too_many.json()["error"].clone()), (413, json!("FST_PARTS_LIMIT")));
}

#[tokio::test]
async fn reads_multipart_forms_like_fastify_multipart() {
    let ctx = TestApp::new().await;
    let board = upload_board(&ctx).await;
    let png = || file_part("file", "a.png", "image/png", "1");

    let after = upload(&ctx, &board, &[png(), field_part("title", "After")]).await.json();
    assert_eq!(after["title"], "After");
    let any_name = upload(&ctx, &board, &[file_part("photo", "a.png", "IMAGE/PNG; q=1", "1")]).await.json();
    assert_eq!((&any_name["mime"], &any_name["kind"]), (&json!("image/png"), &json!("image")));

    let no_type = format!("--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a\"\r\n\r\nx\r\n");
    assert_eq!(upload(&ctx, &board, &[no_type]).await.json()["mime"], "text/plain");

    let two = upload(&ctx, &board, &[png(), file_part("second", "b.png", "image/png", "22")]).await.json();
    assert_eq!(two["sizeBytes"], 1);
    let repeated = upload(&ctx, &board, &[field_part("title", "A"), field_part("title", "B"), png()]).await.json();
    assert_eq!(repeated["title"], json!(null));
    let shadowed = upload(&ctx, &board, &[field_part("file", "A"), png()]).await;
    assert_eq!(shadowed.status(), 201);

    let bad_field = upload(&ctx, &board, &[field_part("kind", "spaceship"), png()]).await.json();
    assert_eq!(bad_field["error"], "validation_error");
    assert!(bad_field.get("issues").is_none(), "{bad_field}");

    let prototype = upload(&ctx, &board, &[field_part("constructor", "x")]).await;
    assert_eq!((prototype.status(), prototype.json()["error"].clone()), (400, json!("FST_PROTO_VIOLATION")));
    assert_eq!(upload(&ctx, &board, &[field_part("toString", "x"), png()]).await.status(), 201);

    let json_part = |value: &str| {
        format!(
            "--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"amountCents\"\r\nContent-Type: application/json\r\n\r\n{value}\r\n"
        )
    };
    assert_eq!(upload(&ctx, &board, &[json_part("12"), png()]).await.json()["amountCents"], 12);
    assert_eq!(upload(&ctx, &board, &[json_part("{")]).await.json()["error"], "FST_INVALID_JSON_FIELD_ERROR");

    let huge = field_part("other", &"a".repeat(1024 * 1024 + 5));
    assert_eq!(upload(&ctx, &board, &[huge, png()]).await.status(), 201);
    let skipped =
        format!("--{BOUNDARY}\r\nContent-Disposition: attachment; name=\"file\"; filename=\"a\"\r\n\r\nx\r\n");
    assert_eq!(upload(&ctx, &board, &[skipped]).await.json()["error"], "missing_file");
    let nameless = format!(
        "--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"file\"\r\nContent-Type: application/octet-stream\r\n\r\nx\r\n"
    );
    assert_eq!(upload(&ctx, &board, &[nameless]).await.status(), 500);
}

#[tokio::test]
async fn answers_uploads_that_are_not_valid_forms_like_fastify() {
    let ctx = TestApp::new().await;
    let board = upload_board(&ctx).await;
    let uri = format!("/api/file-boards/{board}/items");
    let form = format!("multipart/form-data; boundary={BOUNDARY}");
    let cases: [(Option<&str>, &str, u16, &str); 10] = [
        (Some(&form), "", 400, "missing_file"),
        (Some(&form), "garbage", 500, "internal_error"),
        (Some("multipart/form-data"), "x", 500, "internal_error"),
        (Some("application/json"), "{}", 400, "missing_file"),
        (Some("application/json"), "", 400, "FST_ERR_CTP_EMPTY_JSON_BODY"),
        (Some("application/json"), "{", 400, "FST_ERR_CTP_INVALID_JSON_BODY"),
        (Some("text/plain"), "x", 400, "missing_file"),
        (Some("application/x-foo"), "x", 415, "FST_ERR_CTP_INVALID_MEDIA_TYPE"),
        (Some("application/x-www-form-urlencoded"), "a=1", 415, "FST_ERR_CTP_INVALID_MEDIA_TYPE"),
        (None, "", 400, "missing_file"),
    ];
    for (content_type, body, status, code) in cases {
        let response = ctx.send(raw(Method::POST, &uri, content_type, body.to_owned())).await;
        assert_eq!(
            (response.status(), response.json()["error"].clone()),
            (status, json!(code)),
            "{content_type:?} {body:?}"
        );
    }

    // A file already received is kept even when the form never closes.
    let open = format!(
        "{}--{BOUNDARY}\r\nContent-Disposition: form-data; name=\"x\"",
        file_part("file", "a.txt", "text/plain", "1")
    );
    assert_eq!(ctx.send(raw(Method::POST, &uri, Some(&form), open)).await.status(), 201);
}

#[tokio::test]
async fn serves_downloads_with_the_node_headers() {
    let ctx = TestApp::new().await;
    let board = upload_board(&ctx).await;
    let item = upload(&ctx, &board, &[file_part("file", "a.txt", "text/plain", "hello")]).await.json();
    let uri = format!("/api/file-items/{}/file", item["id"].as_str().unwrap());

    let download = ctx.get(&uri).await;
    assert_eq!(download.text(), "hello");
    assert_eq!(download.header("content-type"), Some("text/plain"));
    assert_eq!(download.header("content-length"), Some("5"));
    assert_eq!(download.header("cache-control"), Some("private, max-age=3600"));

    std::fs::remove_file(ctx.data_dir.join("uploads").join(item["storagePath"].as_str().unwrap())).unwrap();
    let gone = ctx.get(&uri).await;
    assert_eq!((gone.status(), gone.json()["error"].clone()), (500, json!("internal_error")));
}

#[tokio::test]
async fn moves_uploads_to_a_folder_with_spaces_and_non_ascii_and_back() {
    let ctx = TestApp::new().await;
    let board = upload_board(&ctx).await;
    let item = upload(&ctx, &board, &[file_part("file", "a.txt", "text/plain", "old")]).await.json();
    let stored = item["storagePath"].as_str().unwrap().to_owned();
    let default_root = ctx.data_dir.join("uploads");
    let picked = ctx.data_dir.join("Minha pasta ção");
    std::fs::create_dir(&picked).unwrap();
    let root = picked.join("life-board-app").join("uploads");

    let changed = ctx.put("/api/settings/files", json!({ "baseDir": picked.to_string_lossy() })).await;
    assert_eq!(changed.json()["uploadsDir"], root.to_string_lossy().as_ref());
    assert_eq!(std::fs::read_to_string(root.join(&stored)).unwrap(), "old");
    assert!(!default_root.join(&stored).exists());

    let next = upload(&ctx, &board, &[file_part("file", "b.txt", "text/plain", "new")]).await.json();
    assert_eq!(std::fs::read_to_string(root.join(next["storagePath"].as_str().unwrap())).unwrap(), "new");

    let back = ctx.put("/api/settings/files", json!({ "baseDir": null })).await;
    assert_eq!(back.json()["uploadsDir"], default_root.to_string_lossy().as_ref());
    assert_eq!(std::fs::read_to_string(default_root.join(&stored)).unwrap(), "old");
    assert!(!root.join(&stored).exists());
}

use serde_json::json;

use crate::common::{TestApp, assert_match, text};

#[tokio::test]
async fn runs_the_crud_flow() {
    let ctx = TestApp::new().await;
    let created = ctx.post("/api/thoughts", json!({ "body": "Idea", "tags": ["app"] })).await;
    assert_eq!(created.status(), 201);
    let id = text(&created.json(), "id");

    let list = ctx.get("/api/thoughts?pinned=false&tag=app").await.json();
    assert_eq!(list.as_object().map(|body| body.len()), Some(2));
    assert_match(&list, &json!({ "items": [{ "id": id }], "nextCursor": null }));

    assert_eq!(ctx.get(&format!("/api/thoughts/{id}")).await.json()["body"], "Idea");
    assert_eq!(ctx.patch(&format!("/api/thoughts/{id}"), json!({ "pinned": true })).await.json()["pinned"], true);
    assert_eq!(ctx.delete(&format!("/api/thoughts/{id}")).await.json(), json!({ "ok": true }));
    assert_eq!(ctx.delete(&format!("/api/thoughts/{id}")).await.status(), 404);
}

#[tokio::test]
async fn rejects_malformed_cursors_and_booleans() {
    let ctx = TestApp::new().await;
    assert_eq!(ctx.get("/api/thoughts?cursor=abc").await.status(), 400);
    assert_eq!(ctx.get("/api/thoughts?pinned=maybe").await.status(), 400);
}

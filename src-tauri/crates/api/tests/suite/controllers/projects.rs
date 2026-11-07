use serde_json::{Value, json};

use crate::common::{ANY_STRING, TestApp, assert_match, pluck, text};

async fn create(ctx: &TestApp, payload: Value) -> Value {
    ctx.post("/api/projects", payload).await.json()
}

#[tokio::test]
#[ignore = "pending #52"]
async fn runs_the_crud_flow() {
    let ctx = TestApp::new().await;
    let created = ctx.post("/api/projects", json!({ "title": "Side project" })).await;
    assert_eq!(created.status(), 201);
    let id = text(&created.json(), "id");

    let list = ctx.get("/api/projects").await.json();
    assert_eq!(list.as_object().map(|body| body.len()), Some(1));
    assert_match(&list, &json!({ "items": [{ "id": id }] }));
    assert_eq!(ctx.get(&format!("/api/projects/{id}")).await.json()["title"], "Side project");
    assert_eq!(ctx.patch(&format!("/api/projects/{id}"), json!({ "status": "done" })).await.json()["status"], "done");
    let history = ctx.get(&format!("/api/projects/{id}/history")).await.json();
    assert_eq!(pluck(&history["items"], "status"), vec![json!("done"), json!("idea")]);
    assert_eq!(ctx.delete(&format!("/api/projects/{id}")).await.json(), json!({ "ok": true }));
    assert_eq!(ctx.delete(&format!("/api/projects/{id}")).await.status(), 404);
    assert_eq!(ctx.post_empty(&format!("/api/projects/{id}/restore")).await.json()["id"], json!(id));
}

#[tokio::test]
#[ignore = "pending #52"]
async fn moves_projects_between_columns() {
    let ctx = TestApp::new().await;
    let a = create(&ctx, json!({ "title": "A" })).await;
    let b = create(&ctx, json!({ "title": "B", "status": "paused" })).await;
    let (a_id, b_id) = (text(&a, "id"), text(&b, "id"));

    let moved = ctx
        .patch(&format!("/api/projects/{a_id}/move"), json!({ "status": "paused", "order": 1, "pauseReason": "Later" }))
        .await
        .json();
    let columns: Vec<(Value, Value)> =
        moved["items"].as_array().unwrap().iter().map(|p| (p["title"].clone(), p["order"].clone())).collect();
    assert_eq!(columns, vec![(json!("B"), json!(0)), (json!("A"), json!(1))]);
    assert_match(
        &ctx.get(&format!("/api/projects/{a_id}")).await.json(),
        &json!({ "status": "paused", "pauseReason": "Later" }),
    );
    assert_eq!(
        ctx.patch(&format!("/api/projects/{b_id}/move"), json!({ "status": "paused", "order": -1 })).await.status(),
        400
    );
    assert_eq!(ctx.patch("/api/projects/missing/move", json!({ "status": "idea", "order": 0 })).await.status(), 404);
}

#[tokio::test]
#[ignore = "pending #52"]
async fn archives_lists_archived_projects_and_restores_them() {
    let ctx = TestApp::new().await;
    let idea = text(&create(&ctx, json!({ "title": "Idea" })).await, "id");
    let done = text(&create(&ctx, json!({ "title": "Done", "status": "done" })).await, "id");

    assert_eq!(ctx.post_empty(&format!("/api/projects/{idea}/archive")).await.status(), 400);
    assert_match(
        &ctx.post_empty(&format!("/api/projects/{done}/archive")).await.json(),
        &json!({ "archivedAt": ANY_STRING }),
    );
    assert_eq!(pluck(&ctx.get("/api/projects").await.json()["items"], "id"), vec![json!(idea)]);
    assert_eq!(pluck(&ctx.get("/api/projects?archived=true").await.json()["items"], "id"), vec![json!(done)]);
    assert_match(
        &ctx.post_empty(&format!("/api/projects/{done}/restore")).await.json(),
        &json!({ "status": "done", "archivedAt": null }),
    );
    assert_eq!(ctx.post_empty(&format!("/api/projects/{done}/restore")).await.status(), 404);
}

#[tokio::test]
#[ignore = "pending #52"]
async fn validates_the_input() {
    let ctx = TestApp::new().await;
    assert_eq!(ctx.post("/api/projects", json!({})).await.status(), 400);
    assert_eq!(ctx.post("/api/projects", json!({ "title": "X", "status": "maybe" })).await.status(), 400);
    assert_eq!(ctx.get("/api/projects?archived=maybe").await.status(), 400);
}

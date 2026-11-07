use axum::http::Method;
use chrono::Utc;
use life_board_api::db::columns::to_iso;
use serde_json::{Value, json};

use crate::common::{ANY_STRING, TestApp, assert_match, len, pluck, text};

async fn titles(ctx: &TestApp, query: &str) -> Vec<Value> {
    pluck(&ctx.get(&format!("/api/tasks?{query}")).await.json()["items"], "title")
}

#[tokio::test]
#[ignore = "pending #51"]
async fn runs_the_crud_flow() {
    let ctx = TestApp::new().await;
    let created = ctx.post("/api/tasks", json!({ "title": "Pay bills", "dueAt": "2026-10-20" })).await;
    assert_eq!(created.status(), 201);
    let id = text(&created.json(), "id");

    let list = ctx.get("/api/tasks?status=inbox&limit=10").await;
    assert_eq!(len(&list.json()["items"]), 1);

    assert_eq!(ctx.get(&format!("/api/tasks/{id}")).await.json()["title"], "Pay bills");

    let updated = ctx.patch(&format!("/api/tasks/{id}"), json!({ "status": "done" })).await;
    assert_match(&updated.json(), &json!({ "completedAt": ANY_STRING }));

    assert_eq!(ctx.delete(&format!("/api/tasks/{id}")).await.json(), json!({ "ok": true }));
    assert_eq!(ctx.get(&format!("/api/tasks/{id}")).await.status(), 404);
}

#[tokio::test]
#[ignore = "pending #51"]
async fn validates_bodies_and_queries() {
    let ctx = TestApp::new().await;
    let missing_title = ctx.post("/api/tasks", json!({})).await;
    assert_eq!(missing_title.status(), 400);
    let body = missing_title.json();
    assert_eq!(body["error"], "validation_error");
    assert!(body["issues"].as_array().unwrap().iter().any(|issue| issue["path"] == "/title"), "{body}");

    assert_eq!(ctx.post("/api/tasks", json!({ "title": "x", "status": "nope" })).await.status(), 400);
    assert_eq!(ctx.get("/api/tasks?limit=1000").await.status(), 400);
}

#[tokio::test]
#[ignore = "pending #51"]
async fn serves_the_board_checklist_items_filters_reorder_archive_and_restore() {
    let ctx = TestApp::new().await;
    let created = ctx
        .post("/api/tasks", json!({ "title": "Trip", "pinned": true, "color": "blue", "items": ["Passport", " "] }))
        .await;
    assert_eq!(created.status(), 400);

    let trip = ctx
        .post("/api/tasks", json!({ "title": "Trip", "pinned": true, "color": "blue", "items": ["Passport"] }))
        .await
        .json();
    assert_match(&trip, &json!({ "pinned": true, "color": "blue", "children": [{ "title": "Passport" }] }));
    let plain = ctx.post("/api/tasks", json!({ "title": "Plain" })).await.json();
    let (trip_id, plain_id) = (text(&trip, "id"), text(&plain, "id"));

    let board = ctx.get("/api/tasks?include=children&limit=500").await.json();
    let cards: Vec<(Value, usize)> =
        board["items"].as_array().unwrap().iter().map(|task| (task["title"].clone(), len(&task["children"]))).collect();
    assert_eq!(cards, vec![(json!("Plain"), 0), (json!("Trip"), 1)]);
    assert_eq!(titles(&ctx, "pinned=true").await, vec![json!("Trip")]);
    assert_eq!(titles(&ctx, "pinned=false").await, vec![json!("Plain")]);
    assert_eq!(titles(&ctx, "color=blue").await, vec![json!("Trip")]);

    let reorder = ctx
        .patch(
            "/api/tasks/order",
            json!([{ "id": trip_id, "order": 1, "pinned": false }, { "id": plain_id, "order": 0, "pinned": true }]),
        )
        .await;
    assert_eq!(reorder.json(), json!({ "ok": true }));
    assert_eq!(titles(&ctx, "pinned=true").await, vec![json!("Plain")]);

    ctx.patch(&format!("/api/tasks/{trip_id}"), json!({ "archivedAt": to_iso(Utc::now()) })).await;
    assert_eq!(titles(&ctx, "archived=true").await, vec![json!("Trip")]);
    assert_eq!(titles(&ctx, "include=children").await, vec![json!("Plain")]);

    ctx.delete(&format!("/api/tasks/{plain_id}")).await;
    let restored = ctx.post_empty(&format!("/api/tasks/{plain_id}/restore")).await;
    assert_match(&restored.json(), &json!({ "id": plain_id, "deletedAt": null }));
}

#[tokio::test]
#[ignore = "pending #51"]
async fn rejects_invalid_board_requests() {
    let ctx = TestApp::new().await;
    let status_of = |method: Method, url: &'static str, payload: Option<Value>| {
        let ctx = &ctx;
        async move { ctx.request(method, url, payload).await.status() }
    };
    assert_eq!(status_of(Method::GET, "/api/tasks?pinned=yes", None).await, 400);
    assert_eq!(status_of(Method::GET, "/api/tasks?color=neon", None).await, 400);
    assert_eq!(status_of(Method::GET, "/api/tasks?include=everything", None).await, 400);
    assert_eq!(status_of(Method::PATCH, "/api/tasks/order", Some(json!([]))).await, 400);
    assert_eq!(
        status_of(Method::PATCH, "/api/tasks/order", Some(json!([{ "id": "missing", "order": 0, "pinned": false }])))
            .await,
        400
    );
    assert_eq!(ctx.post_empty("/api/tasks/missing/restore").await.status(), 404);
}

#[tokio::test]
#[ignore = "pending #51"]
async fn picks_focus_tasks_per_day_and_refuses_a_fourth_one() {
    let ctx = TestApp::new().await;
    let mut ids = Vec::new();
    for title in ["One", "Two", "Three", "Four"] {
        ids.push(text(&ctx.post("/api/tasks", json!({ "title": title })).await.json(), "id"));
    }
    let focus = |id: String, focus_day: Value| {
        let ctx = &ctx;
        async move { ctx.patch(&format!("/api/tasks/{id}"), json!({ "focusDay": focus_day })).await }
    };

    for id in &ids[..3] {
        assert_eq!(focus(id.clone(), json!("2026-10-19")).await.json()["focusDay"], "2026-10-19");
    }
    let refused = focus(ids[3].clone(), json!("2026-10-19")).await;
    assert_eq!(refused.status(), 400);
    assert_match(&refused.json(), &json!({ "error": "focus_limit" }));

    let created = ctx.post("/api/tasks", json!({ "title": "Five", "focusDay": "2026-10-19" })).await;
    assert_eq!(created.status(), 400);
    assert_eq!(created.json()["error"], "focus_limit");

    ctx.patch(&format!("/api/tasks/{}", ids[0]), json!({ "status": "done" })).await;
    let mut day = titles(&ctx, "focusDay=2026-10-19").await;
    day.sort_by_key(|title| title.to_string());
    assert_eq!(day, vec![json!("One"), json!("Three"), json!("Two")]);

    assert_eq!(focus(ids[1].clone(), json!(null)).await.json()["focusDay"], json!(null));
    assert_eq!(focus(ids[3].clone(), json!("2026-10-19")).await.status(), 200);
}

#[tokio::test]
#[ignore = "pending #51"]
async fn validates_the_focus_day_format() {
    let ctx = TestApp::new().await;
    assert_eq!(ctx.get("/api/tasks?focusDay=today").await.status(), 400);
    let response = ctx.post("/api/tasks", json!({ "title": "x", "focusDay": "19/10/2026" })).await;
    assert_eq!(response.status(), 400);
    let body = response.json();
    assert_eq!(body["error"], "validation_error");
    assert!(body["issues"].as_array().unwrap().iter().any(|issue| issue["path"] == "/focusDay"), "{body}");
}

#[tokio::test]
#[ignore = "pending #51"]
async fn returns_404_for_unknown_tasks() {
    let ctx = TestApp::new().await;
    let response = ctx.patch("/api/tasks/missing", json!({ "title": "x" })).await;
    assert_eq!(response.status(), 404);
    assert_eq!(response.json(), json!({ "error": "not_found", "message": "Task not found." }));
}

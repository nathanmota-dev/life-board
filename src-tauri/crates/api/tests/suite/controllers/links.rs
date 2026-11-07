use serde_json::json;

use crate::common::{TestApp, assert_match, text};

#[tokio::test]
#[ignore = "pending #51"]
async fn resolves_links_and_lists_backlinks() {
    let ctx = TestApp::new().await;
    let thought = ctx.post("/api/thoughts", json!({ "title": "Plan" })).await.json();
    let thought_id = text(&thought, "id");
    let task = ctx.post("/api/tasks", json!({ "title": "Do it", "linkedThoughtIds": [thought_id] })).await.json();
    let task_id = text(&task, "id");

    let resolved = ctx.post("/api/links/resolve", json!({ "taskIds": [task_id] })).await;
    assert_match(&resolved.json()["links"], &json!([{ "moduleId": "tasks", "entity": { "id": task_id } }]));
    assert_eq!(resolved.json()["links"][0].as_object().map(|link| link.len()), Some(2));

    let backlinks = ctx.get(&format!("/api/links/backlinks/thought/{thought_id}")).await;
    assert_match(&backlinks.json()["backlinks"], &json!([{ "source": "tasks", "sourceId": task_id }]));
}

#[tokio::test]
#[ignore = "pending #51"]
async fn rejects_unknown_backlink_kinds() {
    let ctx = TestApp::new().await;
    assert_eq!(ctx.get("/api/links/backlinks/money/1").await.status(), 400);
}

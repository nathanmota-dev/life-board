use serde_json::json;

use crate::common::{TestApp, len, text};

#[tokio::test]
async fn creates_then_updates_the_day_s_entry() {
    let ctx = TestApp::new().await;
    assert_eq!(ctx.get("/api/mood/today").await.json()["entry"], json!(null));

    let first = ctx.post("/api/mood/entries", json!({ "score": 3 })).await;
    let second = ctx.post("/api/mood/entries", json!({ "score": 5, "note": "Great" })).await;

    assert_eq!(first.status(), 201);
    assert_eq!(second.status(), 200);
    assert_eq!(ctx.get("/api/mood/today").await.json()["entry"]["score"], 5);
    assert_eq!(len(&ctx.get("/api/mood/entries?limit=5").await.json()["items"]), 1);

    let id = text(&second.json(), "id");
    assert_eq!(ctx.delete(&format!("/api/mood/entries/{id}")).await.json(), json!({ "ok": true }));
}

#[tokio::test]
async fn validates_the_score_and_day() {
    let ctx = TestApp::new().await;
    assert_eq!(ctx.post("/api/mood/entries", json!({ "score": 6 })).await.status(), 400);
    assert_eq!(ctx.post("/api/mood/entries", json!({ "score": 3, "day": "17/10/2026" })).await.status(), 400);
}

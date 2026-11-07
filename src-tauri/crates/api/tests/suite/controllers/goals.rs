use serde_json::json;

use crate::common::{ANY_STRING, TestApp, assert_match, len, text};

#[tokio::test]
#[ignore = "pending #52"]
async fn manages_goals_and_their_milestones() {
    let ctx = TestApp::new().await;
    let created = ctx
        .post(
            "/api/goals",
            json!({ "title": "Read 12 books", "domain": "learning", "milestones": [{ "title": "First book" }] }),
        )
        .await;
    assert_eq!(created.status(), 201);
    let goal_id = text(&created.json()["goal"], "id");

    assert_eq!(len(&ctx.get("/api/goals").await.json()["items"]), 1);

    let milestone = ctx.post(&format!("/api/goals/{goal_id}/milestones"), json!({ "title": "Second" })).await;
    assert_eq!(milestone.status(), 201);
    let milestone_url = format!("/api/goals/{goal_id}/milestones/{}", text(&milestone.json(), "id"));

    let done = ctx.patch(&milestone_url, json!({ "completedAt": "2026-10-17T10:00:00Z" })).await;
    assert_eq!(done.json()["completedAt"], "2026-10-17T10:00:00.000Z");
    assert_eq!(ctx.delete(&milestone_url).await.json(), json!({ "ok": true }));

    let detail = ctx.get(&format!("/api/goals/{goal_id}")).await.json();
    assert_eq!(len(&detail["milestones"]), 1);
    assert_match(
        &detail["goal"],
        &json!({ "progressMode": "auto", "progress": 0, "breakdown": { "milestones": { "done": 0, "total": 1 } }, "risk": null }),
    );

    let updated = ctx.patch(&format!("/api/goals/{goal_id}"), json!({ "status": "completed" })).await;
    assert_match(&updated.json(), &json!({ "completedAt": ANY_STRING }));

    assert_eq!(ctx.delete(&format!("/api/goals/{goal_id}")).await.json(), json!({ "ok": true }));
    assert_eq!(ctx.get(&format!("/api/goals/{goal_id}")).await.status(), 404);
}

#[tokio::test]
#[ignore = "pending #52"]
async fn returns_the_progress_history_of_a_goal() {
    let ctx = TestApp::new().await;
    let created = ctx.post("/api/goals", json!({ "title": "Save money", "progressMode": "manual" })).await.json();
    let goal_id = text(&created["goal"], "id");
    ctx.patch(&format!("/api/goals/{goal_id}"), json!({ "progress": 25 })).await;

    let history = ctx.get(&format!("/api/goals/{goal_id}/progress?from=2026-01-01")).await;
    assert_eq!(history.status(), 200);
    assert_match(
        &history.json(),
        &json!({ "items": [{ "day": ANY_STRING, "progress": 25 }], "startingProgress": null }),
    );
    assert_eq!(history.json().as_object().map(|body| body.len()), Some(2));
    assert_eq!(ctx.get(&format!("/api/goals/{goal_id}/progress?from=yesterday")).await.status(), 400);
    assert_eq!(ctx.get("/api/goals/missing/progress").await.status(), 404);
}

#[tokio::test]
#[ignore = "pending #52"]
async fn validates_input() {
    let ctx = TestApp::new().await;
    assert_eq!(ctx.post("/api/goals", json!({ "title": "x", "color": "red" })).await.status(), 400);
    assert_eq!(ctx.patch("/api/goals/x", json!({ "progress": 101 })).await.status(), 400);
    assert_eq!(ctx.patch("/api/goals/x", json!({ "progressMode": "smart" })).await.status(), 400);
}

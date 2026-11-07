use rstest::rstest;
use serde_json::{Value, json};

use crate::common::{TestApp, assert_match, len, merge, text};

#[tokio::test]
#[ignore = "pending #51"]
async fn creates_a_habit_and_logs_progress_toward_today_s_goal() {
    let ctx = TestApp::new().await;
    let created = ctx.post("/api/habits", json!({ "name": "Water", "target": 2, "unit": "glasses" })).await;
    assert_eq!(created.status(), 201);
    let id = text(&created.json(), "id");

    ctx.post(&format!("/api/habits/{id}/logs"), json!({ "delta": 1 })).await;
    let logged = ctx.post(&format!("/api/habits/{id}/logs"), json!({ "delta": 1 })).await;
    assert_match(&logged.json(), &json!({ "habitId": id, "count": 2 }));

    let list = ctx.get("/api/habits").await;
    assert_match(&list.json()["items"], &json!([{ "id": id, "todayCount": 2, "doneToday": true, "streak": 1 }]));

    let logs = ctx.get(&format!("/api/habits/logs?habitId={id}")).await;
    assert_eq!(len(&logs.json()["items"]), 1);

    assert_eq!(ctx.patch(&format!("/api/habits/{id}"), json!({ "target": 8 })).await.json()["target"], 8);
    assert_eq!(ctx.delete(&format!("/api/habits/{id}")).await.json(), json!({ "ok": true }));
    assert_eq!(ctx.post(&format!("/api/habits/{id}/logs"), json!({ "delta": 1 })).await.status(), 404);
}

#[tokio::test]
#[ignore = "pending #51"]
async fn validates_habits_and_log_deltas() {
    let ctx = TestApp::new().await;
    assert_eq!(ctx.post("/api/habits", json!({ "name": " ", "target": 1 })).await.status(), 400);
    assert_eq!(ctx.post("/api/habits", json!({ "name": "Gym", "target": 0 })).await.status(), 400);
    assert_eq!(ctx.post("/api/habits/x/logs", json!({ "delta": 0 })).await.status(), 400);
    assert_eq!(ctx.get("/api/habits/logs?from=yesterday").await.status(), 400);
}

#[tokio::test]
#[ignore = "pending #51"]
async fn edits_the_count_of_a_past_day() {
    let ctx = TestApp::new().await;
    let id = text(&ctx.post("/api/habits", json!({ "name": "Water", "target": 8 })).await.json(), "id");
    let edited = ctx.put(&format!("/api/habits/{id}/logs/2026-10-16"), json!({ "count": 8 })).await;
    assert_eq!(edited.json(), json!({ "habitId": id, "day": "2026-10-16", "count": 8 }));
    assert_eq!(
        ctx.get(&format!("/api/habits/logs?habitId={id}")).await.json()["items"],
        json!([{ "habitId": id, "day": "2026-10-16", "count": 8, "target": 8 }])
    );

    assert_match(
        &ctx.put(&format!("/api/habits/{id}/logs/2999-01-01"), json!({ "count": 1 })).await.json(),
        &json!({ "error": "future_day" }),
    );
    assert_eq!(ctx.put(&format!("/api/habits/{id}/logs/yesterday"), json!({ "count": 1 })).await.status(), 400);
    assert_eq!(ctx.put(&format!("/api/habits/{id}/logs/2026-10-16"), json!({ "count": -1 })).await.status(), 400);
    assert_eq!(ctx.put("/api/habits/missing/logs/2026-10-16", json!({ "count": 1 })).await.status(), 404);
}

#[tokio::test]
#[ignore = "pending #51"]
async fn uses_backward_compatible_defaults_and_accepts_custom_amounts() {
    let ctx = TestApp::new().await;
    let defaults = ctx.post("/api/habits", json!({ "name": "Read", "target": 1 })).await;
    assert_match(&defaults.json(), &json!({ "step": 1, "emoji": "🌱" }));
    let custom = ctx
        .post("/api/habits", json!({ "name": "Water", "target": 3000, "step": 500, "emoji": "💧", "unit": "ml" }))
        .await;
    assert_eq!(custom.status(), 201);
    assert_match(&custom.json(), &json!({ "step": 500, "emoji": "💧", "target": 3000 }));
}

#[rstest]
#[case::step_0(json!({ "step": 0 }))]
#[case::step_negative(json!({ "step": -1 }))]
#[case::step_fraction(json!({ "step": 0.5 }))]
#[case::step_too_big(json!({ "step": 10001 }))]
#[case::emoji_blank(json!({ "emoji": " " }))]
#[case::emoji_too_long(json!({ "emoji": "x".repeat(33) }))]
#[tokio::test]
#[ignore = "pending #51"]
async fn rejects_invalid_customization(#[case] fields: Value) {
    let ctx = TestApp::new().await;
    let payload = merge(json!({ "name": "Water", "target": 3000 }), &fields);
    assert_eq!(ctx.post("/api/habits", payload).await.status(), 400);
    assert_eq!(ctx.patch("/api/habits/test", fields).await.status(), 400);
}

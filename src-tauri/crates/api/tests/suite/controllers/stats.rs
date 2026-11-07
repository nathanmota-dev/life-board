use serde_json::json;

use crate::common::{TestApp, assert_match};

#[tokio::test]
#[ignore = "pending #52"]
async fn returns_this_week_s_counters() {
    let ctx = TestApp::new().await;
    ctx.post("/api/thoughts", json!({ "body": "New" })).await;

    let response = ctx.get("/api/stats/this-week").await;

    assert_eq!(response.status(), 200);
    assert_match(&response.json(), &json!({ "thoughtsCreated": 1, "tasksCompleted": 0, "habitGoalsMet": 0 }));
}

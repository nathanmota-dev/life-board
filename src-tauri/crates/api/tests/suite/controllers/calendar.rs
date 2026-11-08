use serde_json::json;

use crate::common::{TestApp, len, text};

#[tokio::test]
async fn manages_events() {
    let ctx = TestApp::new().await;
    let created = ctx
        .post(
            "/api/calendar/events",
            json!({ "title": "Dentist", "startAt": "2026-10-20T14:00:00Z", "endAt": "2026-10-20T15:00:00Z" }),
        )
        .await;
    assert_eq!(created.status(), 201);
    let id = text(&created.json(), "id");

    let list = ctx.get("/api/calendar/events?from=2026-10-01&to=2026-10-31").await;
    assert_eq!(len(&list.json()["items"]), 1);

    let moved = ctx.patch(&format!("/api/calendar/events/{id}"), json!({ "location": "Clinic" })).await;
    assert_eq!(moved.json()["location"], "Clinic");

    assert_eq!(ctx.delete(&format!("/api/calendar/events/{id}")).await.json(), json!({ "ok": true }));
}

#[tokio::test]
async fn returns_400_when_the_event_ends_before_it_starts() {
    let ctx = TestApp::new().await;
    let response = ctx
        .post(
            "/api/calendar/events",
            json!({ "title": "Backwards", "startAt": "2026-10-20T15:00:00Z", "endAt": "2026-10-20T14:00:00Z" }),
        )
        .await;
    assert_eq!(response.status(), 400);
    assert_eq!(response.json()["error"], "invalid_range");
}

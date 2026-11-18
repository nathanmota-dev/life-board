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

#[tokio::test]
async fn exposes_the_link_fields_and_hides_the_internal_ones() {
    let ctx = TestApp::new().await;
    let created = ctx
        .post(
            "/api/calendar/events",
            json!({
                "title": "Dentist", "startAt": "2026-10-20T14:00:00Z", "endAt": "2026-10-20T15:00:00Z",
                "source": "google", "externalId": "x", "syncState": "pending_delete"
            }),
        )
        .await;
    assert_eq!(created.status(), 201);
    let id = text(&created.json(), "id");
    ctx.patch(&format!("/api/calendar/events/{id}"), json!({ "source": "google", "externalUrl": "https://x" })).await;

    let list = ctx.get("/api/calendar/events").await.json();
    let event = list["items"][0].as_object().unwrap();
    assert_eq!(event["source"], "local");
    assert_eq!(event["externalUrl"], serde_json::Value::Null);
    assert_eq!(event["recurringEventId"], serde_json::Value::Null);
    assert_eq!(event["syncState"], serde_json::Value::Null);
    for hidden in ["externalId", "externalCalendarId", "externalEtag", "externalUpdatedAt"] {
        assert!(!event.contains_key(hidden), "{hidden} must stay internal");
    }
}

#[tokio::test]
async fn keeps_google_events_read_only() {
    use life_board_api::db::schema::calendar::{EventSource, NewCalendarEvent, insert_row};

    let ctx = TestApp::new().await;
    ctx.db
        .call(|conn| {
            insert_row(
                conn,
                NewCalendarEvent {
                    id: "from-google".into(),
                    title: "Dentist".into(),
                    source: Some(EventSource::Google),
                    external_id: Some("e1".into()),
                    external_calendar_id: Some("primary".into()),
                    ..Default::default()
                },
            )
        })
        .await
        .unwrap();
    let local = text(
        &ctx.post(
            "/api/calendar/events",
            json!({ "title": "Mine", "startAt": "2026-10-20T14:00:00Z", "endAt": "2026-10-20T15:00:00Z" }),
        )
        .await
        .json(),
        "id",
    );

    for response in [
        ctx.patch("/api/calendar/events/from-google", json!({ "title": "Changed" })).await,
        ctx.delete("/api/calendar/events/from-google").await,
    ] {
        assert_eq!(response.status(), 409, "{}", response.text());
        assert_eq!(response.json()["error"], "read_only_event");
    }
    let list = ctx.get("/api/calendar/events").await.json();
    assert_eq!(len(&list["items"]), 2);
    assert!(list["items"].as_array().unwrap().iter().any(|event| event["title"] == "Dentist"));

    assert_eq!(ctx.patch(&format!("/api/calendar/events/{local}"), json!({ "title": "Edited" })).await.status(), 200);
    assert_eq!(ctx.delete(&format!("/api/calendar/events/{local}")).await.status(), 200);
    assert_eq!(ctx.patch("/api/calendar/events/missing", json!({ "title": "x" })).await.status(), 404);
}

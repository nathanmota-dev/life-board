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
async fn edits_and_deletes_events_imported_from_google() {
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

    let edited = ctx.patch("/api/calendar/events/from-google", json!({ "title": "Changed" })).await;
    assert_eq!(edited.status(), 200, "{}", edited.text());
    assert_eq!(edited.json()["title"], "Changed");
    assert_eq!(edited.json()["syncState"], "pending_update");

    assert_eq!(ctx.delete("/api/calendar/events/from-google").await.status(), 200);
    assert_eq!(len(&ctx.get("/api/calendar/events").await.json()["items"]), 0);
    assert_eq!(ctx.patch("/api/calendar/events/missing", json!({ "title": "x" })).await.status(), 404);
}

#[tokio::test]
async fn answers_without_waiting_for_google_and_sends_in_the_background() {
    use std::time::Duration;

    use crate::common::google::{CLIENT_ID, CLIENT_SECRET, FakeCalendar, FakeGoogle, SERVER_URL, Sent, state_of};

    let (auth, calendar) = (FakeGoogle::new(), FakeCalendar::new());
    let (client, api) = (auth.clone(), calendar.clone());
    let ctx = TestApp::with(|options| {
        options.google_client = Some(client);
        options.google_calendar_client = Some(api);
        options.server_url = Some(SERVER_URL.into());
    })
    .await;
    ctx.put("/api/google/credentials", json!({ "clientId": CLIENT_ID, "clientSecret": CLIENT_SECRET })).await;
    let started = ctx.post_empty("/api/google/connect").await;
    let state = state_of(started.json()["authUrl"].as_str().unwrap());
    assert_eq!(ctx.get(&format!("/api/google/oauth/callback?code=c&state={state}")).await.status(), 200);
    for _ in 0..200 {
        if ctx.get("/api/google/status").await.json()["lastSyncAt"].is_string() {
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    let worker = ctx.state.google_calendar.start_sender();

    // Google never answers until released, yet every route does.
    calendar.hold();
    let created = ctx
        .post(
            "/api/calendar/events",
            json!({ "title": "Dentist", "startAt": "2026-10-20T14:00:00Z", "endAt": "2026-10-20T15:00:00Z" }),
        )
        .await;
    assert_eq!(created.status(), 201);
    assert_eq!(created.json()["syncState"], "pending_create");
    let id = text(&created.json(), "id");
    calendar.entered().await;
    let moved = ctx.patch(&format!("/api/calendar/events/{id}"), json!({ "location": "Clinic" })).await;
    assert_eq!(moved.json()["syncState"], "pending_create");
    assert_eq!(ctx.get("/api/google/status").await.json()["pendingChanges"], 1);

    calendar.release();
    // The edit made while the insert ran goes out as a patch.
    for _ in 0..200 {
        if calendar.sent().iter().any(|sent| matches!(sent, Sent::Patch { .. })) {
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    assert!(matches!(calendar.sent()[0], Sent::Insert { .. }));

    assert_eq!(ctx.delete(&format!("/api/calendar/events/{id}")).await.status(), 200);
    for _ in 0..200 {
        if calendar.sent().iter().any(|sent| matches!(sent, Sent::Delete { .. })) {
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    assert!(calendar.sent().iter().any(|sent| matches!(sent, Sent::Delete { .. })));
    worker.stop();
}

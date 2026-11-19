//! Runs under `TZ=UTC` and `TZ=America/Sao_Paulo` (see `AGENTS.md`): the all-day
//! events and the offsets of the timed ones follow the local time zone.

use std::sync::Arc;
use std::time::Duration;

use chrono::{Local, NaiveTime, TimeDelta, TimeZone};
use life_board_api::db::Db;
use life_board_api::db::schema::calendar::{CalendarEvent, EventSource, NewCalendarEvent, SyncState, insert_row};
use life_board_api::dto::calendar::{CreateEventBody, UpdateEventBody};
use life_board_api::dto::google::SaveGoogleCredentialsBody;
use life_board_api::services::calendar::CalendarService;
use life_board_api::services::google::GoogleService;
use life_board_api::services::google_calendar::GoogleCalendarService;
use life_board_api::services::google_calendar_client::{GoogleCalendarError, GoogleEvent, GoogleEventTimeBody};
use serde_json::json;

use crate::common::google::{
    CLIENT_ID, CLIENT_SECRET, EMAIL, FakeCalendar, FakeGoogle, SERVER_URL, Sent, TestClock, calendar_service,
    google_service, state_of,
};
use crate::common::{TestDb, assert_error, test_db};

struct Ctx {
    db: TestDb,
    auth: Arc<FakeGoogle>,
    api: Arc<FakeCalendar>,
    clock: TestClock,
    google: GoogleService,
    sync: GoogleCalendarService,
    calendar: CalendarService,
}

async fn setup() -> Ctx {
    let db = test_db().await;
    let (auth, api, clock) = (FakeGoogle::new(), FakeCalendar::new(), TestClock::new());
    let google = google_service(&db.db, &auth, &clock);
    let sync = calendar_service(&db.db, &google, &api, &clock);
    let calendar = CalendarService::with_wake(db.db.clone(), sync.wake());
    Ctx { db, auth, api, clock, google, sync, calendar }
}

async fn connected() -> Ctx {
    let ctx = setup().await;
    ctx.google
        .save_credentials(SaveGoogleCredentialsBody {
            client_id: CLIENT_ID.into(),
            client_secret: CLIENT_SECRET.into(),
        })
        .await
        .unwrap();
    let state = state_of(&ctx.google.start_connect(SERVER_URL).await.unwrap().auth_url);
    assert_eq!(ctx.google.finish_connect("code", Some(&state)).await.unwrap(), EMAIL);
    ctx
}

fn new_event(ctx: &Ctx, title: &str) -> CreateEventBody {
    let now = ctx.clock.now()();
    CreateEventBody {
        title: title.into(),
        start_at: now + TimeDelta::hours(2),
        end_at: now + TimeDelta::hours(3),
        ..Default::default()
    }
}

fn rename(title: &str) -> UpdateEventBody {
    UpdateEventBody { title: Some(title.into()), ..Default::default() }
}

async fn row(db: &Db, id: &str) -> CalendarEvent {
    let id = id.to_owned();
    db.call(move |conn| conn.query_row("SELECT * FROM calendar_events WHERE id = ?", [id], CalendarEvent::from_row))
        .await
        .unwrap()
}

/// A row already linked to Google, as an import leaves it.
async fn linked(ctx: &Ctx, id: &str, title: &str) -> CalendarEvent {
    let now = ctx.clock.now()();
    let row = NewCalendarEvent {
        id: format!("row-{id}"),
        title: title.into(),
        start_at: now + TimeDelta::hours(5),
        end_at: now + TimeDelta::hours(6),
        source: Some(EventSource::Google),
        external_id: Some(id.into()),
        external_calendar_id: Some("primary".into()),
        external_etag: Some("\"v1\"".into()),
        ..Default::default()
    };
    ctx.db.db.call(move |conn| insert_row(conn, row)).await.unwrap()
}

fn patches(ctx: &Ctx) -> Vec<Sent> {
    ctx.api.sent().into_iter().filter(|sent| matches!(sent, Sent::Patch { .. })).collect()
}

fn count(ctx: &Ctx, matching: impl Fn(&Sent) -> bool) -> usize {
    ctx.api.sent().iter().filter(|sent| matching(sent)).count()
}

fn status_error(error: &str) -> GoogleCalendarError {
    GoogleCalendarError::Http { status: error.parse().unwrap(), message: "rejected".into() }
}

async fn last_error(ctx: &Ctx) -> Option<String> {
    ctx.google.status().await.unwrap().last_sync_error
}

#[tokio::test]
async fn sends_an_event_created_while_connected() {
    let ctx = connected().await;
    let created = ctx.calendar.create(new_event(&ctx, "Gym")).await.unwrap();
    assert_eq!(created.sync_state, Some(SyncState::PendingCreate));
    assert_eq!(created.source, EventSource::Local);
    assert_eq!(ctx.google.status().await.unwrap().pending_changes, 1);

    ctx.sync.flush().await.unwrap();
    let Some(Sent::Insert { token, calendar, body }) = ctx.api.sent().into_iter().next() else { panic!("no insert") };
    assert_eq!((token.as_str(), calendar.as_str()), ("access-0", "primary"));
    assert_eq!(body.summary.as_deref(), Some("Gym"));
    assert!(body.start.is_some_and(|start| start.date_time.is_some()));

    let stored = row(&ctx.db.db, &created.id).await;
    assert_eq!(stored.sync_state, None);
    assert_eq!(stored.external_id.as_deref(), Some("created-0"));
    assert_eq!(stored.external_calendar_id.as_deref(), Some("primary"));
    assert_eq!(stored.external_etag.as_deref(), Some("\"i0\""));
    assert!(stored.external_url.is_some());
    assert_eq!(stored.source, EventSource::Local);
    assert_eq!(ctx.google.status().await.unwrap().pending_changes, 0);

    // Nothing is waiting any more: another run sends nothing.
    ctx.sync.flush().await.unwrap();
    assert_eq!(ctx.api.sent().len(), 1);
}

#[tokio::test]
async fn keeps_events_created_before_connecting_local() {
    let ctx = setup().await;
    let created = ctx.calendar.create(new_event(&ctx, "Before")).await.unwrap();
    assert_eq!(created.sync_state, None);
    ctx.google
        .save_credentials(SaveGoogleCredentialsBody {
            client_id: CLIENT_ID.into(),
            client_secret: CLIENT_SECRET.into(),
        })
        .await
        .unwrap();
    let state = state_of(&ctx.google.start_connect(SERVER_URL).await.unwrap().auth_url);
    ctx.google.finish_connect("code", Some(&state)).await.unwrap();

    let edited = ctx.calendar.update(&created.id, rename("Still local")).await.unwrap();
    assert_eq!(edited.sync_state, None);
    ctx.calendar.remove(&created.id).await.unwrap();
    assert_eq!(row(&ctx.db.db, &created.id).await.sync_state, None);
    ctx.sync.flush().await.unwrap();
    assert!(ctx.api.sent().is_empty());
}

#[tokio::test]
async fn does_not_send_while_disconnected() {
    let ctx = setup().await;
    ctx.calendar.create(new_event(&ctx, "Offline")).await.unwrap();
    assert_error(ctx.sync.flush().await, 409, "not_connected");
    assert!(ctx.api.sent().is_empty());
}

#[tokio::test]
async fn sends_three_quick_edits_as_one_patch_with_the_last_values() {
    let ctx = connected().await;
    linked(&ctx, "g1", "Original").await;
    for title in ["One", "Two", "Three"] {
        let edited = ctx.calendar.update("row-g1", rename(title)).await.unwrap();
        assert_eq!(edited.sync_state, Some(SyncState::PendingUpdate));
    }
    ctx.sync.flush().await.unwrap();

    let sent = patches(&ctx);
    assert_eq!(sent.len(), 1);
    let Sent::Patch { calendar, event, etag, body, .. } = &sent[0] else { panic!("no patch") };
    assert_eq!((calendar.as_str(), event.as_str(), etag.as_str()), ("primary", "g1", "\"v1\""));
    assert_eq!(body.summary.as_deref(), Some("Three"));
    let stored = row(&ctx.db.db, "row-g1").await;
    assert_eq!((stored.sync_state, stored.external_etag.as_deref()), (None, Some("\"p0\"")));
    assert_eq!(stored.title, "Three");
}

#[tokio::test]
async fn keeps_an_edit_made_while_the_request_runs_for_the_next_run() {
    let ctx = connected().await;
    linked(&ctx, "g1", "Original").await;
    ctx.calendar.update("row-g1", rename("First")).await.unwrap();

    ctx.api.hold();
    let sender = ctx.sync.clone();
    let running = tokio::spawn(async move { sender.flush().await });
    ctx.api.entered().await;
    ctx.calendar.update("row-g1", rename("Second")).await.unwrap();
    ctx.api.release();
    running.await.unwrap().unwrap();

    // The first patch's result is kept (the new etag), but the row is still pending.
    let stored = row(&ctx.db.db, "row-g1").await;
    assert_eq!(stored.sync_state, Some(SyncState::PendingUpdate));
    assert_eq!(stored.external_etag.as_deref(), Some("\"p0\""));
    assert_eq!(stored.title, "Second");

    ctx.sync.flush().await.unwrap();
    let sent = patches(&ctx);
    assert_eq!(sent.len(), 2);
    let Sent::Patch { etag, body, .. } = &sent[1] else { panic!("no patch") };
    assert_eq!((etag.as_str(), body.summary.as_deref()), ("\"p0\"", Some("Second")));
    assert_eq!(row(&ctx.db.db, "row-g1").await.sync_state, None);
}

#[tokio::test]
async fn sends_the_latest_values_of_an_event_edited_before_its_creation() {
    let ctx = connected().await;
    let created = ctx.calendar.create(new_event(&ctx, "Draft")).await.unwrap();
    let edited = ctx.calendar.update(&created.id, rename("Final")).await.unwrap();
    assert_eq!(edited.sync_state, Some(SyncState::PendingCreate));

    ctx.sync.flush().await.unwrap();
    let sent = ctx.api.sent();
    assert_eq!(sent.len(), 1);
    let Sent::Insert { body, .. } = &sent[0] else { panic!("no insert") };
    assert_eq!(body.summary.as_deref(), Some("Final"));
}

#[tokio::test]
async fn drops_an_event_deleted_before_its_creation_without_calling_google() {
    let ctx = connected().await;
    let created = ctx.calendar.create(new_event(&ctx, "Oops")).await.unwrap();
    ctx.calendar.remove(&created.id).await.unwrap();
    let stored = row(&ctx.db.db, &created.id).await;
    assert!(stored.deleted_at.is_some() && stored.sync_state.is_none());
    ctx.sync.flush().await.unwrap();
    assert!(ctx.api.sent().is_empty());
}

#[tokio::test]
async fn deletes_in_google_an_event_removed_while_its_creation_runs() {
    let ctx = connected().await;
    let created = ctx.calendar.create(new_event(&ctx, "Racing")).await.unwrap();
    ctx.api.hold();
    let sender = ctx.sync.clone();
    let running = tokio::spawn(async move { sender.flush().await });
    ctx.api.entered().await;
    ctx.calendar.remove(&created.id).await.unwrap();
    ctx.api.release();
    running.await.unwrap().unwrap();

    // It exists in Google now, so it is linked and waits to be deleted.
    let stored = row(&ctx.db.db, &created.id).await;
    assert_eq!((stored.sync_state, stored.external_id.as_deref()), (Some(SyncState::PendingDelete), Some("created-0")));
    ctx.sync.flush().await.unwrap();
    assert_eq!(count(&ctx, |sent| matches!(sent, Sent::Insert { .. })), 1);
    assert_eq!(count(&ctx, |sent| matches!(sent, Sent::Delete { event, .. } if event == "created-0")), 1);
    let stored = row(&ctx.db.db, &created.id).await;
    assert!(stored.sync_state.is_none() && stored.external_id.is_none());
}

#[tokio::test]
async fn deletes_a_linked_event_in_google() {
    let ctx = connected().await;
    linked(&ctx, "g1", "Bye").await;
    ctx.calendar.remove("row-g1").await.unwrap();
    assert_eq!(row(&ctx.db.db, "row-g1").await.sync_state, Some(SyncState::PendingDelete));
    ctx.sync.flush().await.unwrap();
    assert!(
        matches!(&ctx.api.sent()[..], [Sent::Delete { calendar, event, .. }] if calendar == "primary" && event == "g1")
    );
    let stored = row(&ctx.db.db, "row-g1").await;
    assert!(stored.deleted_at.is_some() && stored.sync_state.is_none() && stored.external_id.is_none());
}

#[tokio::test]
async fn sends_no_change_for_the_links_to_tasks_and_thoughts() {
    let ctx = connected().await;
    linked(&ctx, "g1", "Plain").await;
    let edited = ctx
        .calendar
        .update("row-g1", UpdateEventBody { linked_task_ids: Some(vec!["t1".into()]), ..Default::default() })
        .await
        .unwrap();
    assert_eq!(edited.sync_state, None);
    ctx.sync.flush().await.unwrap();
    assert!(ctx.api.sent().is_empty());
}

#[tokio::test]
async fn keeps_the_google_version_when_it_changed_there_too() {
    let ctx = connected().await;
    linked(&ctx, "g1", "Mine").await;
    ctx.calendar.update("row-g1", rename("My edit")).await.unwrap();
    ctx.api.on_patch(|_| Err(GoogleCalendarError::Conflict));
    ctx.api.on_get(|_| {
        Ok(serde_json::from_value::<GoogleEvent>(json!({
            "id": "g1", "summary": "Theirs", "etag": "\"v2\"",
            "start": { "dateTime": "2030-01-01T10:00:00Z" }, "end": { "dateTime": "2030-01-01T11:00:00Z" },
        }))
        .unwrap())
    });
    ctx.sync.flush().await.unwrap();

    let Sent::Patch { etag, .. } = &patches(&ctx)[0] else { panic!("no patch") };
    assert_eq!(etag, "\"v1\"");
    assert_eq!(count(&ctx, |sent| matches!(sent, Sent::Get { event, .. } if event == "g1")), 1);
    let stored = row(&ctx.db.db, "row-g1").await;
    assert_eq!((stored.title.as_str(), stored.sync_state), ("Theirs", None));
    assert_eq!(stored.external_etag.as_deref(), Some("\"v2\""));
    assert!(stored.deleted_at.is_none());
    let status = ctx.google.status().await.unwrap();
    let notice = status.last_conflict.unwrap();
    assert_eq!((notice.title.as_str(), notice.at), ("My edit", ctx.clock.now()()));
    assert_eq!(status.pending_changes, 0);
}

#[tokio::test]
async fn deletes_locally_what_google_already_deleted() {
    let ctx = connected().await;
    for (id, conflict) in [("g1", false), ("g2", true)] {
        linked(&ctx, id, id).await;
        ctx.calendar.update(&format!("row-{id}"), rename("Edited")).await.unwrap();
        ctx.api
            .on_patch(move |_| Err(if conflict { GoogleCalendarError::Conflict } else { GoogleCalendarError::Gone }));
        ctx.sync.flush().await.unwrap();
        let stored = row(&ctx.db.db, &format!("row-{id}")).await;
        assert!(stored.deleted_at.is_some() && stored.sync_state.is_none() && stored.external_id.is_none());
    }
    assert!(ctx.google.status().await.unwrap().last_conflict.is_none());

    // A cancelled event in the answer to the conflict means the same.
    linked(&ctx, "g3", "g3").await;
    ctx.calendar.update("row-g3", rename("Edited")).await.unwrap();
    ctx.api.on_patch(|_| Err(GoogleCalendarError::Conflict));
    ctx.api.on_get(|_| Ok(serde_json::from_value(json!({ "id": "g3", "status": "cancelled" })).unwrap()));
    ctx.sync.flush().await.unwrap();
    assert!(row(&ctx.db.db, "row-g3").await.deleted_at.is_some());
}

#[tokio::test]
async fn treats_an_event_already_gone_as_deleted() {
    let ctx = connected().await;
    linked(&ctx, "g1", "Gone").await;
    ctx.calendar.remove("row-g1").await.unwrap();
    ctx.api.on_delete(|_| Err(GoogleCalendarError::Gone));
    ctx.sync.flush().await.unwrap();
    assert!(row(&ctx.db.db, "row-g1").await.sync_state.is_none());
    assert_eq!(last_error(&ctx).await, None);
}

#[tokio::test]
async fn refreshes_the_token_once_after_a_401() {
    let ctx = connected().await;
    linked(&ctx, "g1", "Token").await;
    ctx.calendar.update("row-g1", rename("Edited")).await.unwrap();
    ctx.api.on_patch(|count| {
        if count == 0 {
            Err(GoogleCalendarError::Unauthorized)
        } else {
            Ok(serde_json::from_value(json!({ "id": "g1", "etag": "\"v2\"" })).unwrap())
        }
    });
    ctx.sync.flush().await.unwrap();
    let tokens: Vec<_> = patches(&ctx)
        .into_iter()
        .map(|sent| match sent {
            Sent::Patch { token, .. } => token,
            other => panic!("{other:?}"),
        })
        .collect();
    assert_eq!(tokens, ["access-0", "access-1"]);
    assert_eq!(ctx.auth.count("refresh("), 1);
    assert!(row(&ctx.db.db, "row-g1").await.sync_state.is_none());

    // Still refused after the refresh: the change stays pending.
    ctx.calendar.update("row-g1", rename("Again")).await.unwrap();
    ctx.api.on_patch(|_| Err(GoogleCalendarError::Unauthorized));
    assert_error(ctx.sync.flush().await, 502, "google_unavailable");
    assert_eq!(row(&ctx.db.db, "row-g1").await.sync_state, Some(SyncState::PendingUpdate));

    // The refresh itself fails: the run stops with that error.
    ctx.auth.on_refresh(|_| Err(life_board_api::services::google_auth_client::GoogleAuthError::InvalidGrant));
    assert_error(ctx.sync.flush().await, 400, "reauth_required");
}

#[tokio::test]
async fn keeps_the_change_and_backs_off_after_a_failure() {
    let ctx = connected().await;
    linked(&ctx, "g1", "Backoff").await;
    ctx.calendar.update("row-g1", rename("Edited")).await.unwrap();
    ctx.api.on_patch(|_| Err(GoogleCalendarError::Network("offline".into())));

    // 1, 5, then 15 minutes between the attempts.
    let mut attempts = 0;
    for (wait, tries) in [(0, 1), (30, 1), (30, 2), (4 * 60, 2), (60, 3), (14 * 60, 3), (60, 4), (15 * 60, 5)] {
        ctx.clock.advance(TimeDelta::seconds(wait));
        ctx.sync.flush().await.unwrap();
        attempts = patches(&ctx).len();
        assert_eq!(attempts, tries, "after waiting {wait}s");
        assert_eq!(row(&ctx.db.db, "row-g1").await.sync_state, Some(SyncState::PendingUpdate));
    }
    assert_eq!(attempts, 5);

    // A new edit is tried at once, and once Google answers the change goes out.
    ctx.calendar.update("row-g1", rename("Edited again")).await.unwrap();
    ctx.api.on_patch(|_| Ok(serde_json::from_value(json!({ "id": "g1", "etag": "\"v9\"" })).unwrap()));
    ctx.sync.flush().await.unwrap();
    assert_eq!(patches(&ctx).len(), 6);
    assert!(row(&ctx.db.db, "row-g1").await.sync_state.is_none());
}

#[tokio::test]
async fn keeps_going_after_a_server_error_but_stops_on_a_rate_limit() {
    let ctx = connected().await;
    for id in ["g1", "g2", "g3"] {
        linked(&ctx, id, id).await;
        ctx.calendar.update(&format!("row-{id}"), rename("Edited")).await.unwrap();
    }
    ctx.api.on_patch(|count| match count {
        0 => Err(status_error("503")),
        1 => Err(GoogleCalendarError::RateLimited),
        _ => Ok(GoogleEvent { id: "x".into(), ..Default::default() }),
    });
    ctx.sync.flush().await.unwrap();
    assert_eq!(patches(&ctx).len(), 2);
    let states = [row(&ctx.db.db, "row-g1").await, row(&ctx.db.db, "row-g2").await, row(&ctx.db.db, "row-g3").await];
    assert!(states.iter().all(|event| event.sync_state == Some(SyncState::PendingUpdate)));
    assert_eq!(last_error(&ctx).await, None);
}

#[tokio::test]
async fn drops_a_change_google_rejects_and_records_the_error() {
    let ctx = connected().await;
    linked(&ctx, "g1", "Broken").await;
    ctx.calendar.update("row-g1", rename("Invalid")).await.unwrap();
    let created = ctx.calendar.create(new_event(&ctx, "Also bad")).await.unwrap();
    ctx.api.on_patch(|_| Err(status_error("400")));
    ctx.api.on_insert(|_| Err(status_error("403")));
    ctx.sync.flush().await.unwrap();

    assert!(row(&ctx.db.db, "row-g1").await.sync_state.is_none());
    let stored = row(&ctx.db.db, &created.id).await;
    assert!(stored.sync_state.is_none() && stored.external_id.is_none());
    let error = last_error(&ctx).await.unwrap();
    // The last refusal is the one kept, with the title of its event.
    assert!(error.contains("Invalid") || error.contains("Also bad"), "{error}");
    assert!(error.contains("rejected"), "{error}");
    ctx.sync.flush().await.unwrap();
    assert_eq!(ctx.api.sent().len(), 2);
}

#[tokio::test]
async fn edits_and_deletes_only_the_occurrence() {
    let ctx = connected().await;
    for occurrence in ["series_20261101", "series_20261102"] {
        let mut event = linked(&ctx, occurrence, "Standup").await;
        event.recurring_event_id = Some("series".into());
    }
    ctx.calendar.update("row-series_20261101", rename("Moved")).await.unwrap();
    ctx.calendar.remove("row-series_20261102").await.unwrap();
    ctx.sync.flush().await.unwrap();

    let sent = ctx.api.sent();
    assert!(matches!(&sent[0], Sent::Patch { event, .. } if event == "series_20261101"));
    assert!(matches!(&sent[1], Sent::Delete { event, .. } if event == "series_20261102"));
    assert_eq!(sent.len(), 2);
}

#[tokio::test]
async fn sends_a_pending_update_without_an_etag_for_any_version() {
    let ctx = connected().await;
    let mut event = linked(&ctx, "g1", "No etag").await;
    ctx.db
        .db
        .call(|conn| conn.execute("UPDATE calendar_events SET external_etag = NULL, sync_state = 'pending_update'", []))
        .await
        .unwrap();
    event.sync_state = Some(SyncState::PendingUpdate);
    ctx.sync.flush().await.unwrap();
    let Sent::Patch { etag, .. } = &patches(&ctx)[0] else { panic!("no patch") };
    assert_eq!(etag, "*");
}

#[tokio::test]
async fn clears_a_change_with_nothing_to_send_it_to() {
    let ctx = connected().await;
    let mut orphan = NewCalendarEvent { id: "orphan".into(), title: "Orphan".into(), ..Default::default() };
    orphan.sync_state = Some(SyncState::PendingUpdate);
    ctx.db.db.call(move |conn| insert_row(conn, orphan)).await.unwrap();
    ctx.sync.flush().await.unwrap();
    assert!(ctx.api.sent().is_empty());
    assert!(row(&ctx.db.db, "orphan").await.sync_state.is_none());
}

#[tokio::test]
async fn sends_before_importing_and_never_at_the_same_time() {
    let ctx = connected().await;
    let created = ctx.calendar.create(new_event(&ctx, "First")).await.unwrap();
    // Google lists the event it was just sent.
    ctx.api.lists(vec![
        serde_json::from_value(json!({
            "id": "created-0", "summary": "First", "etag": "\"i0\"",
            "start": { "dateTime": "2030-01-01T10:00:00Z" }, "end": { "dateTime": "2030-01-01T11:00:00Z" },
        }))
        .unwrap(),
    ]);
    ctx.sync.sync().await.unwrap();
    // The change went out before the listing, so it is linked when the import runs.
    assert_eq!(count(&ctx, |sent| matches!(sent, Sent::Insert { .. })), 1);
    assert!(row(&ctx.db.db, &created.id).await.deleted_at.is_none());

    // While a sync reads Google, the worker waits for it.
    ctx.api.delay(Duration::from_millis(300));
    let syncing = ctx.sync.clone();
    let importing = tokio::spawn(async move { syncing.sync().await });
    while ctx.api.listings().len() < 2 {
        tokio::time::sleep(Duration::from_millis(5)).await;
    }
    ctx.calendar.create(new_event(&ctx, "Second")).await.unwrap();
    let sender = ctx.sync.clone();
    let sending = tokio::spawn(async move { sender.flush().await });
    tokio::time::sleep(Duration::from_millis(100)).await;
    assert_eq!(count(&ctx, |sent| matches!(sent, Sent::Insert { .. })), 1);
    importing.await.unwrap().unwrap();
    sending.await.unwrap().unwrap();
    assert_eq!(count(&ctx, |sent| matches!(sent, Sent::Insert { .. })), 2);
}

#[tokio::test]
async fn reports_the_rejected_change_with_the_sync() {
    let ctx = connected().await;
    ctx.calendar.create(new_event(&ctx, "Not accepted")).await.unwrap();
    ctx.api.on_insert(|_| Err(status_error("400")));
    ctx.api.lists(vec![]);
    ctx.sync.sync().await.unwrap();
    assert!(last_error(&ctx).await.unwrap().contains("Not accepted"));
    // The next sync that has nothing to reject clears it.
    ctx.sync.sync().await.unwrap();
    assert_eq!(last_error(&ctx).await, None);
}

#[tokio::test]
async fn drops_the_pending_changes_on_disconnect() {
    let ctx = connected().await;
    let created = ctx.calendar.create(new_event(&ctx, "Pending")).await.unwrap();
    linked(&ctx, "g1", "Imported").await;
    ctx.calendar.update("row-g1", rename("Edited")).await.unwrap();
    assert_eq!(ctx.google.status().await.unwrap().pending_changes, 2);

    ctx.google.disconnect().await.unwrap();
    assert_eq!(ctx.google.status().await.unwrap().pending_changes, 0);
    let stored = row(&ctx.db.db, &created.id).await;
    assert!(stored.sync_state.is_none() && stored.deleted_at.is_none());
    assert!(ctx.api.sent().is_empty());
    // Connected again, an event made meanwhile is local: nothing of the old state is sent.
    assert_error(ctx.sync.flush().await, 409, "not_connected");
}

#[tokio::test]
async fn round_trips_timed_and_all_day_events() {
    let ctx = connected().await;
    let day = ctx.clock.now()().with_timezone(&Local).date_naive() + TimeDelta::days(3);
    let midnight = Local.from_local_datetime(&day.and_time(NaiveTime::MIN)).earliest().unwrap();
    let mut all_day = new_event(&ctx, "Holiday");
    (all_day.start_at, all_day.end_at, all_day.all_day) = (midnight.to_utc(), midnight.to_utc(), Some(true));
    let all_day = ctx.calendar.create(all_day).await.unwrap();
    let timed = ctx.calendar.create(new_event(&ctx, "Gym")).await.unwrap();
    ctx.sync.flush().await.unwrap();

    // Both rows share the frozen clock's `updated_at`, so the send order follows their random ids.
    let sent = ctx.api.sent();
    let insert = |summary: &str| {
        let at = sent
            .iter()
            .position(|sent| matches!(sent, Sent::Insert { body, .. } if body.summary.as_deref() == Some(summary)))
            .expect("no insert");
        let Sent::Insert { body, .. } = &sent[at] else { unreachable!() };
        (format!("created-{at}"), body)
    };
    let (holiday_id, body) = insert("Holiday");
    let next = day + TimeDelta::days(1);
    let date = |day: chrono::NaiveDate| Some(GoogleEventTimeBody { date: Some(day.to_string()), date_time: None });
    assert_eq!((&body.start, &body.end), (&date(day), &date(next)));
    let (gym_id, body) = insert("Gym");
    let start = body.start.clone().and_then(|start| start.date_time).unwrap();
    assert_eq!(chrono::DateTime::parse_from_rfc3339(&start).unwrap(), ctx.clock.now()() + TimeDelta::hours(2));

    // Google's listing gives the same days and instants back: the rows don't move.
    ctx.api.lists(vec![
        serde_json::from_value(json!({
            "id": holiday_id, "summary": "Holiday",
            "start": { "date": day.to_string() }, "end": { "date": next.to_string() },
        }))
        .unwrap(),
        serde_json::from_value(json!({
            "id": gym_id, "summary": "Gym",
            "start": { "dateTime": start }, "end": { "dateTime": body.end.clone().and_then(|end| end.date_time) },
        }))
        .unwrap(),
    ]);
    ctx.sync.sync().await.unwrap();
    for (id, expected) in [(&all_day.id, &all_day), (&timed.id, &timed)] {
        let stored = row(&ctx.db.db, id).await;
        assert_eq!(
            (stored.start_at, stored.end_at, stored.all_day),
            (expected.start_at, expected.end_at, expected.all_day)
        );
        assert!(stored.deleted_at.is_none());
    }
}

#[tokio::test]
async fn removes_a_sent_event_that_was_deleted_in_google() {
    let ctx = connected().await;
    let created = ctx.calendar.create(new_event(&ctx, "Mine")).await.unwrap();
    ctx.sync.flush().await.unwrap();
    ctx.api.lists(vec![]);
    ctx.sync.sync().await.unwrap();
    assert!(row(&ctx.db.db, &created.id).await.deleted_at.is_some());
}

#[tokio::test]
async fn a_sync_asked_for_by_the_user_skips_the_backoff() {
    let ctx = connected().await;
    linked(&ctx, "g1", "Retry").await;
    ctx.calendar.update("row-g1", rename("Edited")).await.unwrap();
    ctx.api.on_patch(|_| Err(GoogleCalendarError::Network("offline".into())));
    ctx.api.lists(vec![]);
    ctx.sync.flush().await.unwrap();
    ctx.sync.flush().await.unwrap();
    assert_eq!(patches(&ctx).len(), 1);

    ctx.api.on_patch(|_| Ok(serde_json::from_value(json!({ "id": "g1", "etag": "\"v2\"" })).unwrap()));
    // The scheduled sync still waits; the one the user asked for doesn't.
    ctx.sync.sync().await.unwrap();
    assert_eq!(patches(&ctx).len(), 1);
    ctx.sync.sync_now().await.unwrap();
    assert_eq!(patches(&ctx).len(), 2);
    assert!(row(&ctx.db.db, "row-g1").await.sync_state.is_none());
}

#[tokio::test]
async fn reports_an_internal_error_when_the_database_fails() {
    let ctx = connected().await;
    ctx.db.db.call(|conn| conn.execute_batch("DROP TABLE calendar_events")).await.unwrap();
    assert_error(ctx.sync.flush().await, 500, "internal_error");
}

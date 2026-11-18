//! Runs under `TZ=UTC` and `TZ=America/Sao_Paulo` (see `AGENTS.md`): the window and
//! the all-day events follow the local days.

use std::sync::Arc;
use std::time::Duration;

use chrono::{Local, NaiveTime, SecondsFormat, TimeDelta, TimeZone};
use life_board_api::db::Db;
use life_board_api::db::schema::calendar::{CalendarEvent, EventSource, NewCalendarEvent, SyncState, insert_row};
use life_board_api::dto::google::SaveGoogleCredentialsBody;
use life_board_api::services::google::GoogleService;
use life_board_api::services::google_auth_client::GoogleAuthError;
use life_board_api::services::google_calendar::{GoogleCalendarService, SyncResult, sync_window};
use life_board_api::services::google_calendar_client::{GoogleCalendarError, GoogleEvent};
use serde_json::{Value, json};

use crate::common::google::{
    CLIENT_ID, CLIENT_SECRET, EMAIL, FakeCalendar, FakeGoogle, SERVER_URL, TestClock, calendar_service, google_service,
    state_of,
};
use crate::common::{TestDb, assert_error, test_db};

struct Ctx {
    db: TestDb,
    auth: Arc<FakeGoogle>,
    api: Arc<FakeCalendar>,
    clock: TestClock,
    google: GoogleService,
    service: GoogleCalendarService,
}

async fn setup() -> Ctx {
    let db = test_db().await;
    let (auth, api, clock) = (FakeGoogle::new(), FakeCalendar::new(), TestClock::new());
    let google = google_service(&db.db, &auth, &clock);
    let service = calendar_service(&db.db, &google, &api, &clock);
    Ctx { db, auth, api, clock, google, service }
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

fn google(value: Value) -> GoogleEvent {
    serde_json::from_value(value).unwrap()
}

/// An RFC 3339 instant `hours` hours from the test clock.
fn at(ctx: &Ctx, hours: i64) -> String {
    (ctx.clock.now()() + TimeDelta::hours(hours)).to_rfc3339_opts(SecondsFormat::Secs, true)
}

fn timed(ctx: &Ctx, id: &str, title: &str, hours: i64) -> GoogleEvent {
    google(json!({
        "id": id, "status": "confirmed", "summary": title, "etag": "\"1\"",
        "htmlLink": format!("https://www.google.com/calendar/event?eid={id}"),
        "start": { "dateTime": at(ctx, hours) }, "end": { "dateTime": at(ctx, hours + 1) },
    }))
}

fn cancelled(id: &str) -> GoogleEvent {
    google(json!({ "id": id, "status": "cancelled" }))
}

async fn rows(db: &Db) -> Vec<CalendarEvent> {
    db.call(|conn| {
        let mut statement = conn.prepare("SELECT * FROM calendar_events ORDER BY start_at, id")?;
        statement.query_map([], CalendarEvent::from_row)?.collect()
    })
    .await
    .unwrap()
}

async fn alive(db: &Db) -> Vec<CalendarEvent> {
    rows(db).await.into_iter().filter(|row| row.deleted_at.is_none()).collect()
}

fn titles(events: &[CalendarEvent]) -> Vec<&str> {
    events.iter().map(|event| event.title.as_str()).collect()
}

fn result(imported: usize, updated: usize, removed: usize) -> SyncResult {
    SyncResult { imported, updated, removed }
}

async fn insert(db: &Db, row: NewCalendarEvent) -> CalendarEvent {
    db.call(move |conn| insert_row(conn, row)).await.unwrap()
}

fn linked(ctx: &Ctx, id: &str, title: &str, hours: i64) -> NewCalendarEvent {
    let now = ctx.clock.now()();
    NewCalendarEvent {
        id: format!("row-{id}"),
        title: title.into(),
        start_at: now + TimeDelta::hours(hours),
        end_at: now + TimeDelta::hours(hours + 1),
        source: Some(EventSource::Google),
        external_id: Some(id.into()),
        external_calendar_id: Some("primary".into()),
        ..Default::default()
    }
}

async fn last_sync(ctx: &Ctx) -> (Option<i64>, Option<String>) {
    ctx.db
        .db
        .call(|conn| {
            conn.query_row("SELECT last_sync_at, last_sync_error FROM google_settings", [], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
        })
        .await
        .unwrap()
}

#[tokio::test]
async fn imports_timed_all_day_and_recurring_events() {
    let ctx = connected().await;
    let day = ctx.clock.now()().with_timezone(&Local).date_naive() + TimeDelta::days(3);
    let next = day + TimeDelta::days(1);
    let mut events = vec![
        timed(&ctx, "timed", "Gym", 5),
        google(json!({
            "id": "day", "summary": "Holiday", "colorId": "11",
            "start": { "date": day.to_string() }, "end": { "date": next.to_string() },
        })),
    ];
    for (id, hours) in [("series_1", 24), ("series_2", 48)] {
        let mut occurrence = timed(&ctx, id, "Standup", hours);
        occurrence.recurring_event_id = Some("series".into());
        events.push(occurrence);
    }
    ctx.api.lists(events);

    assert_eq!(ctx.service.sync().await.unwrap(), result(4, 0, 0));
    let stored = alive(&ctx.db.db).await;
    assert_eq!(titles(&stored), ["Gym", "Standup", "Standup", "Holiday"]);
    let holiday = stored.iter().find(|event| event.title == "Holiday").unwrap();
    let midnight = Local.from_local_datetime(&day.and_time(NaiveTime::MIN)).earliest().unwrap();
    assert!(holiday.all_day && holiday.start_at == midnight && holiday.end_at == midnight);
    assert_eq!(holiday.color, "#d50000");
    assert!(stored.iter().all(|event| event.source == EventSource::Google && event.sync_state.is_none()));
    let gym = stored.iter().find(|event| event.title == "Gym").unwrap();
    assert_eq!(gym.external_url.as_deref(), Some("https://www.google.com/calendar/event?eid=timed"));
    assert_eq!(gym.color, "#3b82f6");
    assert_eq!(stored.iter().filter(|event| event.recurring_event_id.as_deref() == Some("series")).count(), 2);

    let (synced_at, error) = last_sync(&ctx).await;
    assert!(synced_at.is_some() && error.is_none());
    assert_eq!(ctx.google.status().await.unwrap().last_sync_at, Some(ctx.clock.now()()));
}

#[tokio::test]
async fn updates_the_same_rows_on_the_next_sync() {
    let ctx = connected().await;
    ctx.api.lists(vec![timed(&ctx, "a", "Old", 5), timed(&ctx, "b", "Same", 8)]);
    ctx.service.sync().await.unwrap();
    let before = alive(&ctx.db.db).await;

    ctx.api.lists(vec![timed(&ctx, "a", "New", 6), timed(&ctx, "b", "Same", 8)]);
    assert_eq!(ctx.service.sync().await.unwrap(), result(0, 1, 0));
    let after = alive(&ctx.db.db).await;
    assert_eq!(titles(&after), ["New", "Same"]);
    assert_eq!(
        after.iter().map(|event| event.id.as_str()).collect::<Vec<_>>(),
        before.iter().map(|event| event.id.as_str()).collect::<Vec<_>>()
    );
    assert_eq!(after[0].start_at, ctx.clock.now()() + TimeDelta::hours(6));
    assert_eq!(rows(&ctx.db.db).await.len(), 2);

    assert_eq!(ctx.service.sync().await.unwrap(), result(0, 0, 0));
}

#[tokio::test]
async fn removes_cancelled_and_missing_events_but_keeps_the_ones_outside_the_window() {
    let ctx = connected().await;
    let outside = linked(&ctx, "far", "Far away", 24 * 400);
    let before_window = linked(&ctx, "old", "Long ago", -24 * 40);
    insert(&ctx.db.db, outside).await;
    insert(&ctx.db.db, before_window).await;
    ctx.api.lists(vec![
        timed(&ctx, "keep", "Keep", 2),
        timed(&ctx, "cancel", "Cancel", 3),
        timed(&ctx, "gone", "Gone", 4),
        timed(&ctx, "series_1", "Occurrence one", 5),
        timed(&ctx, "series_2", "Occurrence two", 6),
    ]);
    ctx.service.sync().await.unwrap();

    ctx.api.lists(vec![timed(&ctx, "keep", "Keep", 2), cancelled("cancel"), cancelled("series_2"), cancelled("never")]);
    assert_eq!(ctx.service.sync().await.unwrap(), result(0, 0, 4));
    // `gone` and `series_1` were missing from the listing; `cancel` and `series_2` came back cancelled.
    assert_eq!(titles(&alive(&ctx.db.db).await), ["Long ago", "Keep", "Far away"]);
    let removed: Vec<_> = rows(&ctx.db.db).await.into_iter().filter(|row| row.deleted_at.is_some()).collect();
    assert_eq!(removed.len(), 4);
}

#[tokio::test]
async fn brings_back_an_event_google_returns_again() {
    let ctx = connected().await;
    ctx.api.lists(vec![timed(&ctx, "a", "Back", 5)]);
    ctx.service.sync().await.unwrap();
    ctx.api.lists(vec![]);
    assert_eq!(ctx.service.sync().await.unwrap(), result(0, 0, 1));
    assert!(alive(&ctx.db.db).await.is_empty());

    ctx.api.lists(vec![timed(&ctx, "a", "Back", 5)]);
    assert_eq!(ctx.service.sync().await.unwrap(), result(0, 1, 0));
    let stored = rows(&ctx.db.db).await;
    assert_eq!(stored.len(), 1);
    assert!(stored[0].deleted_at.is_none());
}

#[tokio::test]
async fn leaves_events_with_a_pending_change_untouched() {
    let ctx = connected().await;
    let mut pending = linked(&ctx, "pending", "Mine", 5);
    pending.sync_state = Some(SyncState::PendingUpdate);
    insert(&ctx.db.db, pending).await;
    ctx.api.lists(vec![timed(&ctx, "pending", "Theirs", 9), cancelled("other")]);
    assert_eq!(ctx.service.sync().await.unwrap(), result(0, 0, 0));
    let stored = alive(&ctx.db.db).await;
    assert_eq!(titles(&stored), ["Mine"]);

    // Missing from the listing is not a reason to remove it either.
    ctx.api.lists(vec![]);
    assert_eq!(ctx.service.sync().await.unwrap(), result(0, 0, 0));
    assert_eq!(titles(&alive(&ctx.db.db).await), ["Mine"]);
}

#[tokio::test]
async fn stores_an_untitled_event_with_an_empty_title() {
    let ctx = connected().await;
    let mut event = timed(&ctx, "blank", "x", 5);
    event.summary = None;
    ctx.api.lists(vec![event]);
    ctx.service.sync().await.unwrap();
    assert_eq!(titles(&alive(&ctx.db.db).await), [""]);
}

#[tokio::test]
async fn skips_an_event_without_a_start() {
    let ctx = connected().await;
    ctx.api.lists(vec![google(json!({ "id": "odd", "status": "confirmed", "summary": "No time" }))]);
    assert_eq!(ctx.service.sync().await.unwrap(), result(0, 0, 0));
    assert!(rows(&ctx.db.db).await.is_empty());
}

#[tokio::test]
async fn keeps_the_stored_events_when_the_listing_fails() {
    let ctx = connected().await;
    ctx.api.lists(vec![timed(&ctx, "a", "Kept", 5), timed(&ctx, "b", "Also kept", 6)]);
    ctx.service.sync().await.unwrap();

    ctx.api.on_list(|_| Err(GoogleCalendarError::Network("connection reset".into())));
    let failed = ctx.service.sync().await;
    assert_error(failed, 502, "google_unavailable");
    assert_eq!(titles(&alive(&ctx.db.db).await), ["Kept", "Also kept"]);
    let (synced_at, error) = last_sync(&ctx).await;
    assert!(synced_at.is_some());
    assert!(error.unwrap().contains("connection reset"));
    assert!(ctx.google.status().await.unwrap().last_sync_error.is_some());

    ctx.api.lists(vec![timed(&ctx, "a", "Kept", 5), timed(&ctx, "b", "Also kept", 6)]);
    ctx.service.sync().await.unwrap();
    assert_eq!(last_sync(&ctx).await.1, None);
}

#[tokio::test]
async fn records_a_rate_limit_and_tries_again_later() {
    let ctx = connected().await;
    ctx.api.on_list(|count| {
        if count == 0 {
            Err(GoogleCalendarError::RateLimited)
        } else {
            Ok(vec![google(json!({ "id": "late", "summary": "Late", "start": { "dateTime": "2026-11-20T10:00:00Z" }, "end": { "dateTime": "2026-11-20T11:00:00Z" } }))])
        }
    });
    assert_error(ctx.service.sync().await, 502, "google_unavailable");
    assert!(last_sync(&ctx).await.1.unwrap().contains("limiting"));
    assert_eq!(ctx.service.sync().await.unwrap(), result(1, 0, 0));
}

#[tokio::test]
async fn refreshes_the_token_once_after_a_401_and_retries() {
    let ctx = connected().await;
    ctx.api.on_list(|count| if count == 0 { Err(GoogleCalendarError::Unauthorized) } else { Ok(Vec::new()) });
    assert_eq!(ctx.service.sync().await.unwrap(), result(0, 0, 0));
    let tokens: Vec<_> = ctx.api.listings().into_iter().map(|(token, ..)| token).collect();
    assert_eq!(tokens, ["access-0", "access-1"]);
    assert_eq!(ctx.auth.count("refresh("), 1);

    ctx.api.on_list(|_| Err(GoogleCalendarError::Unauthorized));
    assert_error(ctx.service.sync().await, 502, "google_unavailable");
    assert_eq!(ctx.api.listings().len(), 4);
}

#[tokio::test]
async fn stops_when_google_refuses_the_authorization() {
    let ctx = connected().await;
    ctx.api.on_list(|_| Err(GoogleCalendarError::Unauthorized));
    ctx.auth.on_refresh(|_| Err(GoogleAuthError::InvalidGrant));
    assert_error(ctx.service.sync().await, 400, "reauth_required");
    assert_eq!(ctx.api.listings().len(), 1);
    assert!(ctx.google.status().await.unwrap().reauth_required);

    // Nothing to ask Google for until the account is connected again.
    assert_error(ctx.service.sync().await, 400, "reauth_required");
    assert_eq!(ctx.api.listings().len(), 1);
}

#[tokio::test]
async fn needs_a_connected_account() {
    let ctx = setup().await;
    assert_error(ctx.service.sync().await, 409, "not_connected");
    assert!(!ctx.service.is_connected().await);
    ctx.google
        .save_credentials(SaveGoogleCredentialsBody {
            client_id: CLIENT_ID.into(),
            client_secret: CLIENT_SECRET.into(),
        })
        .await
        .unwrap();
    assert_error(ctx.service.sync().await, 409, "not_connected");
    assert!(ctx.api.listings().is_empty());
}

#[tokio::test]
async fn runs_one_sync_at_a_time() {
    let ctx = connected().await;
    ctx.api.lists(vec![timed(&ctx, "a", "Once", 5)]);
    ctx.api.delay(Duration::from_millis(100));

    let (first, second, third) = tokio::join!(ctx.service.sync(), ctx.service.sync(), ctx.service.sync());
    assert_eq!(first.unwrap(), result(1, 0, 0));
    assert_eq!(second.unwrap(), result(1, 0, 0));
    assert_eq!(third.unwrap(), result(1, 0, 0));
    assert_eq!(ctx.api.listings().len(), 1);

    // A call made after the sync finished starts its own.
    assert_eq!(ctx.service.sync().await.unwrap(), result(0, 0, 0));
    assert_eq!(ctx.api.listings().len(), 2);
}

#[tokio::test]
async fn shares_a_failure_with_the_callers_that_waited() {
    let ctx = connected().await;
    ctx.api.on_list(|_| Err(GoogleCalendarError::Network("down".into())));
    ctx.api.delay(Duration::from_millis(100));
    let (first, second) = tokio::join!(ctx.service.sync(), ctx.service.sync());
    assert_error(first, 502, "google_unavailable");
    assert_error(second, 502, "google_unavailable");
    assert_eq!(ctx.api.listings().len(), 1);
}

#[tokio::test]
async fn reads_from_the_start_of_the_local_day_30_days_ago_to_365_days_ahead() {
    let ctx = connected().await;
    ctx.service.sync().await.unwrap();
    let (_, calendar, window) = ctx.api.listings().remove(0);
    assert_eq!(calendar, "primary");

    let now = ctx.clock.now()();
    let today = now.with_timezone(&Local).date_naive();
    let first_day = (today - TimeDelta::days(30)).and_time(NaiveTime::MIN);
    assert_eq!(window.time_min, Local.from_local_datetime(&first_day).earliest().unwrap());
    assert_eq!(window, sync_window(now));
    let last_day = (now.with_timezone(&Local).naive_local() + TimeDelta::days(365)).and_local_timezone(Local);
    assert_eq!(window.time_max, last_day.earliest().unwrap());
}

#[tokio::test]
async fn removes_the_google_events_and_unlinks_the_local_ones_on_disconnect() {
    let ctx = connected().await;
    ctx.api.lists(vec![timed(&ctx, "a", "Imported", 5)]);
    ctx.service.sync().await.unwrap();
    let mut mine = linked(&ctx, "mine", "Mine", 9);
    mine.source = Some(EventSource::Local);
    mine.sync_state = Some(SyncState::PendingUpdate);
    mine.external_url = Some("https://calendar.google.com/x".into());
    mine.external_etag = Some("\"7\"".into());
    mine.recurring_event_id = Some("series".into());
    let mut plain = linked(&ctx, "plain", "Plain", 12);
    plain.source = Some(EventSource::Local);
    plain.external_id = None;
    plain.external_calendar_id = None;
    insert(&ctx.db.db, mine).await;
    insert(&ctx.db.db, plain).await;

    ctx.google.disconnect().await.unwrap();
    let stored = rows(&ctx.db.db).await;
    assert_eq!(titles(&stored), ["Mine", "Plain"]);
    for event in &stored {
        assert_eq!(event.source, EventSource::Local);
        assert!(event.external_id.is_none() && event.external_calendar_id.is_none() && event.external_etag.is_none());
        assert!(event.external_url.is_none() && event.recurring_event_id.is_none() && event.sync_state.is_none());
    }
    assert_error(ctx.service.sync().await, 409, "not_connected");
}

#[tokio::test]
async fn upserts_events_linked_to_google_through_the_same_key() {
    // The row a local event gets once it is sent to Google is updated, not duplicated.
    let ctx = connected().await;
    let mut mine = linked(&ctx, "sent", "Mine", 5);
    mine.source = Some(EventSource::Local);
    let id = insert(&ctx.db.db, mine.clone()).await.id;
    ctx.api.lists(vec![timed(&ctx, "sent", "Renamed in Google", 5)]);
    assert_eq!(ctx.service.sync().await.unwrap(), result(0, 1, 0));
    let stored = rows(&ctx.db.db).await;
    assert_eq!((stored.len(), stored[0].id.as_str(), stored[0].title.as_str()), (1, id.as_str(), "Renamed in Google"));
    assert_eq!(stored[0].source, EventSource::Local);
}

#[tokio::test]
async fn keeps_everything_when_the_second_page_fails() {
    use life_board_api::services::google_calendar_client::GoogleCalendarClient;
    use wiremock::matchers::{method, query_param, query_param_is_missing};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    let ctx = connected().await;
    ctx.api.lists(vec![timed(&ctx, "a", "Kept", 5)]);
    ctx.service.sync().await.unwrap();

    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(query_param_is_missing("pageToken"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "items": [], "nextPageToken": "two" })))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(query_param("pageToken", "two"))
        .respond_with(ResponseTemplate::new(500).set_body_json(json!({ "error": { "message": "Backend Error" } })))
        .mount(&server)
        .await;
    let real = GoogleCalendarService::with_clock(
        ctx.db.db.clone(),
        ctx.google.clone(),
        Arc::new(GoogleCalendarClient::with_base_url(server.uri())),
        ctx.clock.now(),
    );

    assert_error(real.sync().await, 502, "google_unavailable");
    assert_eq!(titles(&alive(&ctx.db.db).await), ["Kept"]);
    assert!(last_sync(&ctx).await.1.unwrap().contains("500"));
}

#[tokio::test]
async fn the_scheduler_syncs_while_connected_and_stops() {
    let ctx = connected().await;
    ctx.api.lists(vec![timed(&ctx, "a", "Scheduled", 5)]);
    let scheduler = ctx.service.start_scheduler(Duration::from_millis(10), Duration::from_millis(20));
    for _ in 0..200 {
        if ctx.api.listings().len() >= 2 {
            break;
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    assert!(ctx.api.listings().len() >= 2);
    assert_eq!(titles(&alive(&ctx.db.db).await), ["Scheduled"]);

    scheduler.stop();
    tokio::time::sleep(Duration::from_millis(50)).await;
    let stopped = ctx.api.listings().len();
    tokio::time::sleep(Duration::from_millis(100)).await;
    assert_eq!(ctx.api.listings().len(), stopped);
}

#[tokio::test]
async fn the_scheduler_does_nothing_without_an_account() {
    let ctx = setup().await;
    let scheduler = ctx.service.start_scheduler(Duration::from_millis(5), Duration::from_millis(10));
    tokio::time::sleep(Duration::from_millis(100)).await;
    scheduler.stop();
    assert!(ctx.api.listings().is_empty());
}

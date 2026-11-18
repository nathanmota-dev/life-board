use chrono::{TimeZone, Utc};
use life_board_api::db::Db;
use life_board_api::db::columns::StringEnum;
use life_board_api::db::schema::calendar::{
    CalendarEvent, EventSource, NewCalendarEvent, SyncState, find_by_external, insert_row, upsert_external,
};
use life_board_api::services::calendar::CalendarService;
use rstest::rstest;

use crate::common::{migrations_before, temp_dir};

const CALENDAR: &str = "me@example.com";

fn google_event(external_id: &str, title: &str) -> NewCalendarEvent {
    NewCalendarEvent {
        id: format!("local-{external_id}"),
        title: title.into(),
        start_at: Utc.with_ymd_and_hms(2026, 10, 20, 8, 0, 0).unwrap(),
        end_at: Utc.with_ymd_and_hms(2026, 10, 20, 9, 0, 0).unwrap(),
        source: Some(EventSource::Google),
        external_id: Some(external_id.into()),
        external_calendar_id: Some(CALENDAR.into()),
        external_etag: Some("\"1\"".into()),
        external_updated_at: Some(Utc.with_ymd_and_hms(2026, 10, 1, 12, 0, 0).unwrap()),
        external_url: Some("https://calendar.google.com/event?eid=abc".into()),
        recurring_event_id: Some("series".into()),
        ..Default::default()
    }
}

async fn memory_db() -> (Db, tempfile::TempDir) {
    let dir = temp_dir("calendar-source-");
    let db = Db::open(&dir.path().join("events.db")).await.unwrap();
    (db, dir)
}

#[tokio::test]
async fn upgrades_from_before_0010_keeping_every_event_local_and_unchanged() {
    let dir = temp_dir("calendar-source-migration-");
    let path = dir.path().join("legacy.db");
    let legacy = Db::open_with(&path, migrations_before("0010")).await.unwrap();
    legacy
        .call(|conn| {
            conn.execute_batch(
                "INSERT INTO calendar_events (id, title, description, start_at, end_at, all_day, location, color, linked_task_ids, linked_thought_ids, created_at, updated_at) VALUES
                   ('timed', 'Flight', 'Window seat', 1792483200000, 1792490400000, 0, 'GRU', '#22c55e', '[\"t1\"]', '[\"th1\"]', 1790856000000, 1790856000000),
                   ('day', 'Holiday', NULL, 1791763200000, 1791849540000, 1, NULL, '#3b82f6', '[]', '[]', 1790856000000, 1790856000000);",
            )
        })
        .await
        .unwrap();
    legacy.close().await.unwrap();

    let upgraded = Db::open(&path).await.unwrap();
    let events = CalendarService::new(upgraded.clone()).list(Default::default()).await.unwrap();
    assert_eq!(events.len(), 2);
    let day = &events[0];
    let timed = &events[1];
    assert_eq!((day.id.as_str(), day.title.as_str(), day.all_day), ("day", "Holiday", true));
    assert_eq!((timed.id.as_str(), timed.location.as_deref(), timed.color.as_str()), ("timed", Some("GRU"), "#22c55e"));
    assert_eq!(timed.linked_task_ids, ["t1"]);
    assert_eq!(timed.linked_thought_ids, ["th1"]);
    for event in &events {
        assert_eq!(event.source, EventSource::Local);
        assert!(event.external_id.is_none() && event.external_calendar_id.is_none() && event.external_etag.is_none());
        assert!(event.external_updated_at.is_none() && event.external_url.is_none());
        assert!(event.recurring_event_id.is_none() && event.sync_state.is_none());
    }
    upgraded.close().await.unwrap();
}

#[tokio::test]
async fn unique_index_refuses_a_second_row_for_the_same_google_event_but_allows_local_rows() {
    let (db, _dir) = memory_db().await;
    let result = db
        .call(|conn| {
            insert_row(conn, google_event("g1", "First"))?;
            insert_row(conn, NewCalendarEvent { id: "l1".into(), title: "Local 1".into(), ..Default::default() })?;
            insert_row(conn, NewCalendarEvent { id: "l2".into(), title: "Local 2".into(), ..Default::default() })?;
            let other_calendar = NewCalendarEvent {
                id: "other".into(),
                external_calendar_id: Some("you@example.com".into()),
                ..google_event("g1", "Other calendar")
            };
            insert_row(conn, other_calendar)?;
            Ok(insert_row(conn, NewCalendarEvent { id: "dup".into(), ..google_event("g1", "Duplicate") }).is_err())
        })
        .await
        .unwrap();
    assert!(result, "a second row with the same (external_calendar_id, external_id) must be refused");
    db.close().await.unwrap();
}

#[tokio::test]
async fn upserts_a_google_event_without_duplicating_it() {
    let (db, _dir) = memory_db().await;
    let (created, updated, found, missing, count, kept) = db
        .call(|conn| {
            let created = upsert_external(conn, google_event("g1", "Planning"))?;
            let changed = NewCalendarEvent {
                id: "ignored".into(),
                title: "Planning v2".into(),
                external_etag: Some("\"2\"".into()),
                sync_state: Some(SyncState::PendingUpdate),
                ..google_event("g1", "Planning v2")
            };
            let updated = upsert_external(conn, changed)?;
            let found = find_by_external(conn, CALENDAR, "g1")?;
            let missing = find_by_external(conn, CALENDAR, "nope")?;
            let count: i64 = conn.query_row("SELECT count(*) FROM calendar_events", [], |row| row.get(0))?;
            let kept: CalendarEvent =
                conn.query_row("SELECT * FROM calendar_events WHERE id = ?", [&created.id], CalendarEvent::from_row)?;
            Ok((created, updated, found, missing, count, kept))
        })
        .await
        .unwrap();
    assert_eq!(count, 1);
    assert_eq!(updated.id, created.id);
    assert_eq!(updated.title, "Planning v2");
    assert_eq!(updated.external_etag.as_deref(), Some("\"2\""));
    assert_eq!(updated.sync_state, Some(SyncState::PendingUpdate));
    assert_eq!(updated.source, EventSource::Google);
    assert_eq!(found.as_ref(), Some(&kept));
    assert!(missing.is_none());
    db.close().await.unwrap();
}

#[tokio::test]
async fn upsert_requires_the_google_ids() {
    let (db, _dir) = memory_db().await;
    let refused = db
        .call(|conn| Ok(upsert_external(conn, NewCalendarEvent { id: "x".into(), ..Default::default() }).is_err()))
        .await
        .unwrap();
    assert!(refused);
    db.close().await.unwrap();
}

#[rstest]
#[case(EventSource::Local, "local")]
#[case(EventSource::Google, "google")]
fn event_source_round_trips(#[case] value: EventSource, #[case] text: &str) {
    assert_eq!(value.as_str(), text);
    assert_eq!(EventSource::parse(text), Some(value));
}

#[rstest]
#[case(SyncState::PendingCreate, "pending_create")]
#[case(SyncState::PendingUpdate, "pending_update")]
#[case(SyncState::PendingDelete, "pending_delete")]
fn sync_state_round_trips(#[case] value: SyncState, #[case] text: &str) {
    assert_eq!(value.as_str(), text);
    assert_eq!(SyncState::parse(text), Some(value));
}

#[tokio::test]
async fn rejects_unknown_values_when_reading() {
    assert_eq!(EventSource::parse("outlook"), None);
    assert_eq!(SyncState::parse("done"), None);
    let (db, _dir) = memory_db().await;
    let failed = db
        .call(|conn| {
            insert_row(conn, NewCalendarEvent { id: "e".into(), title: "T".into(), ..Default::default() })?;
            conn.execute("UPDATE calendar_events SET source = 'outlook'", [])?;
            Ok(conn.query_row("SELECT * FROM calendar_events", [], CalendarEvent::from_row).is_err())
        })
        .await
        .unwrap();
    assert!(failed);
    db.close().await.unwrap();
}

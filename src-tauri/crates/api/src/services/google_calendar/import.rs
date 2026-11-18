//! Writes one listing into `calendar_events`, inside the sync's transaction.

use std::collections::HashSet;

use chrono::Local;
use rusqlite::{Connection, params};

use super::{EventWindow, SyncResult};
use crate::db::columns::{Timestamp, to_millis};
use crate::db::schema::calendar::{CalendarEvent, EventSource, NewCalendarEvent, find_by_external, upsert_external};
use crate::services::google_calendar_client::{GoogleEvent, GoogleEventFields, from_google};

/// Stores `events` as the state of `window`: inserts and updates the events,
/// removes the cancelled ones and the stored ones Google no longer lists.
/// Rows with a change waiting for Google (`sync_state`) are left alone.
pub fn apply(
    conn: &Connection,
    calendar_id: &str,
    window: EventWindow,
    now: Timestamp,
    events: &[GoogleEvent],
) -> rusqlite::Result<SyncResult> {
    let mut result = SyncResult::default();
    let mut returned = HashSet::new();
    for event in events {
        let fields = from_google(event, &Local);
        returned.insert(fields.id.clone());
        let existing = find_by_external(conn, calendar_id, &fields.id)?;
        if existing.as_ref().is_some_and(|row| row.sync_state.is_some()) {
            continue;
        }
        if fields.cancelled {
            if let Some(row) = existing.filter(|row| row.deleted_at.is_none()) {
                soft_delete(conn, &row.id, now)?;
                result.removed += 1;
            }
            continue;
        }
        let Some(row) = new_row(calendar_id, &fields, now) else { continue };
        match existing {
            None => {
                upsert_external(conn, row)?;
                result.imported += 1;
            }
            Some(stored) if is_unchanged(&stored, &row) => {}
            Some(_) => {
                upsert_external(conn, row)?;
                result.updated += 1;
            }
        }
    }
    result.removed += remove_missing(conn, calendar_id, window, now, &returned)?;
    Ok(result)
}

fn new_row(calendar_id: &str, fields: &GoogleEventFields, now: Timestamp) -> Option<NewCalendarEvent> {
    Some(NewCalendarEvent {
        id: crate::db::columns::new_id(),
        title: fields.title.clone().unwrap_or_default(),
        description: fields.description.clone(),
        start_at: fields.start_at?,
        end_at: fields.end_at?,
        all_day: Some(fields.all_day),
        location: fields.location.clone(),
        color: Some(fields.color.clone()),
        updated_at: Some(now),
        source: Some(EventSource::Google),
        external_id: Some(fields.id.clone()),
        external_calendar_id: Some(calendar_id.to_owned()),
        external_etag: fields.etag.clone(),
        external_updated_at: fields.updated,
        external_url: fields.html_link.clone(),
        recurring_event_id: fields.recurring_event_id.clone(),
        ..Default::default()
    })
}

/// Whether writing `row` over `stored` would change nothing the user can see.
fn is_unchanged(stored: &CalendarEvent, row: &NewCalendarEvent) -> bool {
    stored.deleted_at.is_none()
        && stored.title == row.title
        && stored.description == row.description
        && stored.start_at == row.start_at
        && stored.end_at == row.end_at
        && Some(stored.all_day) == row.all_day
        && stored.location == row.location
        && stored.external_etag == row.external_etag
        && stored.external_updated_at == row.external_updated_at
        && stored.external_url == row.external_url
        && stored.recurring_event_id == row.recurring_event_id
}

fn soft_delete(conn: &Connection, id: &str, now: Timestamp) -> rusqlite::Result<()> {
    conn.execute("UPDATE calendar_events SET deleted_at = ?1 WHERE id = ?2", params![to_millis(now), id])?;
    Ok(())
}

/// Soft-deletes the Google events that start in `window` and weren't in the listing.
fn remove_missing(
    conn: &Connection,
    calendar_id: &str,
    window: EventWindow,
    now: Timestamp,
    returned: &HashSet<String>,
) -> rusqlite::Result<usize> {
    let mut statement = conn.prepare(
        "SELECT * FROM calendar_events WHERE source = 'google' AND deleted_at IS NULL AND sync_state IS NULL AND external_calendar_id = ?1 AND start_at >= ?2 AND start_at < ?3",
    )?;
    let stale = statement
        .query_map(
            params![calendar_id, to_millis(window.time_min), to_millis(window.time_max)],
            CalendarEvent::from_row,
        )?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut removed = 0;
    for row in stale.iter().filter(|row| row.external_id.as_ref().is_some_and(|id| !returned.contains(id))) {
        soft_delete(conn, &row.id, now)?;
        removed += 1;
    }
    Ok(removed)
}

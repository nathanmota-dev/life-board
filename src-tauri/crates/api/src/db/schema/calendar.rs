use crate::clock;
use serde::Serialize;

use rusqlite::{OptionalExtension, params};

use crate::db::columns::{
    Timestamp, get_bool, get_json_list, get_timestamp, get_timestamp_opt, js_date, js_date_opt, string_enum, to_bool,
    to_json_list, to_millis,
};
use crate::db::{Db, DbError};

string_enum! {
    /// Where an event was born; it never changes.
    pub enum EventSource { Local = "local", Google = "google" }
}

string_enum! {
    /// The change of a linked event still waiting to be sent to Google.
    pub enum SyncState { PendingCreate = "pending_create", PendingUpdate = "pending_update", PendingDelete = "pending_delete" }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarEvent {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    #[serde(with = "js_date")]
    pub start_at: Timestamp,
    #[serde(with = "js_date")]
    pub end_at: Timestamp,
    pub all_day: bool,
    pub location: Option<String>,
    pub color: String,
    pub linked_task_ids: Vec<String>,
    pub linked_thought_ids: Vec<String>,
    #[serde(with = "js_date")]
    pub created_at: Timestamp,
    #[serde(with = "js_date")]
    pub updated_at: Timestamp,
    #[serde(with = "js_date_opt")]
    pub deleted_at: Option<Timestamp>,
    pub source: EventSource,
    pub external_url: Option<String>,
    pub recurring_event_id: Option<String>,
    pub sync_state: Option<SyncState>,
    /// Google event id; internal, never serialized.
    #[serde(skip)]
    pub external_id: Option<String>,
    /// Google calendar id; internal, never serialized.
    #[serde(skip)]
    pub external_calendar_id: Option<String>,
    /// Last `etag` seen in Google; internal, never serialized.
    #[serde(skip)]
    pub external_etag: Option<String>,
    /// Google's `updated`; internal, never serialized.
    #[serde(skip, with = "js_date_opt")]
    pub external_updated_at: Option<Timestamp>,
}

/// Defaults: `all_day` false, `color` "#3b82f6", empty link lists, `source` local, timestamps now.
#[derive(Debug, Clone, Default)]
pub struct NewCalendarEvent {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub start_at: Timestamp,
    pub end_at: Timestamp,
    pub all_day: Option<bool>,
    pub location: Option<String>,
    pub color: Option<String>,
    pub linked_task_ids: Option<Vec<String>>,
    pub linked_thought_ids: Option<Vec<String>>,
    pub created_at: Option<Timestamp>,
    pub updated_at: Option<Timestamp>,
    pub deleted_at: Option<Timestamp>,
    pub source: Option<EventSource>,
    pub external_id: Option<String>,
    pub external_calendar_id: Option<String>,
    pub external_etag: Option<String>,
    pub external_updated_at: Option<Timestamp>,
    pub external_url: Option<String>,
    pub recurring_event_id: Option<String>,
    pub sync_state: Option<SyncState>,
}

impl CalendarEvent {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            title: row.get("title")?,
            description: row.get("description")?,
            start_at: get_timestamp(row, "start_at")?,
            end_at: get_timestamp(row, "end_at")?,
            all_day: get_bool(row, "all_day")?,
            location: row.get("location")?,
            color: row.get("color")?,
            linked_task_ids: get_json_list(row, "linked_task_ids")?,
            linked_thought_ids: get_json_list(row, "linked_thought_ids")?,
            created_at: get_timestamp(row, "created_at")?,
            updated_at: get_timestamp(row, "updated_at")?,
            deleted_at: get_timestamp_opt(row, "deleted_at")?,
            source: row.get("source")?,
            external_url: row.get("external_url")?,
            recurring_event_id: row.get("recurring_event_id")?,
            sync_state: row.get("sync_state")?,
            external_id: row.get("external_id")?,
            external_calendar_id: row.get("external_calendar_id")?,
            external_etag: row.get("external_etag")?,
            external_updated_at: get_timestamp_opt(row, "external_updated_at")?,
        })
    }
}

/// Inserts one row with the column defaults filled in and returns it.
pub fn insert_row(conn: &rusqlite::Connection, row: NewCalendarEvent) -> rusqlite::Result<CalendarEvent> {
    let now = clock::now();
    conn.query_row(
        "INSERT INTO calendar_events (id, title, description, start_at, end_at, all_day, location, color, linked_task_ids, linked_thought_ids, created_at, updated_at, deleted_at, source, external_id, external_calendar_id, external_etag, external_updated_at, external_url, recurring_event_id, sync_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *",
        params![
            row.id,
            row.title,
            row.description,
            to_millis(row.start_at),
            to_millis(row.end_at),
            to_bool(row.all_day.unwrap_or(false)),
            row.location,
            row.color.unwrap_or_else(|| DEFAULT_COLOR.to_owned()),
            to_json_list(&row.linked_task_ids.unwrap_or_default()),
            to_json_list(&row.linked_thought_ids.unwrap_or_default()),
            to_millis(row.created_at.unwrap_or(now)),
            to_millis(row.updated_at.unwrap_or(now)),
            row.deleted_at.map(to_millis),
            row.source.unwrap_or(EventSource::Local),
            row.external_id,
            row.external_calendar_id,
            row.external_etag,
            row.external_updated_at.map(to_millis),
            row.external_url,
            row.recurring_event_id,
            row.sync_state,
        ],
        CalendarEvent::from_row,
    )
}

/// The event linked to a Google event, deleted or not.
pub fn find_by_external(
    conn: &rusqlite::Connection,
    calendar_id: &str,
    external_id: &str,
) -> rusqlite::Result<Option<CalendarEvent>> {
    conn.query_row(
        "SELECT * FROM calendar_events WHERE external_calendar_id = ? AND external_id = ?",
        params![calendar_id, external_id],
        CalendarEvent::from_row,
    )
    .optional()
}

/// Inserts the event, or updates the one already linked to the same
/// `(external_calendar_id, external_id)`. Both must be set. An update keeps the
/// id, `source`, `color`, links and `created_at` of the stored row.
pub fn upsert_external(conn: &rusqlite::Connection, row: NewCalendarEvent) -> rusqlite::Result<CalendarEvent> {
    let (Some(calendar_id), Some(external_id)) = (row.external_calendar_id.clone(), row.external_id.clone()) else {
        return Err(rusqlite::Error::InvalidParameterName(
            "external_calendar_id and external_id are required".to_owned(),
        ));
    };
    let Some(existing) = find_by_external(conn, &calendar_id, &external_id)? else {
        return insert_row(conn, row);
    };
    conn.query_row(
        "UPDATE calendar_events SET title = ?, description = ?, start_at = ?, end_at = ?, all_day = ?, location = ?, updated_at = ?, deleted_at = ?, external_etag = ?, external_updated_at = ?, external_url = ?, recurring_event_id = ?, sync_state = ? WHERE id = ? RETURNING *",
        params![
            row.title,
            row.description,
            to_millis(row.start_at),
            to_millis(row.end_at),
            to_bool(row.all_day.unwrap_or(false)),
            row.location,
            to_millis(row.updated_at.unwrap_or_else(clock::now)),
            row.deleted_at.map(to_millis),
            row.external_etag,
            row.external_updated_at.map(to_millis),
            row.external_url,
            row.recurring_event_id,
            row.sync_state,
            existing.id,
        ],
        CalendarEvent::from_row,
    )
}

pub const DEFAULT_COLOR: &str = "#3b82f6";

pub async fn insert(db: &Db, rows: Vec<NewCalendarEvent>) -> Result<(), DbError> {
    db.call(move |conn| {
        let tx = conn.transaction()?;
        for row in rows {
            insert_row(&tx, row)?;
        }
        tx.commit()
    })
    .await
}

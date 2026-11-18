use serde::{Deserialize, Serialize};

use crate::db::columns::Timestamp;

/// `calendars.get("primary")`: its `id` is the account's email.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrimaryCalendar {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub time_zone: Option<String>,
}

/// The span a listing covers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EventWindow {
    pub time_min: Timestamp,
    pub time_max: Timestamp,
}

/// One event of one calendar, as a patch or a delete addresses it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EventRef<'a> {
    pub calendar_id: &'a str,
    pub event_id: &'a str,
}

/// `start` or `end` of an event: `date` for an all-day event (the end is
/// exclusive), `dateTime` (RFC 3339) for a timed one.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleEventTime {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub date_time: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub time_zone: Option<String>,
}

/// The subset of an [Events resource](https://developers.google.com/workspace/calendar/api/v3/reference/events)
/// the sync uses. Everything but `id` may be missing: a cancelled event comes with
/// little more than its `id` and `status`.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleEvent {
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub etag: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub start: Option<GoogleEventTime>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub end: Option<GoogleEventTime>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recurring_event_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub html_link: Option<String>,
}

/// `start` or `end` as it is sent. Both keys always go out, the unused one as
/// `null`, so a `PATCH` can turn a timed event into an all-day one and back.
/// No `timeZone`: `dateTime` carries its offset.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleEventTimeBody {
    pub date: Option<String>,
    pub date_time: Option<String>,
}

/// The body of an insert or a patch. `null` clears a field, so an emptied
/// description or location is cleared in Google too; a missing `start` or `end`
/// is left out and keeps Google's value.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleEventBody {
    pub summary: Option<String>,
    pub description: Option<String>,
    pub location: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub start: Option<GoogleEventTimeBody>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub end: Option<GoogleEventTimeBody>,
    pub color_id: Option<String>,
}

/// A Google event in Life Board's terms (see [`super::from_google`]).
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct GoogleEventFields {
    pub id: String,
    /// `None` when Google has no title, or an empty one.
    pub title: Option<String>,
    pub description: Option<String>,
    pub location: Option<String>,
    /// `None` only when Google sent no start, as for a cancelled event.
    pub start_at: Option<Timestamp>,
    /// For an all-day event, local midnight of its last day, like the calendar view.
    pub end_at: Option<Timestamp>,
    pub all_day: bool,
    /// `#rrggbb`.
    pub color: String,
    pub etag: Option<String>,
    pub updated: Option<Timestamp>,
    /// Set on each occurrence of a recurring event.
    pub recurring_event_id: Option<String>,
    pub html_link: Option<String>,
    pub cancelled: bool,
}

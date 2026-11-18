//! Pure conversions between Google's events and Life Board's.
//!
//! All-day events: Google sends `start.date` and an **exclusive** `end.date`. Life
//! Board stores instants and, like the calendar view and the event form, keeps an
//! all-day event from local midnight of its first day to local midnight of its
//! **last** day (`2026-10-12`–`2026-10-13` in Google is one day, stored with
//! `startAt == endAt`). Dates are read as days of the local time zone, whatever
//! the Google calendar's zone is, so an event always covers the same days.

use std::fmt::Display;

use chrono::{DateTime, Duration, NaiveDate, NaiveTime, SecondsFormat, TimeZone};

use super::types::{GoogleEvent, GoogleEventBody, GoogleEventFields, GoogleEventTime, GoogleEventTimeBody};
use crate::db::columns::Timestamp;
use crate::db::schema::calendar::DEFAULT_COLOR;
use crate::dto::common::zoned_to_utc;

/// Google's 11 event colors (`colorId` "1"–"11"), as its calendar shows them.
pub const GOOGLE_EVENT_COLORS: [(&str, &str); 11] = [
    ("1", "#7986cb"),  // Lavender
    ("2", "#33b679"),  // Sage
    ("3", "#8e24aa"),  // Grape
    ("4", "#e67c73"),  // Flamingo
    ("5", "#f6bf26"),  // Banana
    ("6", "#f4511e"),  // Tangerine
    ("7", "#039be5"),  // Peacock
    ("8", "#616161"),  // Graphite
    ("9", "#3f51b5"),  // Blueberry
    ("10", "#0b8043"), // Basil
    ("11", "#d50000"), // Tomato
];

/// The hex of a `colorId`, or [`DEFAULT_COLOR`] when it is missing or unknown.
pub fn color_from_google(color_id: Option<&str>) -> String {
    color_id
        .and_then(|id| GOOGLE_EVENT_COLORS.iter().find(|(known, _)| *known == id))
        .map_or(DEFAULT_COLOR, |(_, hex)| hex)
        .to_owned()
}

/// The `colorId` nearest to a `#rrggbb` color by RGB distance (like `colorName`
/// in `web/src/lib/calendar.ts`); `None` when it isn't such a color.
pub fn color_to_google(hex: &str) -> Option<String> {
    let target = rgb(hex)?;
    GOOGLE_EVENT_COLORS
        .iter()
        .filter_map(|(id, known)| rgb(known).map(|color| (*id, distance(target, color))))
        .min_by_key(|(_, distance)| *distance)
        .map(|(id, _)| id.to_owned())
}

fn rgb(hex: &str) -> Option<[i32; 3]> {
    let digits =
        hex.strip_prefix('#').filter(|digits| digits.len() == 6 && digits.bytes().all(|b| b.is_ascii_hexdigit()))?;
    let channel = |at: usize| u8::from_str_radix(&digits[at..at + 2], 16).map(i32::from).ok();
    Some([channel(0)?, channel(2)?, channel(4)?])
}

fn distance(a: [i32; 3], b: [i32; 3]) -> i32 {
    a.iter().zip(b).map(|(x, y)| (x - y).pow(2)).sum()
}

fn text(value: Option<&String>) -> Option<String> {
    value.filter(|text| !text.trim().is_empty()).cloned()
}

fn instant(value: Option<&String>) -> Option<Timestamp> {
    DateTime::parse_from_rfc3339(value?).ok().map(|value| value.to_utc())
}

fn day(time: Option<&GoogleEventTime>) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(time?.date.as_deref()?, "%Y-%m-%d").ok()
}

fn midnight<Tz: TimeZone>(zone: &Tz, day: NaiveDate) -> Option<Timestamp> {
    zoned_to_utc(zone, day.and_time(NaiveTime::MIN))
}

/// The start and end instants, and whether the event is all-day.
fn times<Tz: TimeZone>(event: &GoogleEvent, zone: &Tz) -> (Option<Timestamp>, Option<Timestamp>, bool) {
    let start = event.start.as_ref();
    if let Some(first) = day(start).filter(|_| start.is_some_and(|start| start.date_time.is_none())) {
        // The exclusive end's day before is the last day; never before the first.
        let last = day(event.end.as_ref()).and_then(|end| end.pred_opt()).filter(|last| *last > first);
        let start_at = midnight(zone, first);
        return (start_at, last.and_then(|last| midnight(zone, last)).or(start_at), true);
    }
    let start_at = instant(start.and_then(|start| start.date_time.as_ref()));
    let end_at = instant(event.end.as_ref().and_then(|end| end.date_time.as_ref())).or(start_at);
    (start_at, end_at, false)
}

/// A Google event in Life Board's terms, with all-day dates read in `local_tz`.
pub fn from_google<Tz: TimeZone>(event: &GoogleEvent, local_tz: &Tz) -> GoogleEventFields {
    let (start_at, end_at, all_day) = times(event, local_tz);
    GoogleEventFields {
        id: event.id.clone(),
        title: text(event.summary.as_ref()),
        description: text(event.description.as_ref()),
        location: text(event.location.as_ref()),
        start_at,
        end_at,
        all_day,
        color: color_from_google(event.color_id.as_deref()),
        etag: event.etag.clone(),
        updated: instant(event.updated.as_ref()),
        recurring_event_id: event.recurring_event_id.clone(),
        html_link: event.html_link.clone(),
        cancelled: event.status.as_deref() == Some("cancelled"),
    }
}

fn date_body(day: NaiveDate) -> GoogleEventTimeBody {
    GoogleEventTimeBody { date: Some(day.format("%Y-%m-%d").to_string()), date_time: None }
}

fn date_time_body<Tz: TimeZone>(zone: &Tz, at: Timestamp) -> GoogleEventTimeBody
where
    Tz::Offset: Display,
{
    let text = at.with_timezone(zone).to_rfc3339_opts(SecondsFormat::Secs, false);
    GoogleEventTimeBody { date: None, date_time: Some(text) }
}

/// The days of an all-day event in `zone`: its first day and the exclusive end.
fn all_day_dates<Tz: TimeZone>(
    zone: &Tz,
    start_at: Option<Timestamp>,
    end_at: Option<Timestamp>,
) -> [Option<NaiveDate>; 2] {
    let local_day = |at: Timestamp| at.with_timezone(zone).date_naive();
    let first = start_at.map(local_day);
    let last = end_at.map(local_day).max(first);
    [first, last.and_then(|last| last.checked_add_signed(Duration::days(1)))]
}

/// The body that writes `fields` to Google, with all-day days and `dateTime`
/// offsets taken from `local_tz`. Only the fields both sides keep are sent.
pub fn to_google<Tz: TimeZone>(fields: &GoogleEventFields, local_tz: &Tz) -> GoogleEventBody
where
    Tz::Offset: Display,
{
    let (start, end) = if fields.all_day {
        let [first, end] = all_day_dates(local_tz, fields.start_at, fields.end_at);
        (first.map(date_body), end.map(date_body))
    } else {
        let body = |at: Option<Timestamp>| at.map(|at| date_time_body(local_tz, at));
        (body(fields.start_at), body(fields.end_at))
    };
    GoogleEventBody {
        summary: fields.title.clone(),
        description: fields.description.clone(),
        location: fields.location.clone(),
        start,
        end,
        color_id: color_to_google(&fields.color),
    }
}

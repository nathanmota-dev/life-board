use super::*;
use crate::db::columns::Timestamp;
use chrono::{Local, LocalResult, NaiveDate, NaiveDateTime, NaiveTime, TimeZone, Utc};
use serde_json::Value;

/// `z.coerce.date()`: `new Date(value)` must be a valid date.
pub fn date(ctx: &mut Ctx, value: &Value, path: &str) -> Option<Timestamp> {
    let parsed = match value {
        Value::String(text) => parse_js_date(text),
        Value::Number(number) => number.as_f64().and_then(millis_to_timestamp),
        Value::Null => millis_to_timestamp(0.0),
        Value::Bool(flag) => millis_to_timestamp(f64::from(u8::from(*flag))),
        Value::Array(_) | Value::Object(_) => None,
    };
    parsed.or_else(|| ctx.issue(path, "Invalid input: expected date, received Date"))
}

fn millis_to_timestamp(millis: f64) -> Option<Timestamp> {
    // `new Date(ms)` keeps ±8.64e15 ms and truncates the fraction.
    if !millis.is_finite() || millis.abs() > 8.64e15 {
        return None;
    }
    #[allow(clippy::cast_possible_truncation)]
    Utc.timestamp_millis_opt(millis.trunc() as i64).single()
}

/// The date strings `new Date(text)` reads the same way in every engine: ISO 8601
/// dates (UTC) and date-times (with `Z` or an offset; local time without one).
pub fn parse_js_date(text: &str) -> Option<Timestamp> {
    let text = text.trim();
    if let Ok(value) = chrono::DateTime::parse_from_rfc3339(text) {
        return Some(value.to_utc());
    }
    let date_only = match text.len() {
        4 => NaiveDate::parse_from_str(&format!("{text}-01-01"), "%Y-%m-%d").ok(),
        7 => NaiveDate::parse_from_str(&format!("{text}-01"), "%Y-%m-%d").ok(),
        10 => NaiveDate::parse_from_str(text, "%Y-%m-%d").ok(),
        _ => None,
    };
    if let Some(day) = date_only.filter(|_| text.bytes().all(|b| b.is_ascii_digit() || b == b'-')) {
        return Some(day.and_time(NaiveTime::MIN).and_utc());
    }
    let upper = text.to_ascii_uppercase();
    const NAIVE: [&str; 4] = ["%Y-%m-%dT%H:%M:%S%.f", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M:%S%.f", "%Y-%m-%d %H:%M"];
    if let Some(utc) = upper.strip_suffix('Z') {
        return NAIVE
            .iter()
            .find_map(|format| NaiveDateTime::parse_from_str(utc, format).ok())
            .map(|naive| naive.and_utc());
    }
    for format in ["%Y-%m-%dT%H:%M:%S%.f%:z", "%Y-%m-%dT%H:%M%:z"] {
        if let Ok(value) = chrono::DateTime::parse_from_str(&upper, format) {
            return Some(value.to_utc());
        }
    }
    NAIVE.iter().find_map(|format| NaiveDateTime::parse_from_str(&upper, format).ok()).and_then(local_to_utc)
}

/// A wall-clock time in the local zone; like `Date`, the earlier instant when it
/// repeats and the instant one hour later when it falls in a DST gap.
pub fn local_to_utc(naive: NaiveDateTime) -> Option<Timestamp> {
    match Local.from_local_datetime(&naive) {
        LocalResult::Single(value) | LocalResult::Ambiguous(value, _) => Some(value.to_utc()),
        LocalResult::None => {
            Local.from_local_datetime(&(naive + chrono::Duration::hours(1))).earliest().map(|value| value.to_utc())
        }
    }
}

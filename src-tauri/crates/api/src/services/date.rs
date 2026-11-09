//! Local calendar days, using the process time zone like `Date`.

use chrono::{Datelike, Duration, Local, NaiveDate, NaiveTime};

use crate::db::columns::Timestamp;
use crate::dto::common::local_to_utc;

/// Local calendar day as `YYYY-MM-DD` (`toDayKey`; pass `clock::now()` for today).
pub fn to_day_key(date: Timestamp) -> String {
    date.with_timezone(&Local).format("%Y-%m-%d").to_string()
}

/// Local midnight of a `YYYY-MM-DD` day; `None` when it isn't a day key.
/// Like `new Date(year, month - 1, day)`, an out-of-range month or day rolls over.
pub fn from_day_key(day: &str) -> Option<Timestamp> {
    let mut parts = day.split('-');
    let (year, month, date) = (parts.next()?, parts.next()?, parts.next()?);
    if parts.next().is_some() {
        return None;
    }
    let year: i32 = year.parse().ok()?;
    let month: i64 = month.parse().ok()?;
    let date: i64 = date.parse().ok()?;
    let months = i64::from(year) * 12 + month - 1;
    let first = NaiveDate::from_ymd_opt(
        i32::try_from(months.div_euclid(12)).ok()?,
        u32::try_from(months.rem_euclid(12) + 1).ok()?,
        1,
    )?;
    let naive = first.checked_add_signed(Duration::days(date - 1))?;
    local_to_utc(naive.and_time(NaiveTime::MIN))
}

/// The same local time `days` calendar days later (`setDate(getDate() + days)`).
pub fn add_days(date: Timestamp, days: i64) -> Timestamp {
    let local = date.with_timezone(&Local).naive_local();
    local.checked_add_signed(Duration::days(days)).and_then(local_to_utc).unwrap_or(date)
}

/// Local midnight of the Sunday that starts the week containing `date`.
pub fn start_of_week(date: Timestamp) -> Timestamp {
    let day = date.with_timezone(&Local).date_naive();
    let sunday = day - Duration::days(i64::from(day.weekday().num_days_from_sunday()));
    local_to_utc(sunday.and_time(NaiveTime::MIN)).unwrap_or(date)
}

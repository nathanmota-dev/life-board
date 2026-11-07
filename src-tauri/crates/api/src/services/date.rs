//! Local calendar days (`date.service.ts`), using the process time zone like `Date`.

use crate::db::columns::Timestamp;

/// Local calendar day as `YYYY-MM-DD` (`toDayKey`; pass `Utc::now()` for today).
pub fn to_day_key(date: Timestamp) -> String {
    pending!(51, date)
}

/// Local midnight of a `YYYY-MM-DD` day; `None` when it isn't a day key.
pub fn from_day_key(day: &str) -> Option<Timestamp> {
    pending!(51, day)
}

/// The same local time `days` calendar days later (`setDate(getDate() + days)`).
pub fn add_days(date: Timestamp, days: i64) -> Timestamp {
    pending!(51, date, days)
}

/// Local midnight of the Sunday that starts the week containing `date`.
pub fn start_of_week(date: Timestamp) -> Timestamp {
    pending!(51, date)
}

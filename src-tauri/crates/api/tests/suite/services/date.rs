use chrono::{Datelike, Local, Weekday};
use life_board_api::services::date::{add_days, from_day_key, start_of_week, to_day_key};

use crate::common::{local, local_day, now};

fn is_day_key(text: &str) -> bool {
    let bytes = text.as_bytes();
    bytes.len() == 10
        && bytes.iter().enumerate().all(|(i, b)| if i == 4 || i == 7 { *b == b'-' } else { b.is_ascii_digit() })
}

#[test]
#[ignore = "pending #51"]
fn converts_between_dates_and_local_day_keys() {
    assert_eq!(to_day_key(local(2026, 1, 5, 23, 59)), "2026-01-05");
    assert_eq!(from_day_key("2026-01-05"), Some(local_day(2026, 1, 5)));
    assert!(is_day_key(&to_day_key(now())));
}

#[test]
#[ignore = "pending #51"]
fn adds_days_across_month_boundaries() {
    assert_eq!(to_day_key(add_days(local_day(2026, 1, 31), 1)), "2026-02-01");
    assert_eq!(to_day_key(add_days(local_day(2026, 3, 1), -1)), "2026-02-28");
}

#[test]
#[ignore = "pending #51"]
fn finds_the_sunday_that_starts_the_week() {
    assert_eq!(start_of_week(local(2026, 10, 17, 15, 0)), local_day(2026, 10, 11));
    assert_eq!(start_of_week(local(2026, 10, 11, 1, 0)), local_day(2026, 10, 11));
    assert_eq!(start_of_week(now()).with_timezone(&Local).weekday(), Weekday::Sun);
}

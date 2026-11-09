//! The API's wall clock. Production reads the system time; the `e2e` feature
//! makes the sidecar follow the fixed start and offset of the Playwright suite.

use chrono::{DateTime, Utc};

#[cfg(not(feature = "e2e"))]
pub fn now() -> DateTime<Utc> {
    Utc::now()
}

#[cfg(feature = "e2e")]
pub fn now() -> DateTime<Utc> {
    use std::sync::LazyLock;
    use std::time::Instant;

    static ORIGIN: LazyLock<Instant> = LazyLock::new(Instant::now);
    let Some(epoch) = env_millis() else { return Utc::now() };
    let offset = std::env::var("LIFE_BOARD_E2E_CLOCK")
        .ok()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .and_then(|text| text.trim().parse::<i64>().ok())
        .unwrap_or(0);
    let elapsed = i64::try_from(ORIGIN.elapsed().as_millis()).unwrap_or(0);
    DateTime::from_timestamp_millis(epoch + elapsed + offset).unwrap_or_else(Utc::now)
}

#[cfg(feature = "e2e")]
fn env_millis() -> Option<i64> {
    std::env::var("LIFE_BOARD_E2E_EPOCH").ok()?.parse().ok()
}

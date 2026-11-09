//! Microbenchmark read by `scripts/run-rust-benchmark.js` through the `day_key` id.

use std::hint::black_box;

use chrono::DateTime;
use criterion::{Criterion, criterion_group, criterion_main};
use life_board_api::db::columns::Timestamp;
use life_board_api::services::date::{add_days, to_day_key};

const DATES: i64 = 10_000;
const DISTINCT_DAYS: i64 = 730;
const JANUARY_2026_MS: i64 = 1_767_272_400_000;

fn dates() -> Vec<Timestamp> {
    let start = DateTime::from_timestamp_millis(JANUARY_2026_MS).unwrap_or_default();
    (0..DATES).map(|index| add_days(start, index % DISTINCT_DAYS)).collect()
}

fn day_key(criterion: &mut Criterion) {
    let dates = dates();
    criterion.bench_function("day_key", |bencher| {
        bencher.iter(|| {
            for date in &dates {
                black_box(to_day_key(*date));
            }
        });
    });
}

criterion_group!(benches, day_key);
criterion_main!(benches);

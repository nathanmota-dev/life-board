use std::collections::HashSet;

use life_board_api::dto::habits::{
    CreateHabitBody, ListHabitLogsQuery, LogHabitBody, SetHabitLogBody, UpdateHabitBody,
};
use life_board_api::services::date::to_day_key;
use life_board_api::services::habits::{HabitDayCount, HabitLogEntry, HabitsService, get_streak};
use serde_json::json;

use crate::common::{
    TestDb, assert_bad_request, assert_match, assert_not_found, local, local_day, now, test_db, to_json,
};

async fn setup() -> (TestDb, HabitsService) {
    let ctx = test_db().await;
    let service = HabitsService::new(ctx.db.clone());
    (ctx, service)
}

fn days(values: &[&str]) -> HashSet<String> {
    values.iter().map(|value| (*value).to_owned()).collect()
}

fn habit(name: &str, target: i64) -> CreateHabitBody {
    CreateHabitBody { name: name.into(), target, ..Default::default() }
}

fn delta(delta: i64) -> LogHabitBody {
    LogHabitBody { delta, day: None }
}

fn delta_on(delta: i64, day: &str) -> LogHabitBody {
    LogHabitBody { delta, day: Some(day.into()) }
}

fn entry(habit_id: &str, day: &str, count: i64, target: Option<i64>) -> HabitLogEntry {
    HabitLogEntry { habit_id: habit_id.into(), day: day.into(), count, target }
}

fn of_habit(habit_id: &str) -> ListHabitLogsQuery {
    ListHabitLogsQuery { habit_id: Some(habit_id.into()), ..Default::default() }
}

#[test]
fn counts_consecutive_days_ignoring_an_unfinished_today() {
    let today = local_day(2026, 10, 17);
    let done = days(&["2026-10-14", "2026-10-15", "2026-10-16"]);
    assert_eq!(get_streak(&done, today), 3);
    let mut with_today = done.clone();
    with_today.insert("2026-10-17".into());
    assert_eq!(get_streak(&with_today, today), 4);
}

#[test]
fn breaks_on_a_missed_day() {
    let today = local_day(2026, 10, 17);
    assert_eq!(get_streak(&days(&["2026-10-14", "2026-10-16"]), today), 1);
    assert_eq!(get_streak(&HashSet::new(), today), 0);
    assert_eq!(get_streak(&days(&[&to_day_key(now())]), now()), 1);
}

#[tokio::test]
async fn logs_progress_never_going_below_zero() {
    let (_ctx, service) = setup().await;
    let water = service.create(CreateHabitBody { unit: Some("glasses".into()), ..habit("Water", 8) }).await.unwrap();

    assert_eq!(service.log(&water.id, delta(1)).await.unwrap().count, 1);
    assert_eq!(service.log(&water.id, delta(2)).await.unwrap().count, 3);
    assert_eq!(service.log(&water.id, delta(-10)).await.unwrap().count, 0);
    assert_eq!(service.log(&water.id, delta_on(-1, "2026-01-01")).await.unwrap().count, 0);
}

#[tokio::test]
async fn summarizes_today_s_count_completion_and_streak() {
    let (_ctx, service) = setup().await;
    let today = local(2026, 10, 17, 12, 0);
    let water = service.create(habit("Water", 2)).await.unwrap();
    let gym = service.create(habit("Gym", 1)).await.unwrap();
    service.log(&water.id, delta_on(2, "2026-10-15")).await.unwrap();
    service.log(&water.id, delta_on(3, "2026-10-16")).await.unwrap();
    service.log(&water.id, delta_on(1, "2026-10-17")).await.unwrap();
    service.log(&gym.id, delta_on(1, "2026-10-17")).await.unwrap();

    let summaries = service.list(today).await.unwrap();

    assert_match(
        &to_json(&summaries[0]),
        &json!({ "name": "Water", "unit": "times", "todayCount": 1, "doneToday": false, "streak": 2 }),
    );
    assert_match(&to_json(&summaries[1]), &json!({ "todayCount": 1, "doneToday": true, "streak": 1 }));
}

#[tokio::test]
async fn returns_logs_filtered_by_day_range_and_habit() {
    let (_ctx, service) = setup().await;
    let water = service.create(habit("Water", 2)).await.unwrap();
    let gym = service.create(habit("Gym", 1)).await.unwrap();
    service.log(&water.id, delta_on(1, "2026-10-01")).await.unwrap();
    service.log(&water.id, delta_on(1, "2026-10-10")).await.unwrap();
    service.log(&gym.id, delta_on(1, "2026-10-10")).await.unwrap();

    assert_eq!(service.logs(ListHabitLogsQuery::default()).await.unwrap().len(), 3);
    let range = ListHabitLogsQuery {
        from: Some("2026-10-05".into()),
        to: Some("2026-10-31".into()),
        habit_id: Some(water.id.clone()),
    };
    assert_eq!(service.logs(range).await.unwrap(), [entry(&water.id, "2026-10-10", 1, Some(2))]);
}

#[tokio::test]
async fn updates_and_soft_deletes_habits() {
    let (_ctx, service) = setup().await;
    assert_eq!(service.list(now()).await.unwrap(), []);
    let read = service.create(CreateHabitBody { unit: Some("pages".into()), ..habit("Read", 10) }).await.unwrap();

    let updated = service.update(&read.id, UpdateHabitBody { target: Some(20), ..Default::default() }).await.unwrap();
    assert_eq!(updated.target, 20);

    service.remove(&read.id).await.unwrap();
    assert_eq!(service.list(now()).await.unwrap(), []);
    assert_not_found(service.update(&read.id, UpdateHabitBody { target: Some(1), ..Default::default() }).await);
    assert_not_found(service.remove(&read.id).await);
    assert_not_found(service.log(&read.id, delta(1)).await);
}

#[tokio::test]
async fn persists_customization_and_completes_3000_ml_in_six_500_ml_check_ins() {
    let (_ctx, service) = setup().await;
    let water = service
        .create(CreateHabitBody {
            emoji: Some("🥤".into()),
            unit: Some("ml".into()),
            step: Some(500),
            ..habit("Water", 3000)
        })
        .await
        .unwrap();
    for index in 1..=6 {
        assert_eq!(service.log(&water.id, delta(water.step)).await.unwrap().count, index * 500);
        assert_eq!(service.list(now()).await.unwrap()[0].done_today, index == 6);
    }
    assert_match(
        &to_json(&service.list(now()).await.unwrap()[0]),
        &json!({ "emoji": "🥤", "step": 500, "todayCount": 3000, "streak": 1 }),
    );
    service.log(&water.id, delta(-500)).await.unwrap();
    assert_match(&to_json(&service.list(now()).await.unwrap()[0]), &json!({ "todayCount": 2500, "doneToday": false }));
    service.log(&water.id, delta(1000)).await.unwrap();
    assert_match(&to_json(&service.list(now()).await.unwrap()[0]), &json!({ "todayCount": 3500, "doneToday": true }));
}

#[tokio::test]
async fn preserves_completed_past_goals_when_the_daily_target_changes() {
    let (_ctx, service) = setup().await;
    let read = service.create(habit("Read", 10)).await.unwrap();
    service.log(&read.id, delta_on(10, "2026-10-16")).await.unwrap();
    service
        .update(
            &read.id,
            UpdateHabitBody { target: Some(20), emoji: Some("📚".into()), step: Some(5), ..Default::default() },
        )
        .await
        .unwrap();
    assert_match(
        &to_json(&service.list(local(2026, 10, 17, 12, 0)).await.unwrap()[0]),
        &json!({ "target": 20, "emoji": "📚", "step": 5, "streak": 1 }),
    );
    assert_eq!(service.logs(of_habit(&read.id)).await.unwrap(), [entry(&read.id, "2026-10-16", 10, Some(10))]);
    service.log(&read.id, delta_on(5, "2026-10-16")).await.unwrap();
    let logs = service.logs(of_habit(&read.id)).await.unwrap();
    assert_eq!((logs[0].count, logs[0].target), (15, Some(10)));
}

#[tokio::test]
async fn updates_today_s_snapshot_so_the_new_goal_remains_correct_tomorrow() {
    let (_ctx, service) = setup().await;
    let read = service.create(habit("Read", 10)).await.unwrap();
    service.log(&read.id, delta(10)).await.unwrap();
    service.update(&read.id, UpdateHabitBody { target: Some(20), ..Default::default() }).await.unwrap();
    let logs = service.logs(of_habit(&read.id)).await.unwrap();
    assert_eq!((logs[0].count, logs[0].target), (10, Some(20)));
    assert!(!service.list(now()).await.unwrap()[0].done_today);
}

#[tokio::test]
async fn replaces_the_day_s_count_and_keeps_the_goal_recorded_at_the_time() {
    let (_ctx, service) = setup().await;
    let water = service.create(habit("Water", 8)).await.unwrap();
    service.log(&water.id, delta_on(3, "2026-10-16")).await.unwrap();
    service.update(&water.id, UpdateHabitBody { target: Some(10), ..Default::default() }).await.unwrap();

    assert_eq!(
        service.set_log(&water.id, "2026-10-16", SetHabitLogBody { count: 8 }).await.unwrap(),
        HabitDayCount { habit_id: water.id.clone(), day: "2026-10-16".into(), count: 8 }
    );
    assert_eq!(service.set_log(&water.id, "2026-10-15", SetHabitLogBody { count: 2 }).await.unwrap().count, 2);
    assert_eq!(
        service.logs(of_habit(&water.id)).await.unwrap(),
        [entry(&water.id, "2026-10-15", 2, Some(10)), entry(&water.id, "2026-10-16", 8, Some(8))]
    );
    assert_eq!(service.set_log(&water.id, "2026-10-16", SetHabitLogBody { count: 0 }).await.unwrap().count, 0);
}

#[tokio::test]
async fn updates_today_s_count_with_the_current_goal() {
    let (_ctx, service) = setup().await;
    let read = service.create(habit("Read", 10)).await.unwrap();
    service.set_log(&read.id, &to_day_key(now()), SetHabitLogBody { count: 12 }).await.unwrap();
    assert_match(
        &to_json(&service.list(now()).await.unwrap()[0]),
        &json!({ "todayCount": 12, "doneToday": true, "streak": 1 }),
    );
}

#[tokio::test]
async fn rejects_future_days_and_unknown_habits() {
    let (_ctx, service) = setup().await;
    let read = service.create(habit("Read", 10)).await.unwrap();
    let tomorrow = to_day_key(now() + chrono::Duration::days(1));
    assert_bad_request(service.set_log(&read.id, &tomorrow, SetHabitLogBody { count: 1 }).await);
    assert_bad_request(service.log(&read.id, delta_on(1, &tomorrow)).await);
    assert_not_found(service.set_log("missing", "2026-10-16", SetHabitLogBody { count: 1 }).await);
}

use chrono::Utc;
use life_board_api::db::{Db, MIGRATIONS};
use life_board_api::dto::habits::ListHabitLogsQuery;
use life_board_api::services::habits::{HabitLogEntry, HabitsService};
use serde_json::json;

use crate::common::{assert_match, temp_dir, to_json};

#[tokio::test]
async fn upgrades_existing_habits_without_losing_daily_progress() {
    let dir = temp_dir("habit-migration-");
    let path = dir.path().join("legacy.db");
    let legacy = Db::open_with(&path, &MIGRATIONS[..3]).await.unwrap();
    legacy
        .call(|conn| {
            conn.execute_batch(
                "INSERT INTO habits (id, name, unit, target, created_at, updated_at) VALUES ('water', 'Water', 'glasses', 6, 1792195200000, 1792195200000);
                 INSERT INTO habit_logs (id, habit_id, day, count, created_at, updated_at) VALUES ('log', 'water', '2026-10-17', 4, 1792195200000, 1792195200000);",
            )
        })
        .await
        .unwrap();
    legacy.close().await.unwrap();

    let upgraded = Db::open(&path).await.unwrap();
    let service = HabitsService::new(upgraded.clone());
    let habits = service.list(Utc::now()).await.unwrap();
    assert_match(&to_json(&habits[0]), &json!({ "name": "Water", "target": 6, "step": 1, "emoji": "🌱" }));
    assert_eq!(
        service.logs(ListHabitLogsQuery::default()).await.unwrap(),
        vec![HabitLogEntry { habit_id: "water".into(), day: "2026-10-17".into(), count: 4, target: Some(6) }]
    );
    drop(service);
    upgraded.close().await.unwrap();
}

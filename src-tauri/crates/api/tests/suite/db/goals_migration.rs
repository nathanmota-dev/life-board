use chrono::Utc;
use life_board_api::db::Db;
use life_board_api::db::schema::goals::GoalProgressMode;
use life_board_api::dto::goals::CreateGoalBody;
use life_board_api::services::goals::GoalsService;
use rstest::rstest;
use serde_json::json;

use crate::common::{assert_match, migrations_before, temp_dir, to_json};

#[rstest]
#[case::before_0006("0006")]
#[case::before_0007("0007")]
#[tokio::test]
#[ignore = "pending #52"]
async fn upgrades_from_before_keeping_manual_progress_and_starting_new_goals_in_auto(#[case] next_migration: &str) {
    let dir = temp_dir("goals-migration-");
    let path = dir.path().join("legacy.db");
    let legacy = Db::open_with(&path, migrations_before(next_migration)).await.unwrap();
    legacy
        .call(|conn| {
            conn.execute_batch(
                "INSERT INTO goals (id, title, progress, linked_task_ids, linked_thought_ids, created_at, updated_at) VALUES ('books', 'Read books', 60, '[]', '[]', 1792195200000, 1792195200000);
                 INSERT INTO goal_milestones (id, goal_id, title, created_at, updated_at) VALUES ('m1', 'books', 'First', 1792195200000, 1792195200000);",
            )
        })
        .await
        .unwrap();
    legacy.close().await.unwrap();

    let upgraded = Db::open(&path).await.unwrap();
    let service = GoalsService::new(upgraded.clone());
    let goals = service.list(Utc::now()).await.unwrap();
    assert_match(&to_json(&goals[0]), &json!({ "progressMode": "manual", "progress": 60, "linkedHabitIds": [] }));
    let created = service.create(CreateGoalBody { title: "New".into(), ..Default::default() }).await.unwrap();
    assert_eq!(created.goal.goal.progress_mode, GoalProgressMode::Auto);
    drop(service);
    upgraded.close().await.unwrap();
}

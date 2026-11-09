use life_board_api::db::Db;
use life_board_api::dto::tasks::{ListTasksQuery, UpdateTaskBody};
use life_board_api::services::tasks::TasksService;
use serde_json::json;

use crate::common::{assert_match, migrations_before, temp_dir, to_json};

#[tokio::test]
async fn adds_the_focus_day_to_existing_tasks_without_picking_them() {
    let dir = temp_dir("focus-day-migration-");
    let path = dir.path().join("legacy.db");
    let legacy = Db::open_with(&path, migrations_before("0006")).await.unwrap();
    legacy
        .call(|conn| conn.execute_batch("INSERT INTO tasks (id, title, status, tags, linked_thought_ids, created_at, updated_at) VALUES ('report', 'Report', 'today', '[]', '[]', 1792195200000, 1792195200000)"))
        .await
        .unwrap();
    legacy.close().await.unwrap();

    let upgraded = Db::open(&path).await.unwrap();
    let service = TasksService::new(upgraded.clone());
    assert_match(
        &to_json(&service.get("report").await.unwrap()),
        &json!({ "title": "Report", "status": "today", "focusDay": null }),
    );
    service
        .update("report", UpdateTaskBody { focus_day: Some(Some("2026-10-19".into())), ..Default::default() })
        .await
        .unwrap();
    let listed = service
        .list(ListTasksQuery { limit: 50, focus_day: Some("2026-10-19".into()), ..Default::default() })
        .await
        .unwrap();
    assert_eq!(listed.tasks().iter().map(|task| task.id.as_str()).collect::<Vec<_>>(), ["report"]);
    drop(service);
    upgraded.close().await.unwrap();
}

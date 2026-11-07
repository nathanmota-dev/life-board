use life_board_api::db::Db;
use life_board_api::dto::tasks::{ListTasksQuery, TaskInclude};
use life_board_api::services::tasks::{TaskList, TasksService};
use serde_json::json;

use crate::common::{assert_match, migrations_before, temp_dir, to_json};

#[tokio::test]
#[ignore = "pending #51"]
async fn upgrades_existing_tasks_onto_the_board_with_their_subtasks() {
    let dir = temp_dir("tasks-migration-");
    let path = dir.path().join("legacy.db");
    let legacy = Db::open_with(&path, migrations_before("0005")).await.unwrap();
    legacy
        .call(|conn| {
            conn.execute_batch(
                "INSERT INTO tasks (id, title, tags, linked_thought_ids, created_at, updated_at) VALUES ('trip', 'Trip', '[]', '[]', 1792195200000, 1792195200000);
                 INSERT INTO tasks (id, title, parent_task_id, tags, linked_thought_ids, created_at, updated_at) VALUES ('passport', 'Passport', 'trip', '[]', '[]', 1792195200000, 1792195200000);",
            )
        })
        .await
        .unwrap();
    legacy.close().await.unwrap();

    let upgraded = Db::open(&path).await.unwrap();
    let service = TasksService::new(upgraded.clone());
    let TaskList::WithChildren(board) = service
        .list(ListTasksQuery { limit: 50, include: Some(TaskInclude::Children), ..Default::default() })
        .await
        .unwrap()
    else {
        panic!("include=children returns tasks with their children");
    };
    let trip = &board[0];
    assert_match(
        &to_json(trip),
        &json!({ "title": "Trip", "pinned": false, "color": null, "order": 0, "archivedAt": null }),
    );
    assert_eq!(trip.children.iter().map(|item| item.title.as_str()).collect::<Vec<_>>(), ["Passport"]);
    drop(service);
    upgraded.close().await.unwrap();
}

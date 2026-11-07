use chrono::Utc;
use life_board_api::db::columns::to_millis;
use life_board_api::db::schema::projects::ProjectStatus;
use life_board_api::db::{Db, MIGRATIONS};
use life_board_api::dto::projects::ListProjectsQuery;
use life_board_api::services::projects::ProjectsService;

use crate::common::{ms, temp_dir};

#[tokio::test]
#[ignore = "pending #52"]
async fn upgrades_existing_projects_to_per_column_order_with_a_status_history() {
    let dir = temp_dir("projects-migration-");
    let path = dir.path().join("legacy.db");
    let legacy = Db::open_with(&path, &MIGRATIONS[..4]).await.unwrap();
    let recent = to_millis(Utc::now()) - 60_000;
    legacy
        .call(move |conn| {
            conn.execute_batch(&format!(
                r#"INSERT INTO projects (id, title, status, "order", created_at, updated_at) VALUES
                  ('a', 'A', 'idea', 0, 1000, {recent}),
                  ('b', 'B', 'done', 1, 1000, {recent}),
                  ('c', 'C', 'idea', 2, 1000, {recent}),
                  ('old', 'Old', 'done', 3, 1000, 1000)"#
            ))
        })
        .await
        .unwrap();
    legacy.close().await.unwrap();

    let upgraded = Db::open(&path).await.unwrap();
    let service = ProjectsService::new(upgraded.clone());
    let items = service.list(ListProjectsQuery::default()).await.unwrap().items;
    let board: Vec<(&str, ProjectStatus, i64)> = items.iter().map(|p| (p.id.as_str(), p.status, p.order)).collect();
    assert_eq!(board, [("a", ProjectStatus::Idea, 0), ("b", ProjectStatus::Done, 0), ("c", ProjectStatus::Idea, 1)]);
    assert_eq!(to_millis(items[0].status_changed_at), recent);
    let archived = service.list(ListProjectsQuery { archived: true }).await.unwrap().items;
    assert_eq!(archived.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(), ["old"]);
    let history = service.history("b").await.unwrap().items;
    assert_eq!(history.len(), 1);
    assert_eq!((history[0].status, history[0].changed_at), (ProjectStatus::Done, ms(recent)));
    drop(service);
    upgraded.close().await.unwrap();
}

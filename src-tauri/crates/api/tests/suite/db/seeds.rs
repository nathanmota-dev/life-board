//! Rust-only: the row mappers and insert helpers of the file, project and
//! settings tables, which Drizzle generated for the Node API.

use life_board_api::db::columns::{StringEnum, to_iso};
use life_board_api::db::schema::app_settings::{self, AppSettings, NewAppSettings};
use life_board_api::db::schema::file_boards::{
    BoardKind, FileBoard, FileItem, FileKind, NewFileBoard, NewFileItem, insert_boards, insert_items,
};
use life_board_api::db::schema::projects::{
    NewProject, NewProjectStatusChange, Project, ProjectStatus, ProjectStatusChange, insert_projects,
    insert_status_changes,
};
use life_board_api::db::{Db, DbError};
use rusqlite::Row;
use serde_json::json;

use crate::common::{ms, test_db, to_json};

async fn rows<T: Send + 'static>(
    db: &Db,
    table: &'static str,
    map: fn(&Row<'_>) -> rusqlite::Result<T>,
) -> Result<Vec<T>, DbError> {
    db.call(move |conn| {
        let mut statement = conn.prepare(&format!("SELECT * FROM {table} ORDER BY rowid"))?;
        statement.query_map([], map)?.collect()
    })
    .await
}

#[tokio::test]
async fn seeds_app_settings_and_reads_them_back() {
    let ctx = test_db().await;
    let at = ms(1_000);
    app_settings::insert(
        &ctx.db,
        vec![NewAppSettings {
            id: "default".into(),
            uploads_base_dir: Some("/folder".into()),
            created_at: Some(at),
            updated_at: None,
        }],
    )
    .await
    .unwrap();

    let saved = rows(&ctx.db, "app_settings", AppSettings::from_row).await.unwrap();
    assert_eq!(saved[0].uploads_base_dir.as_deref(), Some("/folder"));
    assert_eq!(saved[0].created_at, at);
    assert_eq!(to_json(&saved[0])["createdAt"], to_iso(at));
}

#[tokio::test]
async fn seeds_file_boards_and_items_with_the_column_defaults() {
    let ctx = test_db().await;
    insert_boards(&ctx.db, vec![NewFileBoard { id: "b".into(), name: "Board".into(), ..Default::default() }])
        .await
        .unwrap();
    insert_items(
        &ctx.db,
        vec![NewFileItem {
            id: "i".into(),
            board_id: "b".into(),
            mime: "image/png".into(),
            size_bytes: 3,
            storage_path: "a.png".into(),
            tags: Some(vec!["x".into()]),
            taken_at: Some(ms(2_000)),
            ..Default::default()
        }],
    )
    .await
    .unwrap();

    let board = &rows(&ctx.db, "file_boards", FileBoard::from_row).await.unwrap()[0];
    assert_eq!((board.kind, board.color.as_str()), (BoardKind::Other, "#06b6d4"));
    let item = &rows(&ctx.db, "file_items", FileItem::from_row).await.unwrap()[0];
    assert_eq!(
        (item.kind, item.tags.as_slice(), item.taken_at),
        (FileKind::Image, &["x".to_owned()][..], Some(ms(2_000)))
    );
}

#[tokio::test]
async fn seeds_projects_and_status_changes_with_the_column_defaults() {
    let ctx = test_db().await;
    insert_projects(&ctx.db, vec![NewProject { id: "p".into(), title: "Project".into(), ..Default::default() }])
        .await
        .unwrap();
    insert_status_changes(
        &ctx.db,
        vec![NewProjectStatusChange {
            id: "c".into(),
            project_id: "p".into(),
            status: ProjectStatus::Paused,
            pause_reason: Some("Waiting".into()),
            changed_at: Some(ms(3_000)),
        }],
    )
    .await
    .unwrap();

    let project = &rows(&ctx.db, "projects", Project::from_row).await.unwrap()[0];
    assert_eq!((project.status, project.order, project.status_changed_at), (ProjectStatus::Idea, 0, ms(0)));
    let change = &rows(&ctx.db, "project_status_changes", ProjectStatusChange::from_row).await.unwrap()[0];
    assert_eq!((change.status, change.changed_at), (ProjectStatus::Paused, ms(3_000)));
}

/// Every value keeps its text in JSON, in `Display` and when parsed back.
fn round_trips<E>()
where
    E: StringEnum
        + std::fmt::Display
        + std::fmt::Debug
        + PartialEq
        + Default
        + serde::Serialize
        + serde::de::DeserializeOwned,
{
    assert_eq!(E::default(), E::ALL[0]);
    for value in E::ALL {
        assert_eq!(E::parse(value.as_str()), Some(*value));
        assert_eq!(value.to_string(), value.as_str());
        assert_eq!(to_json(value), json!(value.as_str()));
        assert_eq!(serde_json::from_value::<E>(json!(value.as_str())).unwrap(), *value);
    }
    assert!(E::parse("nope").is_none());
    assert!(serde_json::from_value::<E>(json!("nope")).is_err());
}

#[test]
fn keeps_the_text_of_the_file_and_project_enums() {
    round_trips::<BoardKind>();
    round_trips::<FileKind>();
    round_trips::<ProjectStatus>();
}

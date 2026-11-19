use life_board_api::db::Db;
use life_board_api::db::schema::pages::PageKind;
use life_board_api::dto::pages::CreatePageBody;
use life_board_api::services::file_storage::FileStorageService;
use life_board_api::services::pages::PagesService;

use crate::common::{migrations_before, temp_dir};

#[tokio::test]
async fn upgrades_from_before_keeping_the_data_and_starts_with_no_pages() {
    let dir = temp_dir("pages-migration-");
    let path = dir.path().join("legacy.db");
    let legacy = Db::open_with(&path, migrations_before("0011")).await.unwrap();
    legacy
        .call(|conn| {
            conn.execute_batch(
                "INSERT INTO file_boards (id, name, kind, color, created_at, updated_at) VALUES ('b', 'Notes', 'notes', '#06b6d4', 1792195200000, 1792195200000);
                 INSERT INTO file_items (id, board_id, kind, mime, size_bytes, storage_path, tags, linked_task_ids, created_at, updated_at) VALUES ('i', 'b', 'note', 'text/markdown', 3, 'i-a.md', '[]', '[]', 1792195200000, 1792195200000);",
            )
        })
        .await
        .unwrap();
    let tables = |db: Db| async move {
        db.call(|conn| {
            conn.query_row("SELECT count(*) FROM sqlite_master WHERE name = 'pages'", [], |row| row.get::<_, i64>(0))
        })
        .await
        .unwrap()
    };
    assert_eq!(tables(legacy.clone()).await, 0);
    legacy.close().await.unwrap();

    let upgraded = Db::open(&path).await.unwrap();
    assert_eq!(tables(upgraded.clone()).await, 1);
    let kept = upgraded
        .call(|conn| {
            conn.query_row("SELECT name, (SELECT storage_path FROM file_items) FROM file_boards", [], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
        })
        .await
        .unwrap();
    assert_eq!(kept, ("Notes".to_owned(), "i-a.md".to_owned()));

    let pages = PagesService::new(upgraded.clone(), FileStorageService::new(dir.path().join("pages")));
    assert!(pages.list().await.unwrap().is_empty());
    let folder = pages
        .create(CreatePageBody { kind: PageKind::Folder, title: "New".into(), ..Default::default() })
        .await
        .unwrap();
    assert_eq!(pages.list().await.unwrap(), [folder]);
    drop(pages);
    upgraded.close().await.unwrap();
}

#[tokio::test]
async fn the_table_refuses_a_page_without_a_file_and_a_folder_with_one() {
    let dir = temp_dir("pages-check-");
    let db = Db::open(&dir.path().join("test.db")).await.unwrap();
    let insert = |kind: &'static str, storage_path: &'static str| {
        let db = db.clone();
        async move {
            db.call(move |conn| {
                conn.execute(
                    "INSERT INTO pages (id, kind, title, storage_path, created_at, updated_at) VALUES ('x', ?, 't', nullif(?, ''), 1, 1)",
                    [kind, storage_path],
                )
            })
            .await
        }
    };
    assert!(insert("page", "").await.is_err());
    assert!(insert("folder", "x.md").await.is_err());
    assert!(insert("other", "").await.is_err());
    assert!(insert("page", "x.md").await.is_ok());
    db.close().await.unwrap();
}

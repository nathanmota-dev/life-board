use std::io::ErrorKind;
use std::sync::Arc;

use life_board_api::db::Db;
use life_board_api::db::columns::to_millis;
use life_board_api::db::schema::file_boards::{BoardKind, FileKind};
use life_board_api::dto::file_boards::{CreateBoardBody, UpdateBoardBody, UpdateItemBody, UploadItemFields};
use life_board_api::services::file_boards::{FileBoardsService, UploadedFile};
use life_board_api::services::file_storage::FileStorageService;
use serde_json::json;

use crate::common::{DiskOp, FaultyDisk, TestDb, assert_match, assert_not_found, now, read_all, test_db, to_json};

struct Ctx {
    db: TestDb,
    disk: Arc<FaultyDisk>,
    storage: FileStorageService,
    service: FileBoardsService,
}

async fn setup() -> Ctx {
    let db = test_db().await;
    let disk = FaultyDisk::new();
    let storage = FileStorageService::with_disk(db.path().join("uploads"), disk.clone());
    let service = FileBoardsService::new(db.db.clone(), storage.clone());
    Ctx { db, disk, storage, service }
}

fn png() -> UploadedFile {
    UploadedFile { bytes: b"png-bytes".to_vec(), filename: "photo.png".into(), mime: "image/png".into() }
}

fn board(name: &str) -> CreateBoardBody {
    CreateBoardBody { name: name.into(), ..Default::default() }
}

async fn ids(db: &Db, table: &'static str) -> Vec<String> {
    db.call(move |conn| {
        let mut statement = conn.prepare(&format!("SELECT id FROM {table} ORDER BY rowid"))?;
        statement.query_map([], |row| row.get(0))?.collect()
    })
    .await
    .unwrap()
}

#[tokio::test]
#[ignore = "pending #52"]
async fn creates_updates_lists_and_deletes_boards() {
    let ctx = setup().await;
    let service = &ctx.service;
    let created =
        service.create_board(CreateBoardBody { kind: Some(BoardKind::Receipts), ..board("Receipts") }).await.unwrap();
    assert_match(&to_json(&created), &json!({ "color": "#06b6d4", "description": null }));

    let recolored = service
        .update_board(&created.id, UpdateBoardBody { color: Some("#000000".into()), ..Default::default() })
        .await
        .unwrap();
    assert_eq!(recolored.color, "#000000");
    assert_eq!(service.list_boards().await.unwrap().len(), 1);

    service.remove_board(&created.id).await.unwrap();
    assert_eq!(service.list_boards().await.unwrap(), []);
    assert_not_found(
        service.update_board(&created.id, UpdateBoardBody { name: Some("x".into()), ..Default::default() }).await,
    );
    assert_not_found(service.remove_board(&created.id).await);
    assert_not_found(service.list_items(&created.id).await);
    assert_not_found(service.add_item(&created.id, png(), UploadItemFields::default()).await);
}

#[tokio::test]
#[ignore = "pending #52"]
async fn stores_uploads_and_infers_the_item_kind_from_the_mime_type() {
    let ctx = setup().await;
    let service = &ctx.service;
    let created = service.create_board(board("Board")).await.unwrap();

    let image = service
        .add_item(&created.id, png(), UploadItemFields { title: Some("Beach".into()), ..Default::default() })
        .await
        .unwrap();
    let pdf_file = UploadedFile { bytes: b"%PDF".to_vec(), filename: "a.pdf".into(), mime: String::new() };
    let pdf = service.add_item(&created.id, pdf_file, UploadItemFields::default()).await.unwrap();
    let receipt_fields = UploadItemFields {
        kind: Some(FileKind::Receipt),
        amount_cents: Some(1250),
        currency: Some("BRL".into()),
        ..Default::default()
    };
    let receipt = service.add_item(&created.id, png(), receipt_fields).await.unwrap();

    assert_match(&to_json(&image), &json!({ "kind": "image", "title": "Beach", "mime": "image/png", "sizeBytes": 9 }));
    assert_match(&to_json(&pdf), &json!({ "kind": "other", "mime": "application/octet-stream" }));
    assert_match(&to_json(&receipt), &json!({ "kind": "receipt", "amountCents": 1250 }));
    assert_eq!(service.list_items(&created.id).await.unwrap().len(), 3);

    let opened = service.open_item_file(&image.id).await.unwrap();
    assert_eq!(opened.size, 9);
    assert_eq!(read_all(opened.file).await, "png-bytes");
}

#[tokio::test]
#[ignore = "pending #52"]
async fn updates_items_and_deletes_their_files() {
    let ctx = setup().await;
    let service = &ctx.service;
    let created = service.create_board(board("Board")).await.unwrap();
    let item = service.add_item(&created.id, png(), UploadItemFields::default()).await.unwrap();

    let tagged = service
        .update_item(&item.id, UpdateItemBody { tags: Some(vec!["trip".into()]), ..Default::default() })
        .await
        .unwrap();
    assert_eq!(tagged.tags, ["trip"]);

    service.remove_item(&item.id).await.unwrap();
    assert!(ctx.storage.size(&item.storage_path).await.is_err());
    assert_not_found(
        service.update_item(&item.id, UpdateItemBody { title: Some(Some("x".into())), ..Default::default() }).await,
    );
    assert_not_found(service.remove_item(&item.id).await);
    assert_not_found(service.open_item_file(&item.id).await);
}

#[tokio::test]
#[ignore = "pending #52"]
async fn still_deletes_the_row_when_the_file_can_t_be_removed_and_falls_back_to_the_stored_size() {
    let ctx = setup().await;
    let service = &ctx.service;
    let created = service.create_board(board("Board")).await.unwrap();
    let item = service.add_item(&created.id, png(), UploadItemFields::default()).await.unwrap();
    ctx.disk.fail_once(DiskOp::Size, ErrorKind::Other);
    assert_eq!(service.open_item_file(&item.id).await.unwrap().size, 9);

    ctx.disk.fail_once(DiskOp::RemoveFile, ErrorKind::Other);
    service.remove_item(&item.id).await.unwrap();
    assert_eq!(service.list_items(&created.id).await.unwrap(), []);
}

#[tokio::test]
#[ignore = "pending #52"]
async fn deletes_a_board_with_its_item_rows_and_files() {
    let ctx = setup().await;
    let service = &ctx.service;
    let trip = service.create_board(board("Trip")).await.unwrap();
    let other = service.create_board(board("Other")).await.unwrap();
    let fields = UploadItemFields { title: Some("Beach".into()), notes: Some("Sunset".into()), ..Default::default() };
    let first = service.add_item(&trip.id, png(), fields).await.unwrap();
    let second = service.add_item(&trip.id, png(), UploadItemFields::default()).await.unwrap();
    let kept = service.add_item(&other.id, png(), UploadItemFields::default()).await.unwrap();

    service.remove_board(&trip.id).await.unwrap();

    assert_eq!(ids(&ctx.db.db, "file_boards").await, std::slice::from_ref(&other.id));
    assert_eq!(ids(&ctx.db.db, "file_items").await, std::slice::from_ref(&kept.id));
    assert!(ctx.storage.size(&first.storage_path).await.is_err());
    assert!(ctx.storage.size(&second.storage_path).await.is_err());
    assert_eq!(ctx.storage.size(&kept.storage_path).await.unwrap(), 9);
    assert_not_found(service.open_item_file(&first.id).await);
}

#[tokio::test]
#[ignore = "pending #52"]
async fn removes_item_rows_for_good_and_clears_the_board_cover() {
    let ctx = setup().await;
    let service = &ctx.service;
    let created = service.create_board(board("Board")).await.unwrap();
    let item = service.add_item(&created.id, png(), UploadItemFields::default()).await.unwrap();
    service
        .update_board(&created.id, UpdateBoardBody { cover_item_id: Some(Some(item.id.clone())), ..Default::default() })
        .await
        .unwrap();

    service.remove_item(&item.id).await.unwrap();

    assert!(ids(&ctx.db.db, "file_items").await.is_empty());
    assert_eq!(service.list_boards().await.unwrap()[0].cover_item_id, None);
}

#[tokio::test]
#[ignore = "pending #52"]
async fn purges_rows_soft_deleted_by_earlier_versions() {
    let ctx = setup().await;
    let service = &ctx.service;
    let old = service.create_board(board("Old")).await.unwrap();
    let live = service.create_board(board("Live")).await.unwrap();
    let orphan = service.add_item(&old.id, png(), UploadItemFields::default()).await.unwrap();
    let trashed = service.add_item(&live.id, png(), UploadItemFields::default()).await.unwrap();
    let kept = service.add_item(&live.id, png(), UploadItemFields::default()).await.unwrap();
    let (deleted_at, old_id, trashed_id) = (to_millis(now()), old.id.clone(), trashed.id.clone());
    ctx.db
        .db
        .call(move |conn| {
            conn.execute(
                "UPDATE file_boards SET deleted_at = ?1 WHERE id = ?2",
                rusqlite::params![deleted_at, old_id],
            )?;
            conn.execute(
                "UPDATE file_items SET deleted_at = ?1 WHERE id = ?2",
                rusqlite::params![deleted_at, trashed_id],
            )
        })
        .await
        .unwrap();

    service.purge_deleted().await.unwrap();

    assert_eq!(ids(&ctx.db.db, "file_boards").await, std::slice::from_ref(&live.id));
    assert_eq!(ids(&ctx.db.db, "file_items").await, std::slice::from_ref(&kept.id));
    assert!(ctx.storage.size(&orphan.storage_path).await.is_err());
    assert!(ctx.storage.size(&trashed.storage_path).await.is_err());
    assert_eq!(ctx.storage.size(&kept.storage_path).await.unwrap(), 9);
}

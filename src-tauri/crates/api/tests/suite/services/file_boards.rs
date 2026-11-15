use std::io::ErrorKind;
use std::sync::Arc;

use life_board_api::db::Db;
use life_board_api::db::columns::to_millis;
use life_board_api::db::schema::file_boards::{BoardKind, FileKind};
use life_board_api::dto::file_boards::{
    CreateBoardBody, MAX_TEXT_CONTENT_BYTES, ReplaceItemTextBody, UpdateBoardBody, UpdateItemBody, UploadItemFields,
};
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

fn upload(name: &str, mime: &str, text: &str) -> UploadedFile {
    UploadedFile { bytes: text.as_bytes().to_vec(), filename: name.into(), mime: mime.into() }
}

fn content(text: &str) -> ReplaceItemTextBody {
    ReplaceItemTextBody { content: text.into() }
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

#[tokio::test]
async fn replaces_the_text_of_a_file_and_keeps_its_metadata() {
    let ctx = setup().await;
    let service = &ctx.service;
    let created = service.create_board(board("Notes")).await.unwrap();
    let fields = UploadItemFields { title: Some("todo.txt".into()), notes: Some("kept".into()), ..Default::default() };
    let item = service.add_item(&created.id, upload("todo.txt", "text/plain", "old"), fields).await.unwrap();

    let edited = service.replace_item_text(&item.id, content("  new line\n\tindented\n")).await.unwrap();

    assert_eq!(edited.id, item.id);
    assert_eq!((edited.title.as_deref(), edited.notes.as_deref()), (Some("todo.txt"), Some("kept")));
    assert_eq!(edited.size_bytes, 21);
    assert_ne!(edited.storage_path, item.storage_path);
    assert!(edited.storage_path.ends_with("-todo.txt"), "{}", edited.storage_path);
    assert!(to_millis(edited.updated_at) >= to_millis(item.updated_at));
    assert!(ctx.storage.size(&item.storage_path).await.is_err(), "the old blob is removed");
    let opened = service.open_item_file(&item.id).await.unwrap();
    assert_eq!(read_all(opened.file).await, "  new line\n\tindented\n");
}

#[tokio::test]
async fn edits_markdown_with_an_unknown_mime_by_its_uploaded_name() {
    let ctx = setup().await;
    let service = &ctx.service;
    let created = service.create_board(board("Notes")).await.unwrap();
    for (name, mime) in [("readme.md", "application/octet-stream"), ("notes.MARKDOWN", ""), ("doc.md", "text/markdown")]
    {
        let item = service.add_item(&created.id, upload(name, mime, "# a"), UploadItemFields::default()).await.unwrap();
        let edited = service.replace_item_text(&item.id, content("# b")).await.unwrap();
        assert_eq!(edited.size_bytes, 3, "{name}");
    }
}

#[tokio::test]
async fn refuses_to_edit_files_that_are_not_text() {
    let ctx = setup().await;
    let service = &ctx.service;
    let created = service.create_board(board("Mixed")).await.unwrap();
    for (name, mime) in
        [("photo.png", "image/png"), ("bill.pdf", "application/pdf"), ("data.bin", "application/octet-stream")]
    {
        let item = service.add_item(&created.id, upload(name, mime, "x"), UploadItemFields::default()).await.unwrap();
        let error = service.replace_item_text(&item.id, content("y")).await.unwrap_err();
        assert_eq!((error.status().as_u16(), error.code()), (415, "not_a_text_file"), "{name}");
        let opened = service.open_item_file(&item.id).await.unwrap();
        assert_eq!(read_all(opened.file).await, "x", "{name} is unchanged");
    }
}

#[tokio::test]
async fn refuses_text_over_the_edit_limit_and_unknown_files() {
    let ctx = setup().await;
    let service = &ctx.service;
    let created = service.create_board(board("Notes")).await.unwrap();
    let item =
        service.add_item(&created.id, upload("a.txt", "text/plain", "a"), UploadItemFields::default()).await.unwrap();

    let error =
        service.replace_item_text(&item.id, content(&"x".repeat(MAX_TEXT_CONTENT_BYTES + 1))).await.unwrap_err();
    assert_eq!((error.status().as_u16(), error.code()), (413, "content_too_large"));
    assert_not_found(service.replace_item_text("missing", content("y")).await);
}

#[tokio::test]
async fn keeps_the_old_text_when_the_new_one_can_t_be_written() {
    let ctx = setup().await;
    let service = &ctx.service;
    let created = service.create_board(board("Notes")).await.unwrap();
    let item =
        service.add_item(&created.id, upload("a.txt", "text/plain", "old"), UploadItemFields::default()).await.unwrap();

    ctx.disk.fail_once(DiskOp::Write, ErrorKind::Other);
    assert!(service.replace_item_text(&item.id, content("new")).await.is_err());

    let opened = service.open_item_file(&item.id).await.unwrap();
    assert_eq!(opened.item.storage_path, item.storage_path);
    assert_eq!(read_all(opened.file).await, "old");
}

#[tokio::test]
async fn drops_the_new_text_when_the_file_is_deleted_meanwhile() {
    let ctx = setup().await;
    let service = &ctx.service;
    let created = service.create_board(board("Notes")).await.unwrap();
    let item =
        service.add_item(&created.id, upload("a.txt", "text/plain", "old"), UploadItemFields::default()).await.unwrap();
    let (file, id) = (ctx.db.file(), item.id.clone());
    ctx.disk.fail_when(DiskOp::Write, move |_| {
        let conn = rusqlite::Connection::open(&file).expect("second connection");
        conn.execute("DELETE FROM file_items WHERE id = ?", [&id]).expect("delete row");
        None
    });

    assert_not_found(service.replace_item_text(&item.id, content("new")).await);
    let leftovers: Vec<_> = std::fs::read_dir(ctx.db.path().join("uploads"))
        .unwrap()
        .map(|entry| entry.unwrap().file_name().into_string().unwrap())
        .filter(|name| name != &item.storage_path)
        .collect();
    assert!(leftovers.is_empty(), "the new blob is removed: {leftovers:?}");
}

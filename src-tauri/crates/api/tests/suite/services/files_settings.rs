use std::io::{self, ErrorKind};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use life_board_api::db::schema::file_boards::FileItem;
use life_board_api::dto::file_boards::{CreateBoardBody, UploadItemFields};
use life_board_api::services::file_boards::{FileBoardsService, UploadedFile};
use life_board_api::services::file_storage::FileStorageService;
use life_board_api::services::files_settings::{FilesSettings, FilesSettingsService};
use serde_json::json;

use crate::common::{DiskOp, FaultyDisk, TestDb, assert_code, assert_error, assert_match, list_dir, test_db, to_json};

struct Ctx {
    db: TestDb,
    disk: Arc<FaultyDisk>,
    default_root: PathBuf,
    storage: FileStorageService,
    boards: FileBoardsService,
    settings: FilesSettingsService,
}

async fn setup() -> Ctx {
    let db = test_db().await;
    let default_root = db.path().join("uploads");
    let disk = FaultyDisk::new();
    let storage = FileStorageService::with_disk(&default_root, disk.clone());
    let boards = FileBoardsService::new(db.db.clone(), storage.clone());
    let settings = FilesSettingsService::new(db.db.clone(), storage.clone(), &default_root);
    std::fs::create_dir(db.path().join("apps")).unwrap();
    Ctx { db, disk, default_root, storage, boards, settings }
}

impl Ctx {
    fn apps(&self) -> PathBuf {
        self.db.path().join("apps")
    }

    fn picked_root(&self) -> PathBuf {
        self.apps().join("life-board-app").join("uploads")
    }

    async fn upload(&self) -> FileItem {
        let board =
            self.boards.create_board(CreateBoardBody { name: "Photos".into(), ..Default::default() }).await.unwrap();
        let png = UploadedFile { bytes: b"png-bytes".to_vec(), filename: "photo.png".into(), mime: "image/png".into() };
        self.boards.add_item(&board.id, png, UploadItemFields::default()).await.unwrap()
    }
}

fn display(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn read(path: PathBuf) -> String {
    std::fs::read_to_string(path).unwrap()
}

#[tokio::test]
async fn defaults_to_the_data_directory() {
    let ctx = setup().await;
    ctx.settings.load().await.unwrap();
    assert_eq!(
        ctx.settings.get().await.unwrap(),
        FilesSettings {
            base_dir: None,
            uploads_dir: display(&ctx.default_root),
            default_uploads_dir: display(&ctx.default_root)
        }
    );
}

#[tokio::test]
async fn moves_existing_uploads_under_folder_life_board_app_uploads_and_saves_new_ones_there() {
    let ctx = setup().await;
    let item = ctx.upload().await;

    let result = ctx.settings.update(Some(display(&ctx.apps()))).await.unwrap();

    assert_eq!(
        result,
        FilesSettings {
            base_dir: Some(display(&ctx.apps())),
            uploads_dir: display(&ctx.picked_root()),
            default_uploads_dir: display(&ctx.default_root),
        }
    );
    assert_eq!(read(ctx.picked_root().join(&item.storage_path)), "png-bytes");
    assert!(list_dir(&ctx.default_root).is_empty());
    assert_eq!(ctx.boards.open_item_file(&item.id).await.unwrap().size, 9);

    let next = ctx.upload().await;
    assert!(list_dir(&ctx.picked_root()).contains(&next.storage_path));
}

#[tokio::test]
async fn keeps_the_picked_folder_across_restarts_and_can_go_back_to_the_default() {
    let ctx = setup().await;
    let item = ctx.upload().await;
    ctx.settings.update(Some(display(&ctx.apps()))).await.unwrap();

    let restarted = FileStorageService::new(&ctx.default_root);
    FilesSettingsService::new(ctx.db.db.clone(), restarted.clone(), &ctx.default_root).load().await.unwrap();
    assert_eq!(restarted.root(), ctx.picked_root());

    assert_eq!(ctx.settings.update(None).await.unwrap().uploads_dir, display(&ctx.default_root));
    assert_eq!(read(ctx.default_root.join(&item.storage_path)), "png-bytes");
    assert!(list_dir(&ctx.picked_root()).is_empty());
}

#[tokio::test]
async fn leaves_the_files_alone_when_the_folder_is_unchanged() {
    let ctx = setup().await;
    let item = ctx.upload().await;

    ctx.settings.update(None).await.unwrap();

    assert_eq!(ctx.disk.count(DiskOp::Copy), 0);
    assert_eq!(read(ctx.default_root.join(&item.storage_path)), "png-bytes");
}

#[tokio::test]
async fn rejects_relative_missing_non_directory_and_unwritable_folders() {
    let ctx = setup().await;
    std::fs::write(ctx.db.path().join("file.txt"), "x").unwrap();
    std::fs::create_dir(ctx.db.path().join("locked")).unwrap();

    assert_error(ctx.settings.update(Some("apps".into())).await, 400, "relative_dir");
    // `~` counts as the home folder, not a relative path.
    assert_code(ctx.settings.update(Some("~/life-board-missing-folder".into())).await, "invalid_dir");
    assert_code(ctx.settings.update(Some(display(&ctx.db.path().join("missing")))).await, "invalid_dir");
    assert_code(ctx.settings.update(Some(display(&ctx.db.path().join("file.txt")))).await, "invalid_dir");
    let item = ctx.upload().await;
    // Directory permission bits do not deny writes on Windows. Exercise the OS
    // permission error on every platform without depending on POSIX modes.
    ctx.disk.fail_once(DiskOp::CheckWritableDir, ErrorKind::PermissionDenied);
    assert_error(ctx.settings.update(Some(display(&ctx.db.path().join("locked")))).await, 400, "invalid_dir");
    assert_eq!(ctx.settings.get().await.unwrap().base_dir, None);
    assert_eq!(read(ctx.default_root.join(&item.storage_path)), "png-bytes");
    assert!(list_dir(&ctx.db.path().join("locked")).is_empty());
}

#[tokio::test]
async fn rolls_back_the_copies_and_keeps_the_old_folder_when_a_file_fails_to_move() {
    let ctx = setup().await;
    let first = ctx.upload().await;
    let second = ctx.upload().await;
    let failing = second.storage_path.clone();
    ctx.disk.fail_when(DiskOp::Copy, move |from| {
        from.ends_with(&failing).then(|| io::Error::new(ErrorKind::StorageFull, "disk full"))
    });

    assert_error(ctx.settings.update(Some(display(&ctx.apps()))).await, 500, "move_failed");

    assert!(list_dir(&ctx.picked_root()).is_empty());
    assert_match(
        &to_json(&ctx.settings.get().await.unwrap()),
        &json!({ "baseDir": null, "uploadsDir": display(&ctx.default_root) }),
    );
    assert_eq!(ctx.boards.open_item_file(&first.id).await.unwrap().size, 9);
}

#[tokio::test]
async fn skips_rows_whose_file_is_already_gone_from_disk() {
    let ctx = setup().await;
    let lost = ctx.upload().await;
    let kept = ctx.upload().await;
    ctx.storage.remove(&lost.storage_path).await.unwrap();

    ctx.settings.update(Some(display(&ctx.apps()))).await.unwrap();

    assert_eq!(list_dir(&ctx.picked_root()), [kept.storage_path]);
}

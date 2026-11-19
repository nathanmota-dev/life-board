use std::io::{self, ErrorKind};
use std::sync::Arc;

use life_board_api::db::schema::pages::{Page, PageKind};
use life_board_api::dto::file_boards::MAX_TEXT_CONTENT_BYTES;
use life_board_api::dto::pages::{CreatePageBody, ImportPageFields, ReplacePageContentBody, UpdatePageBody};
use life_board_api::services::file_boards::UploadedFile;
use life_board_api::services::file_storage::FileStorageService;
use life_board_api::services::pages::PagesService;
use serde_json::json;

use crate::common::{DiskOp, FaultyDisk, TestDb, assert_code, assert_error, list_dir, test_db, to_json};

struct Ctx {
    db: TestDb,
    disk: Arc<FaultyDisk>,
    pages: PagesService,
}

async fn setup() -> Ctx {
    let db = test_db().await;
    let disk = FaultyDisk::new();
    let storage = FileStorageService::with_disk(db.path().join("pages"), disk.clone());
    let pages = PagesService::new(db.db.clone(), storage);
    Ctx { db, disk, pages }
}

impl Ctx {
    fn root(&self) -> std::path::PathBuf {
        self.db.path().join("pages")
    }

    fn read(&self, page: &Page) -> String {
        std::fs::read_to_string(self.root().join(format!("{}.md", page.id))).unwrap()
    }

    async fn folder(&self, title: &str, parent: Option<&Page>) -> Page {
        let body = CreatePageBody {
            kind: PageKind::Folder,
            title: title.into(),
            parent_id: Some(parent.map(|parent| parent.id.clone())),
            content: None,
        };
        self.pages.create(body).await.unwrap()
    }

    async fn page(&self, title: &str, parent: Option<&Page>, content: &str) -> Page {
        let body = CreatePageBody {
            kind: PageKind::Page,
            title: title.into(),
            parent_id: Some(parent.map(|parent| parent.id.clone())),
            content: Some(content.into()),
        };
        self.pages.create(body).await.unwrap()
    }

    async fn titles(&self) -> Vec<String> {
        self.pages.list().await.unwrap().into_iter().map(|page| page.title).collect()
    }
}

fn markdown(name: &str, bytes: &[u8]) -> UploadedFile {
    UploadedFile { bytes: bytes.to_vec(), filename: name.into(), mime: "text/markdown".into() }
}

fn fields(parent: Option<&Page>, path: Option<&str>) -> ImportPageFields {
    ImportPageFields { parent_id: parent.map(|parent| parent.id.clone()), folder_path: path.map(Into::into) }
}

#[tokio::test]
async fn creates_a_folder_and_a_page_stored_as_the_id_with_the_exact_bytes() {
    let ctx = setup().await;
    let folder = ctx.folder("Work", None).await;
    let text = "# Title\r\n\r\nline  \r\n\n\n";
    let page = ctx.page("Notes", Some(&folder), text).await;

    assert_eq!((folder.kind, folder.size_bytes, folder.parent_id.as_deref()), (PageKind::Folder, 0, None));
    assert_eq!(page.parent_id, Some(folder.id.clone()));
    assert_eq!(page.size_bytes, i64::try_from(text.len()).unwrap());
    assert_eq!(list_dir(&ctx.root()), [format!("{}.md", page.id)]);
    assert_eq!(ctx.read(&page), text);
    assert_eq!(ctx.pages.read_content(&page.id).await.unwrap().content, text);
}

#[tokio::test]
async fn starts_a_new_page_empty_and_trims_nothing_but_the_title() {
    let ctx = setup().await;
    let page = ctx
        .pages
        .create(CreatePageBody { kind: PageKind::Page, title: "Empty".into(), ..Default::default() })
        .await
        .unwrap();
    assert_eq!((page.size_bytes, ctx.read(&page)), (0, String::new()));
}

#[tokio::test]
async fn lists_folders_first_then_pages_by_title_ignoring_case_without_content() {
    let ctx = setup().await;
    ctx.page("beta", None, "b").await;
    ctx.folder("Zeta", None).await;
    ctx.page("Alpha", None, "a").await;
    ctx.folder("árvore", None).await;
    ctx.folder("apple", None).await;

    assert_eq!(ctx.titles().await, ["apple", "Zeta", "árvore", "Alpha", "beta"]);
    let listed = to_json(&ctx.pages.list().await.unwrap());
    assert!(listed.as_array().unwrap().iter().all(|page| page.get("content").is_none()));
    assert!(listed[0].get("storagePath").is_none());
    assert_eq!(listed[0]["parentId"], json!(null));
}

#[tokio::test]
async fn renaming_and_moving_only_update_sqlite() {
    let ctx = setup().await;
    let a = ctx.folder("A", None).await;
    let b = ctx.folder("B", Some(&a)).await;
    let page = ctx.page("Doc", Some(&b), "text").await;
    let files = list_dir(&ctx.root());

    let renamed = ctx
        .pages
        .update(&page.id, UpdatePageBody { title: Some("Renamed / with: odd*chars".into()), ..Default::default() })
        .await
        .unwrap();
    assert_eq!(
        (renamed.title.as_str(), renamed.parent_id.as_deref()),
        ("Renamed / with: odd*chars", Some(b.id.as_str()))
    );

    let moved =
        ctx.pages.update(&page.id, UpdatePageBody { parent_id: Some(None), ..Default::default() }).await.unwrap();
    assert_eq!(moved.parent_id, None);
    let folder_moved =
        ctx.pages.update(&b.id, UpdatePageBody { parent_id: Some(None), title: Some("B2".into()) }).await.unwrap();
    assert_eq!((folder_moved.parent_id, folder_moved.title.as_str()), (None, "B2"));

    assert_eq!(list_dir(&ctx.root()), files);
    assert_eq!(ctx.read(&page), "text");
    assert!(moved.updated_at >= page.updated_at);
}

#[tokio::test]
async fn an_update_without_fields_returns_the_item_unchanged() {
    let ctx = setup().await;
    let page = ctx.page("Doc", None, "x").await;
    assert_eq!(ctx.pages.update(&page.id, UpdatePageBody::default()).await.unwrap(), page);
    assert_error(ctx.pages.update("missing", UpdatePageBody::default()).await, 404, "not_found");
    assert_error(
        ctx.pages.update("missing", UpdatePageBody { title: Some("x".into()), ..Default::default() }).await,
        404,
        "not_found",
    );
}

#[tokio::test]
async fn refuses_a_parent_that_is_not_an_existing_folder_or_would_make_a_cycle() {
    let ctx = setup().await;
    let a = ctx.folder("A", None).await;
    let b = ctx.folder("B", Some(&a)).await;
    let c = ctx.folder("C", Some(&b)).await;
    let page = ctx.page("Doc", None, "x").await;
    let move_to = |id: &str, parent: &str| {
        let body = UpdatePageBody { parent_id: Some(Some(parent.to_owned())), ..Default::default() };
        let (pages, id) = (ctx.pages.clone(), id.to_owned());
        async move { pages.update(&id, body).await }
    };

    assert_error(move_to(&b.id, &page.id).await, 400, "invalid_parent");
    assert_error(move_to(&a.id, &a.id).await, 400, "invalid_parent");
    assert_error(move_to(&a.id, &c.id).await, 400, "invalid_parent");
    assert_error(move_to(&page.id, "missing").await, 400, "invalid_parent");
    // Siblings and deeper folders are fine.
    assert_eq!(move_to(&c.id, &a.id).await.unwrap().parent_id, Some(a.id.clone()));

    let under_page = CreatePageBody {
        kind: PageKind::Folder,
        title: "X".into(),
        parent_id: Some(Some(page.id.clone())),
        content: None,
    };
    assert_error(ctx.pages.create(under_page).await, 400, "invalid_parent");
    let missing =
        CreatePageBody { kind: PageKind::Page, title: "X".into(), parent_id: Some(Some("nope".into())), content: None };
    assert_error(ctx.pages.create(missing).await, 400, "invalid_parent");
    // The file written for the refused page is gone again.
    assert_eq!(list_dir(&ctx.root()), [format!("{}.md", page.id)]);
}

#[tokio::test]
async fn deleting_a_folder_removes_every_descendant_row_and_file() {
    let ctx = setup().await;
    let a = ctx.folder("A", None).await;
    let b = ctx.folder("B", Some(&a)).await;
    ctx.page("deep", Some(&b), "1").await;
    ctx.page("shallow", Some(&a), "2").await;
    let keep = ctx.page("keep", None, "3").await;
    assert_eq!(list_dir(&ctx.root()).len(), 3);

    ctx.pages.remove(&a.id).await.unwrap();

    assert_eq!(ctx.titles().await, ["keep"]);
    assert_eq!(list_dir(&ctx.root()), [format!("{}.md", keep.id)]);
    assert_error(ctx.pages.remove(&a.id).await, 404, "not_found");
}

#[tokio::test]
async fn a_file_that_fails_to_delete_does_not_fail_the_request() {
    let ctx = setup().await;
    let page = ctx.page("Doc", None, "x").await;
    ctx.disk.fail_once(DiskOp::RemoveFile, ErrorKind::PermissionDenied);

    ctx.pages.remove(&page.id).await.unwrap();

    assert!(ctx.titles().await.is_empty());
    assert_eq!(list_dir(&ctx.root()), [format!("{}.md", page.id)]);
}

#[tokio::test]
async fn saving_writes_a_temporary_file_and_renames_it_over_the_page() {
    let ctx = setup().await;
    let page = ctx.page("Doc", None, "old").await;
    let before = ctx.disk.count(DiskOp::Rename);

    let saved =
        ctx.pages.replace_content(&page.id, ReplacePageContentBody { content: "new\r\n ".into() }).await.unwrap();

    assert_eq!(ctx.disk.count(DiskOp::Rename), before + 1);
    let temp = ctx.disk.calls.lock().unwrap().iter().rfind(|(op, _)| *op == DiskOp::Write).unwrap().1.clone();
    assert_eq!(temp.file_name().unwrap().to_string_lossy(), format!("{}.md.tmp", page.id));
    assert_eq!(list_dir(&ctx.root()), [format!("{}.md", page.id)]);
    assert_eq!((ctx.read(&page), saved.size_bytes), ("new\r\n ".to_owned(), 6));
    assert!(saved.updated_at >= page.updated_at);
}

#[tokio::test]
async fn a_failed_save_leaves_the_previous_content_intact() {
    let ctx = setup().await;
    let page = ctx.page("Doc", None, "old").await;
    let save = |content: &str| ctx.pages.replace_content(&page.id, ReplacePageContentBody { content: content.into() });

    ctx.disk.fail_once(DiskOp::Rename, ErrorKind::PermissionDenied);
    assert_error(save("lost").await, 500, "internal_error");
    assert_eq!((ctx.read(&page), list_dir(&ctx.root())), ("old".to_owned(), vec![format!("{}.md", page.id)]));

    ctx.disk.fail_once(DiskOp::Write, ErrorKind::StorageFull);
    assert_error(save("lost").await, 500, "internal_error");
    assert_eq!(ctx.read(&page), "old");
    assert_eq!(ctx.pages.list().await.unwrap()[0].size_bytes, 3);
}

#[tokio::test]
async fn saving_refuses_folders_missing_pages_and_oversized_text() {
    let ctx = setup().await;
    let folder = ctx.folder("F", None).await;
    let page = ctx.page("Doc", None, "x").await;
    let body = |content: String| ReplacePageContentBody { content };

    assert_error(ctx.pages.replace_content(&folder.id, body("a".into())).await, 400, "not_a_page");
    assert_error(ctx.pages.replace_content("missing", body("a".into())).await, 404, "not_found");
    assert_error(
        ctx.pages.replace_content(&page.id, body("a".repeat(MAX_TEXT_CONTENT_BYTES + 1))).await,
        413,
        "content_too_large",
    );
    ctx.pages.replace_content(&page.id, body("a".repeat(MAX_TEXT_CONTENT_BYTES))).await.unwrap();
    let too_big = CreatePageBody {
        kind: PageKind::Page,
        title: "Big".into(),
        content: Some("a".repeat(MAX_TEXT_CONTENT_BYTES + 1)),
        ..Default::default()
    };
    assert_error(ctx.pages.create(too_big).await, 413, "content_too_large");
}

#[tokio::test]
async fn a_failed_write_while_creating_leaves_no_row() {
    let ctx = setup().await;
    ctx.disk.fail_once(DiskOp::Write, ErrorKind::StorageFull);
    let body = CreatePageBody { kind: PageKind::Page, title: "Doc".into(), ..Default::default() };
    assert_error(ctx.pages.create(body).await, 500, "internal_error");
    assert!(ctx.titles().await.is_empty());
}

#[tokio::test]
async fn a_failed_insert_removes_the_file_it_wrote() {
    let ctx = setup().await;
    ctx.db.db.call(|conn| conn.execute_batch("DROP TABLE pages")).await.unwrap();
    let body = CreatePageBody { kind: PageKind::Page, title: "Doc".into(), ..Default::default() };

    assert_error(ctx.pages.create(body).await, 500, "internal_error");
    assert!(list_dir(&ctx.root()).is_empty());
}

#[tokio::test]
async fn reading_a_folder_or_a_page_without_its_file_fails_cleanly() {
    let ctx = setup().await;
    let folder = ctx.folder("F", None).await;
    let page = ctx.page("Doc", None, "x").await;

    assert_error(ctx.pages.read_content(&folder.id).await, 400, "not_a_page");
    assert_error(ctx.pages.read_content("missing").await, 404, "not_found");
    std::fs::remove_file(ctx.root().join(format!("{}.md", page.id))).unwrap();
    assert_error(ctx.pages.read_content(&page.id).await, 404, "content_missing");
    // The row still exists, and so does the page in the listing.
    assert_eq!(ctx.titles().await, ["F", "Doc"]);
}

#[tokio::test]
async fn reading_surfaces_other_disk_errors_and_invalid_text() {
    let ctx = setup().await;
    let page = ctx.page("Doc", None, "x").await;
    ctx.disk.fail_once(DiskOp::Open, ErrorKind::PermissionDenied);
    assert_error(ctx.pages.read_content(&page.id).await, 500, "internal_error");

    std::fs::write(ctx.root().join(format!("{}.md", page.id)), [0xff, 0xfe]).unwrap();
    assert_error(ctx.pages.read_content(&page.id).await, 500, "internal_error");
}

#[tokio::test]
async fn imports_a_file_titled_by_its_name_into_the_folder_path() {
    let ctx = setup().await;
    let first =
        ctx.pages.import(markdown("MindShef - Task.md", b"# Task\r\n"), fields(None, Some("VBL/AKYOU"))).await.unwrap();
    let second = ctx.pages.import(markdown("Other.MARKDOWN", b"two"), fields(None, Some("vbl/akyou"))).await.unwrap();

    assert_eq!((first.title.as_str(), first.kind), ("MindShef - Task", PageKind::Page));
    assert_eq!(second.title, "Other");
    assert_eq!(first.parent_id, second.parent_id);
    assert_eq!(ctx.read(&first), "# Task\r\n");
    let all = ctx.pages.list().await.unwrap();
    let folders: Vec<&Page> = all.iter().filter(|page| page.kind == PageKind::Folder).collect();
    assert_eq!(folders.iter().map(|folder| folder.title.as_str()).collect::<Vec<_>>(), ["AKYOU", "VBL"]);
    assert_eq!(folders[0].parent_id, Some(folders[1].id.clone()));
    assert_eq!(folders[1].parent_id, None);
}

#[tokio::test]
async fn imports_under_a_parent_and_ignores_unsafe_path_segments() {
    let ctx = setup().await;
    let parent = ctx.folder("Root", None).await;
    let page =
        ctx.pages.import(markdown("a.md", b"x"), fields(Some(&parent), Some("/../a//./ b \\..\\c/"))).await.unwrap();

    let all = ctx.pages.list().await.unwrap();
    let c = all.iter().find(|item| item.title == "c").unwrap();
    let b = all.iter().find(|item| item.title == "b").unwrap();
    let a = all.iter().find(|item| item.title == "a" && item.kind == PageKind::Folder).unwrap();
    assert_eq!(page.parent_id, Some(c.id.clone()));
    assert_eq!(
        (c.parent_id.clone(), b.parent_id.clone(), a.parent_id.clone()),
        (Some(b.id.clone()), Some(a.id.clone()), Some(parent.id))
    );
    assert_eq!(list_dir(&ctx.root()), [format!("{}.md", page.id)]);
}

#[tokio::test]
async fn a_nameless_markdown_file_is_untitled_and_long_titles_are_cut() {
    let ctx = setup().await;
    assert_eq!(ctx.pages.import(markdown(".md", b""), fields(None, None)).await.unwrap().title, "Untitled");
    let long = ctx.pages.import(markdown(&format!("{}.md", "x".repeat(300)), b""), fields(None, None)).await.unwrap();
    assert_eq!(long.title.chars().count(), 200);
}

#[tokio::test]
async fn refuses_other_extensions_invalid_text_oversized_files_and_bad_parents() {
    let ctx = setup().await;
    let page = ctx.page("Doc", None, "x").await;

    assert_error(ctx.pages.import(markdown("a.txt", b"x"), fields(None, None)).await, 400, "unsupported_type");
    assert_error(ctx.pages.import(markdown("md", b"x"), fields(None, None)).await, 400, "unsupported_type");
    assert_error(
        ctx.pages.import(markdown("a.md", &[0xff, 0xfe, 0x00]), fields(None, None)).await,
        400,
        "invalid_encoding",
    );
    let big = vec![b'a'; MAX_TEXT_CONTENT_BYTES + 1];
    assert_error(ctx.pages.import(markdown("a.md", &big), fields(None, None)).await, 413, "content_too_large");
    assert_code(ctx.pages.import(markdown("a.md", b"x"), fields(Some(&page), None)).await, "invalid_parent");
    // Nothing was left behind, not even the folders of the refused import.
    assert_code(ctx.pages.import(markdown("a.md", b"x"), fields(Some(&page), Some("new"))).await, "invalid_parent");
    assert_eq!(ctx.titles().await, ["Doc"]);
    assert_eq!(list_dir(&ctx.root()), [format!("{}.md", page.id)]);
}

#[tokio::test]
async fn purges_only_leftover_temporary_markdown_files() {
    let ctx = setup().await;
    let page = ctx.page("Doc", None, "x").await;
    for name in ["lost.md.tmp", "other.txt.tmp", "notes.md.tmp.bak"] {
        std::fs::write(ctx.root().join(name), "x").unwrap();
    }

    ctx.pages.purge_temp_files().await;

    let kept = list_dir(&ctx.root());
    assert_eq!(
        kept,
        ["notes.md.tmp.bak".to_owned(), format!("{}.md", page.id), "other.txt.tmp".to_owned()]
            .iter()
            .cloned()
            .collect::<std::collections::BTreeSet<_>>()
            .into_iter()
            .collect::<Vec<_>>()
    );
}

#[tokio::test]
async fn purging_tolerates_a_missing_or_unreadable_folder() {
    let ctx = setup().await;
    ctx.pages.purge_temp_files().await;
    ctx.disk.fail_when(DiskOp::List, |_| Some(io::Error::from(ErrorKind::PermissionDenied)));
    ctx.pages.purge_temp_files().await;
}

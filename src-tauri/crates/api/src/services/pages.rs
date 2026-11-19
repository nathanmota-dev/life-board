//! The Pages tree: folders and markdown pages. SQLite keeps the tree and the metadata; the text
//! of each page is the file `<id>.md` in the pages root. The tree is never mirrored on disk, so
//! renaming or moving an item only updates SQLite and a title never has to be a valid file name.

use axum::http::StatusCode;
use rusqlite::Connection;
use rusqlite::types::Value;
use serde::Serialize;

use crate::clock;
use crate::db::Db;
use crate::db::columns::{Timestamp, js_date, new_id};
use crate::db::schema::pages::{NewPage, Page, PageKind, insert_page};
use crate::dto::file_boards::MAX_TEXT_CONTENT_BYTES;
use crate::dto::pages::{CreatePageBody, ImportPageFields, MAX_TITLE_CHARS, ReplacePageContentBody, UpdatePageBody};
use crate::error::{ApiError, ApiResult};
use crate::services::file_boards::UploadedFile;
use crate::services::file_storage::{FileStorageService, TEMP_SUFFIX};
use crate::services::query::{query_all, query_first, time_value};

/// `GET /pages/:id/content`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PageContent {
    pub content: String,
    #[serde(with = "js_date")]
    pub updated_at: Timestamp,
}

/// Why a change was refused inside a database transaction.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Reject {
    NotFound,
    InvalidParent,
}

impl From<Reject> for ApiError {
    fn from(reject: Reject) -> Self {
        match reject {
            Reject::NotFound => ApiError::not_found("Page not found."),
            Reject::InvalidParent => ApiError::bad_request("invalid_parent", "The parent must be an existing folder."),
        }
    }
}

#[derive(Clone)]
pub struct PagesService {
    db: Db,
    storage: FileStorageService,
}

impl PagesService {
    pub fn new(db: Db, storage: FileStorageService) -> Self {
        Self { db, storage }
    }

    /// Every item without content, flat, in tree order: folders first, then pages, each sorted by
    /// title ignoring case. Grouped by `parent_id`, the list gives every folder's children in order.
    pub async fn list(&self) -> ApiResult<Vec<Page>> {
        let mut pages = self.db.call(|conn| query_all(conn, "SELECT * FROM pages", &[], Page::from_row)).await?;
        pages.sort_by_cached_key(|page| {
            (page.kind == PageKind::Page, page.title.to_lowercase(), page.created_at, page.id.clone())
        });
        Ok(pages)
    }

    /// A page starts empty without `content`. `400 invalid_parent` unless the parent is a folder;
    /// `413 content_too_large` past 2 MiB.
    pub async fn create(&self, input: CreatePageBody) -> ApiResult<Page> {
        let content = (input.kind == PageKind::Page).then(|| input.content.unwrap_or_default());
        self.insert(input.kind, input.title, input.parent_id.flatten(), Vec::new(), content).await
    }

    /// Renames and/or moves. `400 invalid_parent` for a missing parent, a page as parent, or a
    /// folder moved into itself or one of its descendants.
    pub async fn update(&self, id: &str, input: UpdatePageBody) -> ApiResult<Page> {
        let id = id.to_owned();
        let outcome = self
            .db
            .call(move |conn| {
                let tx = conn.transaction()?;
                let Some(page) = find(&tx, &id)? else { return Ok(Err(Reject::NotFound)) };
                if input.title.is_none() && input.parent_id.is_none() {
                    return Ok(Ok(page));
                }
                let moving = input.parent_id.is_some();
                let title = input.title.unwrap_or_else(|| page.title.clone());
                let parent_id = input.parent_id.unwrap_or_else(|| page.parent_id.clone());
                if moving {
                    if !is_folder_or_root(&tx, parent_id.as_deref())? {
                        return Ok(Err(Reject::InvalidParent));
                    }
                    if let Some(parent) = parent_id.as_deref()
                        && is_in_tree(&tx, &id, parent)?
                    {
                        return Ok(Err(Reject::InvalidParent));
                    }
                }
                let updated = query_first(
                    &tx,
                    "UPDATE pages SET title = ?, parent_id = ?, updated_at = ? WHERE id = ? RETURNING *",
                    &[Value::Text(title), nullable(parent_id), time_value(clock::now()), Value::Text(id)],
                    Page::from_row,
                )?;
                tx.commit()?;
                Ok(updated.ok_or(Reject::NotFound))
            })
            .await?;
        Ok(outcome?)
    }

    /// Permanent: the item, everything inside it and their files. A file that can't be removed
    /// doesn't fail the request.
    pub async fn remove(&self, id: &str) -> ApiResult<()> {
        let id = id.to_owned();
        let outcome = self
            .db
            .call(move |conn| {
                let tx = conn.transaction()?;
                if find(&tx, &id)?.is_none() {
                    return Ok(Err(Reject::NotFound));
                }
                // The paths are read first: rows removed by the cascade aren't part of `RETURNING`.
                let paths = query_all(
                    &tx,
                    &format!("{TREE} SELECT storage_path FROM pages WHERE id IN tree AND storage_path IS NOT NULL"),
                    &[Value::Text(id.clone())],
                    |row| row.get::<_, String>(0),
                )?;
                tx.execute(&format!("{TREE} DELETE FROM pages WHERE id IN tree"), [id])?;
                tx.commit()?;
                Ok(Ok(paths))
            })
            .await?;
        for path in outcome? {
            let _ = self.storage.remove(&path).await;
        }
        Ok(())
    }

    /// `400 not_a_page` for a folder; `404 content_missing` when the file is gone from disk.
    pub async fn read_content(&self, id: &str) -> ApiResult<PageContent> {
        let (page, storage_path) = self.find_page(id).await?;
        match self.storage.read_to_string(&storage_path).await {
            Ok(content) => Ok(PageContent { content, updated_at: page.updated_at }),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                Err(ApiError::http(StatusCode::NOT_FOUND, "content_missing", "The page's file is missing."))
            }
            Err(error) => Err(error.into()),
        }
    }

    /// Saves the text as sent (not trimmed) through a temporary file, so a crash never leaves a
    /// half-written page, then updates the size and `updated_at`.
    pub async fn replace_content(&self, id: &str, input: ReplacePageContentBody) -> ApiResult<Page> {
        check_size(&input.content)?;
        let (_, storage_path) = self.find_page(id).await?;
        self.storage.write_at(&storage_path, input.content.as_bytes()).await?;
        let size = i64::try_from(input.content.len()).unwrap_or(i64::MAX);
        let id = id.to_owned();
        let updated = self
            .db
            .call(move |conn| {
                query_first(
                    conn,
                    "UPDATE pages SET size_bytes = ?, updated_at = ? WHERE id = ? RETURNING *",
                    &[Value::Integer(size), time_value(clock::now()), Value::Text(id)],
                    Page::from_row,
                )
            })
            .await?;
        match updated {
            Some(page) => Ok(page),
            None => {
                // Deleted while it was being saved: don't leave the file behind.
                let _ = self.storage.remove(&storage_path).await;
                Err(Reject::NotFound.into())
            }
        }
    }

    /// Creates a page from a `.md`/`.markdown` file, titled by the file name. Each segment of
    /// `folder_path` reuses the folder with that title (ignoring case) under the current parent, or
    /// creates it. `400 unsupported_type`/`invalid_encoding`; `413` past 2 MiB.
    pub async fn import(&self, file: UploadedFile, fields: ImportPageFields) -> ApiResult<Page> {
        let Some(title) = markdown_title(&file.filename) else {
            return Err(ApiError::bad_request("unsupported_type", "Only .md and .markdown files can be imported."));
        };
        if file.bytes.len() > MAX_TEXT_CONTENT_BYTES {
            return Err(too_large());
        }
        let content = String::from_utf8(file.bytes)
            .map_err(|_| ApiError::bad_request("invalid_encoding", "The file must be UTF-8 text."))?;
        let folders = fields.folder_path.as_deref().map(folder_segments).unwrap_or_default();
        self.insert(PageKind::Page, title, fields.parent_id, folders, Some(content)).await
    }

    /// Removes the `*.md.tmp` files a crash left in the pages root. Runs at startup; an
    /// unreadable folder isn't a reason to stop the app.
    pub async fn purge_temp_files(&self) {
        let Ok(names) = self.storage.list().await else { return };
        let suffix = format!(".md{TEMP_SUFFIX}");
        for name in names.into_iter().filter(|name| name.ends_with(&suffix)) {
            let _ = self.storage.remove(&name).await;
        }
    }

    /// The file first, then the row (and the folders of an import) in one transaction. If the
    /// transaction fails the file is removed, so no page is left without a row.
    async fn insert(
        &self,
        kind: PageKind,
        title: String,
        parent_id: Option<String>,
        folders: Vec<String>,
        content: Option<String>,
    ) -> ApiResult<Page> {
        let id = new_id();
        let mut size_bytes = 0;
        let mut storage_path = None;
        if let Some(content) = content {
            check_size(&content)?;
            let path = format!("{id}.md");
            self.storage.write_at(&path, content.as_bytes()).await?;
            size_bytes = i64::try_from(content.len()).unwrap_or(i64::MAX);
            storage_path = Some(path);
        }
        let row = NewPage {
            id,
            kind,
            title,
            storage_path: storage_path.clone(),
            size_bytes: Some(size_bytes),
            ..Default::default()
        };
        let outcome = self
            .db
            .call(move |conn| {
                let tx = conn.transaction()?;
                if !is_folder_or_root(&tx, parent_id.as_deref())? {
                    return Ok(Err(Reject::InvalidParent));
                }
                let parent_id = folders
                    .iter()
                    .try_fold(parent_id, |parent, title| find_or_create_folder(&tx, parent, title).map(Some))?;
                let page = insert_page(&tx, NewPage { parent_id, ..row })?;
                tx.commit()?;
                Ok(Ok(page))
            })
            .await;
        let failure = match outcome {
            Ok(Ok(page)) => return Ok(page),
            Ok(Err(reject)) => ApiError::from(reject),
            Err(error) => ApiError::from(error),
        };
        if let Some(path) = storage_path {
            let _ = self.storage.remove(&path).await;
        }
        Err(failure)
    }

    /// The page and its `storage_path`; `404` for a missing item, `400 not_a_page` for a folder.
    async fn find_page(&self, id: &str) -> ApiResult<(Page, String)> {
        let id = id.to_owned();
        let page = self.db.call(move |conn| find(conn, &id)).await?.ok_or(Reject::NotFound)?;
        match page.storage_path.clone() {
            Some(path) if page.kind == PageKind::Page => Ok((page, path)),
            _ => Err(ApiError::bad_request("not_a_page", "Only pages have content.")),
        }
    }
}

/// `WITH RECURSIVE` list of an item (`?1`) and everything below it, usable as `id IN tree`.
const TREE: &str = "WITH RECURSIVE tree(id) AS (SELECT id FROM pages WHERE id = ?1 \
                    UNION SELECT pages.id FROM pages JOIN tree ON pages.parent_id = tree.id)";

fn find(conn: &Connection, id: &str) -> rusqlite::Result<Option<Page>> {
    query_first(conn, "SELECT * FROM pages WHERE id = ?", &[Value::Text(id.to_owned())], Page::from_row)
}

fn nullable(value: Option<String>) -> Value {
    value.map_or(Value::Null, Value::Text)
}

/// The root (`None`) or an existing folder.
fn is_folder_or_root(conn: &Connection, parent_id: Option<&str>) -> rusqlite::Result<bool> {
    let Some(parent_id) = parent_id else { return Ok(true) };
    Ok(find(conn, parent_id)?.is_some_and(|parent| parent.kind == PageKind::Folder))
}

/// `candidate` is `id` itself or one of its descendants.
fn is_in_tree(conn: &Connection, id: &str, candidate: &str) -> rusqlite::Result<bool> {
    Ok(query_first(
        conn,
        &format!("{TREE} SELECT 1 FROM tree WHERE id = ?2"),
        &[Value::Text(id.to_owned()), Value::Text(candidate.to_owned())],
        |_| Ok(()),
    )?
    .is_some())
}

/// The folder titled `title` (ignoring case) under `parent_id`, created when missing.
fn find_or_create_folder(conn: &Connection, parent_id: Option<String>, title: &str) -> rusqlite::Result<String> {
    let siblings = query_all(
        conn,
        "SELECT id, title FROM pages WHERE kind = 'folder' AND parent_id IS ? ORDER BY created_at, id",
        &[nullable(parent_id.clone())],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    )?;
    let wanted = title.to_lowercase();
    if let Some((id, _)) = siblings.into_iter().find(|(_, sibling)| sibling.to_lowercase() == wanted) {
        return Ok(id);
    }
    let folder =
        NewPage { id: new_id(), parent_id, kind: PageKind::Folder, title: title.to_owned(), ..Default::default() };
    Ok(insert_page(conn, folder)?.id)
}

fn too_large() -> ApiError {
    ApiError::client(StatusCode::PAYLOAD_TOO_LARGE, Some("content_too_large"), "Pages can be up to 2 MB.")
}

fn check_size(content: &str) -> ApiResult<()> {
    if content.len() > MAX_TEXT_CONTENT_BYTES { Err(too_large()) } else { Ok(()) }
}

/// The title of an imported file: its name without `.md`/`.markdown`; `None` for another extension.
fn markdown_title(filename: &str) -> Option<String> {
    let lower = filename.to_ascii_lowercase();
    let extension = [".markdown", ".md"].into_iter().find(|extension| lower.ends_with(extension))?;
    let stem = &filename[..filename.len() - extension.len()];
    let title: String = stem.trim().chars().take(MAX_TITLE_CHARS).collect();
    Some(if title.is_empty() { "Untitled".to_owned() } else { title })
}

/// The folders of `VBL/AKYOU`. Empty segments, `.` and `..` are dropped, and a title is never
/// used to build a path.
fn folder_segments(path: &str) -> Vec<String> {
    path.split(['/', '\\'])
        .map(str::trim)
        .filter(|segment| !segment.is_empty() && *segment != "." && *segment != "..")
        .map(|segment| segment.chars().take(MAX_TITLE_CHARS).collect())
        .collect()
}

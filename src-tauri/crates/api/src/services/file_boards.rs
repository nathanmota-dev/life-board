use chrono::Utc;
use rusqlite::Connection;
use rusqlite::types::Value;

use crate::db::Db;
use crate::db::columns::new_id;
use crate::db::schema::file_boards::{
    FileBoard, FileItem, FileKind, NewFileBoard, NewFileItem, insert_board, insert_item,
};
use crate::dto::file_boards::{CreateBoardBody, UpdateBoardBody, UpdateItemBody, UploadItemFields};
use crate::error::{ApiError, ApiResult};
use crate::services::file_storage::FileStorageService;
use crate::services::query::{Assignments, enum_value, list_value, query_all, query_first, time_opt, time_value};

/// `UploadedFile`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UploadedFile {
    pub bytes: Vec<u8>,
    pub filename: String,
    pub mime: String,
}

/// What `openItemFile` returns: the row, the size on disk (or the stored size) and the file.
#[derive(Debug)]
pub struct OpenedItemFile {
    pub item: FileItem,
    pub size: u64,
    pub file: tokio::fs::File,
}

#[derive(Clone)]
pub struct FileBoardsService {
    db: Db,
    storage: FileStorageService,
}

impl FileBoardsService {
    pub fn new(db: Db, storage: FileStorageService) -> Self {
        Self { db, storage }
    }

    /// Most recently updated first.
    pub async fn list_boards(&self) -> ApiResult<Vec<FileBoard>> {
        Ok(self
            .db
            .call(|conn| {
                query_all(
                    conn,
                    "SELECT * FROM file_boards WHERE deleted_at IS NULL ORDER BY updated_at DESC",
                    &[],
                    FileBoard::from_row,
                )
            })
            .await?)
    }

    pub async fn create_board(&self, input: CreateBoardBody) -> ApiResult<FileBoard> {
        Ok(self
            .db
            .call(move |conn| {
                insert_board(
                    conn,
                    NewFileBoard {
                        id: new_id(),
                        name: input.name,
                        description: input.description.flatten(),
                        kind: input.kind,
                        color: input.color,
                        ..Default::default()
                    },
                )
            })
            .await?)
    }

    pub async fn update_board(&self, id: &str, input: UpdateBoardBody) -> ApiResult<FileBoard> {
        let mut set = Assignments::new();
        set.maybe("name", input.name)
            .maybe("description", input.description)
            .maybe("kind", input.kind.map(enum_value))
            .maybe("color", input.color)
            .maybe("cover_item_id", input.cover_item_id)
            .set("updated_at", time_value(Utc::now()));
        let set = set.into_fragment();
        let mut params = set.params;
        params.push(Value::Text(id.to_owned()));
        self.db
            .call(move |conn| {
                query_first(
                    conn,
                    &format!("UPDATE file_boards SET {} WHERE id = ? AND deleted_at IS NULL RETURNING *", set.sql),
                    &params,
                    FileBoard::from_row,
                )
            })
            .await?
            .ok_or_else(board_not_found)
    }

    /// Deletes the board, its items and their files for good.
    pub async fn remove_board(&self, id: &str) -> ApiResult<()> {
        self.find_board(id).await?;
        let id = id.to_owned();
        let paths = self
            .db
            .call(move |conn| {
                let paths = query_all(
                    conn,
                    "DELETE FROM file_items WHERE board_id = ? RETURNING storage_path",
                    &[Value::Text(id.clone())],
                    |row| row.get::<_, String>(0),
                )?;
                conn.execute("DELETE FROM file_boards WHERE id = ?", [id])?;
                Ok(paths)
            })
            .await?;
        self.remove_files(paths).await;
        Ok(())
    }

    /// Clears rows soft deleted by earlier versions, along with their files. Runs at startup.
    pub async fn purge_deleted(&self) -> ApiResult<()> {
        let paths = self
            .db
            .call(|conn| {
                let tx = conn.transaction()?;
                let paths = {
                    let mut statement = tx.prepare(
                        "DELETE FROM file_items WHERE deleted_at IS NOT NULL OR board_id IN (SELECT id FROM file_boards WHERE deleted_at IS NOT NULL) RETURNING storage_path",
                    )?;
                    statement.query_map([], |row| row.get::<_, String>(0))?.collect::<Result<Vec<_>, _>>()?
                };
                tx.execute("DELETE FROM file_boards WHERE deleted_at IS NOT NULL", [])?;
                tx.commit()?;
                Ok(paths)
            })
            .await?;
        self.remove_files(paths).await;
        Ok(())
    }

    /// Newest first; `404` for an unknown board.
    pub async fn list_items(&self, board_id: &str) -> ApiResult<Vec<FileItem>> {
        self.find_board(board_id).await?;
        let board_id = board_id.to_owned();
        Ok(self
            .db
            .call(move |conn| {
                query_all(
                    conn,
                    "SELECT * FROM file_items WHERE board_id = ? AND deleted_at IS NULL ORDER BY created_at DESC",
                    &[Value::Text(board_id)],
                    FileItem::from_row,
                )
            })
            .await?)
    }

    /// Kind defaults to `image` for `image/*` and `other` otherwise; mime to `application/octet-stream`.
    pub async fn add_item(&self, board_id: &str, file: UploadedFile, fields: UploadItemFields) -> ApiResult<FileItem> {
        self.find_board(board_id).await?;
        let blob = self.storage.save(&file.bytes, &file.filename).await?;
        let kind =
            fields.kind.unwrap_or(if file.mime.starts_with("image/") { FileKind::Image } else { FileKind::Other });
        let mime = if file.mime.is_empty() { "application/octet-stream".to_owned() } else { file.mime };
        let board_id = board_id.to_owned();
        Ok(self
            .db
            .call(move |conn| {
                insert_item(
                    conn,
                    NewFileItem {
                        id: new_id(),
                        board_id,
                        kind: Some(kind),
                        title: fields.title,
                        notes: fields.notes,
                        mime,
                        size_bytes: blob.size_bytes,
                        storage_path: blob.storage_path,
                        taken_at: fields.taken_at,
                        amount_cents: fields.amount_cents,
                        currency: fields.currency,
                        ..Default::default()
                    },
                )
            })
            .await?)
    }

    pub async fn update_item(&self, id: &str, input: UpdateItemBody) -> ApiResult<FileItem> {
        let mut set = Assignments::new();
        set.maybe("kind", input.kind.map(enum_value))
            .maybe("title", input.title)
            .maybe("notes", input.notes)
            .maybe("amount_cents", input.amount_cents)
            .maybe("currency", input.currency)
            .maybe("taken_at", input.taken_at.map(time_opt))
            .maybe("tags", input.tags.as_deref().map(list_value))
            .maybe("linked_task_ids", input.linked_task_ids.as_deref().map(list_value))
            .set("updated_at", time_value(Utc::now()));
        let set = set.into_fragment();
        let mut params = set.params;
        params.push(Value::Text(id.to_owned()));
        self.db
            .call(move |conn| {
                query_first(
                    conn,
                    &format!("UPDATE file_items SET {} WHERE id = ? AND deleted_at IS NULL RETURNING *", set.sql),
                    &params,
                    FileItem::from_row,
                )
            })
            .await?
            .ok_or_else(file_not_found)
    }

    /// Deletes the row and its file (best effort) and clears it as a board cover.
    pub async fn remove_item(&self, id: &str) -> ApiResult<()> {
        let id = id.to_owned();
        let row = self
            .db
            .call(move |conn| {
                let row = query_first(
                    conn,
                    "DELETE FROM file_items WHERE id = ? AND deleted_at IS NULL RETURNING *",
                    &[Value::Text(id.clone())],
                    FileItem::from_row,
                )?;
                if row.is_some() {
                    conn.execute("UPDATE file_boards SET cover_item_id = NULL WHERE cover_item_id = ?", [id])?;
                }
                Ok(row)
            })
            .await?
            .ok_or_else(file_not_found)?;
        self.remove_files(vec![row.storage_path]).await;
        Ok(())
    }

    pub async fn open_item_file(&self, id: &str) -> ApiResult<OpenedItemFile> {
        let id = id.to_owned();
        let item = self
            .db
            .call(move |conn| {
                query_first(
                    conn,
                    "SELECT * FROM file_items WHERE id = ? AND deleted_at IS NULL",
                    &[Value::Text(id)],
                    FileItem::from_row,
                )
            })
            .await?
            .ok_or_else(file_not_found)?;
        let size = match self.storage.size(&item.storage_path).await {
            Ok(size) => size,
            Err(_) => u64::try_from(item.size_bytes).unwrap_or(0),
        };
        let file = self.storage.open(&item.storage_path).await?;
        Ok(OpenedItemFile { item, size, file })
    }

    /// Best effort: the rows are already gone for the user even if a disk delete fails.
    async fn remove_files(&self, paths: Vec<String>) {
        for path in paths {
            let _ = self.storage.remove(&path).await;
        }
    }

    async fn find_board(&self, id: &str) -> ApiResult<()> {
        let id = id.to_owned();
        self.db.call(move |conn| board_exists(conn, &id)).await?.then_some(()).ok_or_else(board_not_found)
    }
}

fn board_exists(conn: &Connection, id: &str) -> rusqlite::Result<bool> {
    Ok(query_first(
        conn,
        "SELECT id FROM file_boards WHERE id = ? AND deleted_at IS NULL",
        &[Value::Text(id.to_owned())],
        |row| row.get::<_, String>(0),
    )?
    .is_some())
}

fn board_not_found() -> ApiError {
    ApiError::not_found("Board not found.")
}

fn file_not_found() -> ApiError {
    ApiError::not_found("File not found.")
}

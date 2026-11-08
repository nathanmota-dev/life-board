use serde::Serialize;

use chrono::Utc;
use rusqlite::params;

use crate::db::columns::{
    Timestamp, get_json_list, get_timestamp, get_timestamp_opt, js_date, js_date_opt, string_enum, to_json_list,
    to_millis,
};
use crate::db::{Db, DbError};

string_enum! {
    /// `BOARD_KINDS`.
    pub enum BoardKind { Receipts = "receipts", Photos = "photos", Invoices = "invoices", Notes = "notes", Other = "other" }
}

string_enum! {
    /// `FILE_KINDS`.
    pub enum FileKind { Image = "image", Receipt = "receipt", Invoice = "invoice", Note = "note", Other = "other" }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileBoard {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub kind: BoardKind,
    pub cover_item_id: Option<String>,
    pub color: String,
    #[serde(with = "js_date")]
    pub created_at: Timestamp,
    #[serde(with = "js_date")]
    pub updated_at: Timestamp,
    #[serde(with = "js_date_opt")]
    pub deleted_at: Option<Timestamp>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileItem {
    pub id: String,
    pub board_id: String,
    pub kind: FileKind,
    pub title: Option<String>,
    pub notes: Option<String>,
    pub mime: String,
    pub size_bytes: i64,
    /// Relative to the uploads directory.
    pub storage_path: String,
    #[serde(with = "js_date_opt")]
    pub taken_at: Option<Timestamp>,
    pub amount_cents: Option<i64>,
    pub currency: Option<String>,
    pub tags: Vec<String>,
    pub linked_task_ids: Vec<String>,
    #[serde(with = "js_date")]
    pub created_at: Timestamp,
    #[serde(with = "js_date")]
    pub updated_at: Timestamp,
    #[serde(with = "js_date_opt")]
    pub deleted_at: Option<Timestamp>,
}

/// Defaults: `kind` other, `color` "#06b6d4", timestamps now.
#[derive(Debug, Clone, Default)]
pub struct NewFileBoard {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub kind: Option<BoardKind>,
    pub cover_item_id: Option<String>,
    pub color: Option<String>,
    pub created_at: Option<Timestamp>,
    pub updated_at: Option<Timestamp>,
    pub deleted_at: Option<Timestamp>,
}

/// Defaults: `kind` image, empty tag and link lists, timestamps now.
#[derive(Debug, Clone, Default)]
pub struct NewFileItem {
    pub id: String,
    pub board_id: String,
    pub kind: Option<FileKind>,
    pub title: Option<String>,
    pub notes: Option<String>,
    pub mime: String,
    pub size_bytes: i64,
    pub storage_path: String,
    pub taken_at: Option<Timestamp>,
    pub amount_cents: Option<i64>,
    pub currency: Option<String>,
    pub tags: Option<Vec<String>>,
    pub linked_task_ids: Option<Vec<String>>,
    pub created_at: Option<Timestamp>,
    pub updated_at: Option<Timestamp>,
    pub deleted_at: Option<Timestamp>,
}

impl FileBoard {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            name: row.get("name")?,
            description: row.get("description")?,
            kind: row.get("kind")?,
            cover_item_id: row.get("cover_item_id")?,
            color: row.get("color")?,
            created_at: get_timestamp(row, "created_at")?,
            updated_at: get_timestamp(row, "updated_at")?,
            deleted_at: get_timestamp_opt(row, "deleted_at")?,
        })
    }
}

impl FileItem {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            board_id: row.get("board_id")?,
            kind: row.get("kind")?,
            title: row.get("title")?,
            notes: row.get("notes")?,
            mime: row.get("mime")?,
            size_bytes: row.get("size_bytes")?,
            storage_path: row.get("storage_path")?,
            taken_at: get_timestamp_opt(row, "taken_at")?,
            amount_cents: row.get("amount_cents")?,
            currency: row.get("currency")?,
            tags: get_json_list(row, "tags")?,
            linked_task_ids: get_json_list(row, "linked_task_ids")?,
            created_at: get_timestamp(row, "created_at")?,
            updated_at: get_timestamp(row, "updated_at")?,
            deleted_at: get_timestamp_opt(row, "deleted_at")?,
        })
    }
}

/// Inserts one board with the column defaults filled in and returns it.
pub fn insert_board(conn: &rusqlite::Connection, row: NewFileBoard) -> rusqlite::Result<FileBoard> {
    let now = Utc::now();
    conn.query_row(
        "INSERT INTO file_boards (id, name, description, kind, cover_item_id, color, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *",
        params![
            row.id,
            row.name,
            row.description,
            row.kind.unwrap_or(BoardKind::Other),
            row.cover_item_id,
            row.color.unwrap_or_else(|| "#06b6d4".to_owned()),
            to_millis(row.created_at.unwrap_or(now)),
            to_millis(row.updated_at.unwrap_or(now)),
            row.deleted_at.map(to_millis),
        ],
        FileBoard::from_row,
    )
}

/// Inserts one item with the column defaults filled in and returns it.
pub fn insert_item(conn: &rusqlite::Connection, row: NewFileItem) -> rusqlite::Result<FileItem> {
    let now = Utc::now();
    conn.query_row(
        "INSERT INTO file_items (id, board_id, kind, title, notes, mime, size_bytes, storage_path, taken_at, amount_cents, currency, tags, linked_task_ids, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *",
        params![
            row.id,
            row.board_id,
            row.kind.unwrap_or(FileKind::Image),
            row.title,
            row.notes,
            row.mime,
            row.size_bytes,
            row.storage_path,
            row.taken_at.map(to_millis),
            row.amount_cents,
            row.currency,
            to_json_list(&row.tags.unwrap_or_default()),
            to_json_list(&row.linked_task_ids.unwrap_or_default()),
            to_millis(row.created_at.unwrap_or(now)),
            to_millis(row.updated_at.unwrap_or(now)),
            row.deleted_at.map(to_millis),
        ],
        FileItem::from_row,
    )
}

pub async fn insert_boards(db: &Db, rows: Vec<NewFileBoard>) -> Result<(), DbError> {
    db.call(move |conn| {
        let tx = conn.transaction()?;
        for row in rows {
            insert_board(&tx, row)?;
        }
        tx.commit()
    })
    .await
}

pub async fn insert_items(db: &Db, rows: Vec<NewFileItem>) -> Result<(), DbError> {
    db.call(move |conn| {
        let tx = conn.transaction()?;
        for row in rows {
            insert_item(&tx, row)?;
        }
        tx.commit()
    })
    .await
}

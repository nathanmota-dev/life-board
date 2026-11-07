use serde::Serialize;

use crate::db::columns::{Timestamp, js_date, js_date_opt, string_enum};
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
        pending!(52, row)
    }
}

impl FileItem {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        pending!(52, row)
    }
}

pub async fn insert_boards(db: &Db, rows: Vec<NewFileBoard>) -> Result<(), DbError> {
    pending!(52, db, rows)
}

pub async fn insert_items(db: &Db, rows: Vec<NewFileItem>) -> Result<(), DbError> {
    pending!(52, db, rows)
}

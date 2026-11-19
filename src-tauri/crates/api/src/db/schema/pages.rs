use crate::clock;
use rusqlite::params;
use serde::Serialize;

use crate::db::columns::{Timestamp, get_timestamp, js_date, string_enum, to_millis};

string_enum! {
    /// `PAGE_KINDS`.
    pub enum PageKind { Folder = "folder", Page = "page" }
}

/// A folder or a markdown page. Only the metadata lives in SQLite: a page's text is
/// the file at `storage_path`, relative to the pages root.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    pub id: String,
    pub parent_id: Option<String>,
    pub kind: PageKind,
    pub title: String,
    /// `<id>.md` for pages, `None` for folders. Internal: never sent to the client.
    #[serde(skip)]
    pub storage_path: Option<String>,
    pub size_bytes: i64,
    #[serde(with = "js_date")]
    pub created_at: Timestamp,
    #[serde(with = "js_date")]
    pub updated_at: Timestamp,
}

/// Defaults: `size_bytes` 0, timestamps now.
#[derive(Debug, Clone, Default)]
pub struct NewPage {
    pub id: String,
    pub parent_id: Option<String>,
    pub kind: PageKind,
    pub title: String,
    pub storage_path: Option<String>,
    pub size_bytes: Option<i64>,
    pub created_at: Option<Timestamp>,
    pub updated_at: Option<Timestamp>,
}

impl Page {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            parent_id: row.get("parent_id")?,
            kind: row.get("kind")?,
            title: row.get("title")?,
            storage_path: row.get("storage_path")?,
            size_bytes: row.get("size_bytes")?,
            created_at: get_timestamp(row, "created_at")?,
            updated_at: get_timestamp(row, "updated_at")?,
        })
    }
}

/// Inserts one item with the column defaults filled in and returns it.
pub fn insert_page(conn: &rusqlite::Connection, row: NewPage) -> rusqlite::Result<Page> {
    let now = clock::now();
    conn.query_row(
        "INSERT INTO pages (id, parent_id, kind, title, storage_path, size_bytes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *",
        params![
            row.id,
            row.parent_id,
            row.kind,
            row.title,
            row.storage_path,
            row.size_bytes.unwrap_or(0),
            to_millis(row.created_at.unwrap_or(now)),
            to_millis(row.updated_at.unwrap_or(now)),
        ],
        Page::from_row,
    )
}

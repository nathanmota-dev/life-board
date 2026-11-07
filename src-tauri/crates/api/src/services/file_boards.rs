use crate::db::Db;
use crate::db::schema::file_boards::{FileBoard, FileItem};
use crate::dto::file_boards::{CreateBoardBody, UpdateBoardBody, UpdateItemBody, UploadItemFields};
use crate::error::ApiResult;
use crate::services::file_storage::FileStorageService;

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
        pending!(52, self.db)
    }

    pub async fn create_board(&self, input: CreateBoardBody) -> ApiResult<FileBoard> {
        pending!(52, self.db, input)
    }

    pub async fn update_board(&self, id: &str, input: UpdateBoardBody) -> ApiResult<FileBoard> {
        pending!(52, self.db, id, input)
    }

    /// Deletes the board, its items and their files for good.
    pub async fn remove_board(&self, id: &str) -> ApiResult<()> {
        pending!(52, self.db, self.storage, id)
    }

    /// Clears rows soft deleted by earlier versions, along with their files. Runs at startup.
    pub async fn purge_deleted(&self) -> ApiResult<()> {
        pending!(51, self.db, self.storage)
    }

    /// Newest first; `404` for an unknown board.
    pub async fn list_items(&self, board_id: &str) -> ApiResult<Vec<FileItem>> {
        pending!(52, self.db, board_id)
    }

    /// Kind defaults to `image` for `image/*` and `other` otherwise; mime to `application/octet-stream`.
    pub async fn add_item(&self, board_id: &str, file: UploadedFile, fields: UploadItemFields) -> ApiResult<FileItem> {
        pending!(52, self.db, self.storage, board_id, file, fields)
    }

    pub async fn update_item(&self, id: &str, input: UpdateItemBody) -> ApiResult<FileItem> {
        pending!(52, self.db, id, input)
    }

    /// Deletes the row and its file (best effort) and clears it as a board cover.
    pub async fn remove_item(&self, id: &str) -> ApiResult<()> {
        pending!(52, self.db, self.storage, id)
    }

    pub async fn open_item_file(&self, id: &str) -> ApiResult<OpenedItemFile> {
        pending!(52, self.db, self.storage, id)
    }
}

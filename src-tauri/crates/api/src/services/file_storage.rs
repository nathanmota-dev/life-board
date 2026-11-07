//! Uploaded files on local disk (`file-storage.service.ts`). `storage_path`
//! values are relative to the root, and every path is checked to stay inside it.

use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use async_trait::async_trait;

/// The disk operations the storage and Settings > Files use. Production code
/// uses [`RealDisk`]; tests wrap it to inject failures, like `vi.spyOn` on the
/// Node services.
#[async_trait]
pub trait Disk: Send + Sync + 'static {
    async fn create_dir_all(&self, path: &Path) -> io::Result<()>;
    async fn write(&self, path: &Path, bytes: &[u8]) -> io::Result<()>;
    async fn copy(&self, from: &Path, to: &Path) -> io::Result<()>;
    async fn size(&self, path: &Path) -> io::Result<u64>;
    async fn open(&self, path: &Path) -> io::Result<tokio::fs::File>;
    async fn remove_file(&self, path: &Path) -> io::Result<()>;
    /// `stat(dir).isDirectory()` and `access(dir, W_OK)`.
    async fn check_writable_dir(&self, path: &Path) -> io::Result<()>;
}

/// `tokio::fs`.
#[derive(Debug, Clone, Copy, Default)]
pub struct RealDisk;

#[async_trait]
impl Disk for RealDisk {
    async fn create_dir_all(&self, path: &Path) -> io::Result<()> {
        pending!(52, path)
    }

    async fn write(&self, path: &Path, bytes: &[u8]) -> io::Result<()> {
        pending!(52, path, bytes)
    }

    async fn copy(&self, from: &Path, to: &Path) -> io::Result<()> {
        pending!(52, from, to)
    }

    async fn size(&self, path: &Path) -> io::Result<u64> {
        pending!(52, path)
    }

    async fn open(&self, path: &Path) -> io::Result<tokio::fs::File> {
        pending!(52, path)
    }

    async fn remove_file(&self, path: &Path) -> io::Result<()> {
        pending!(52, path)
    }

    async fn check_writable_dir(&self, path: &Path) -> io::Result<()> {
        pending!(52, path)
    }
}

/// `SavedBlob`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SavedBlob {
    pub storage_path: String,
    pub size_bytes: i64,
}

/// Clones share the root, so a folder change in Settings > Files applies to the next upload.
#[derive(Clone)]
pub struct FileStorageService {
    root: Arc<RwLock<PathBuf>>,
    disk: Arc<dyn Disk>,
}

impl FileStorageService {
    /// Storage at `root` (made absolute) on the real disk.
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self::with_disk(root, Arc::new(RealDisk))
    }

    pub fn with_disk(root: impl Into<PathBuf>, disk: Arc<dyn Disk>) -> Self {
        pending!(52, root.into(), disk)
    }

    /// Another storage at `root` on the same disk (`new FileStorageService(root)` inside a service).
    pub fn at(&self, root: impl Into<PathBuf>) -> Self {
        pending!(52, self.disk, root.into())
    }

    pub fn root(&self) -> PathBuf {
        pending!(52, self.root)
    }

    pub fn disk(&self) -> Arc<dyn Disk> {
        Arc::clone(&self.disk)
    }

    /// Points later saves and reads at another folder (Settings > Files).
    pub fn set_root(&self, root: impl Into<PathBuf>) {
        pending!(52, self.root, root.into())
    }

    /// Stores the bytes as `<ulid>-<sanitized name><ext>`.
    pub async fn save(&self, bytes: &[u8], original_name: &str) -> io::Result<SavedBlob> {
        pending!(52, self.root, bytes, original_name)
    }

    /// Copies a stored file to the same `storage_path` under another storage's root.
    pub async fn copy_to(&self, storage_path: &str, target: &FileStorageService) -> io::Result<()> {
        pending!(52, self.root, storage_path, target)
    }

    pub async fn size(&self, storage_path: &str) -> io::Result<u64> {
        pending!(52, self.root, storage_path)
    }

    /// `stream`: the open file, read by the download route.
    pub async fn open(&self, storage_path: &str) -> io::Result<tokio::fs::File> {
        pending!(52, self.root, storage_path)
    }

    /// Removing a file that's already gone is fine; other errors are returned.
    pub async fn remove(&self, storage_path: &str) -> io::Result<()> {
        pending!(52, self.root, storage_path)
    }

    /// Refuses (`InvalidInput`, "Invalid storage path.") any path that lands outside the root.
    pub fn resolve(&self, storage_path: &str) -> io::Result<PathBuf> {
        pending!(52, self.root, storage_path)
    }
}

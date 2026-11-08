//! Uploaded files on local disk (`file-storage.service.ts`). `storage_path`
//! values are relative to the root, and every path is checked to stay inside it.

use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

use async_trait::async_trait;

use crate::db::columns::new_id;

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
    /// The folder exists, is a directory and accepts new files.
    async fn check_writable_dir(&self, path: &Path) -> io::Result<()>;
}

/// `tokio::fs`.
#[derive(Debug, Clone, Copy, Default)]
pub struct RealDisk;

#[async_trait]
impl Disk for RealDisk {
    async fn create_dir_all(&self, path: &Path) -> io::Result<()> {
        tokio::fs::create_dir_all(path).await
    }

    async fn write(&self, path: &Path, bytes: &[u8]) -> io::Result<()> {
        tokio::fs::write(path, bytes).await
    }

    async fn copy(&self, from: &Path, to: &Path) -> io::Result<()> {
        tokio::fs::copy(from, to).await.map(|_| ())
    }

    async fn size(&self, path: &Path) -> io::Result<u64> {
        tokio::fs::metadata(path).await.map(|metadata| metadata.len())
    }

    async fn open(&self, path: &Path) -> io::Result<tokio::fs::File> {
        tokio::fs::File::open(path).await
    }

    /// Also used at startup by `file_boards.purge_deleted` (#51).
    async fn remove_file(&self, path: &Path) -> io::Result<()> {
        tokio::fs::remove_file(path).await
    }

    /// Node calls `access(dir, W_OK)`. Rust has no safe equivalent, so this
    /// creates and removes an empty file, which is what the folder is needed for.
    async fn check_writable_dir(&self, path: &Path) -> io::Result<()> {
        if !tokio::fs::metadata(path).await?.is_dir() {
            return Err(io::Error::new(io::ErrorKind::NotADirectory, "Not a directory."));
        }
        let probe = path.join(format!(".life-board-write-check-{}", new_id()));
        tokio::fs::File::options().write(true).create_new(true).open(&probe).await?;
        tokio::fs::remove_file(&probe).await
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
        Self { root: Arc::new(RwLock::new(absolute(&root.into()))), disk }
    }

    /// Another storage at `root` on the same disk (`new FileStorageService(root)` inside a service).
    pub fn at(&self, root: impl Into<PathBuf>) -> Self {
        Self::with_disk(root, Arc::clone(&self.disk))
    }

    pub fn root(&self) -> PathBuf {
        self.root.read().map_or_else(|poisoned| poisoned.into_inner().clone(), |root| root.clone())
    }

    pub fn disk(&self) -> Arc<dyn Disk> {
        Arc::clone(&self.disk)
    }

    /// Points later saves and reads at another folder (Settings > Files).
    pub fn set_root(&self, root: impl Into<PathBuf>) {
        let root = absolute(&root.into());
        match self.root.write() {
            Ok(mut current) => *current = root,
            Err(poisoned) => *poisoned.into_inner() = root,
        }
    }

    /// Stores the bytes as `<ulid>-<sanitized name><ext>`.
    pub async fn save(&self, bytes: &[u8], original_name: &str) -> io::Result<SavedBlob> {
        let storage_path = format!("{}-{}", new_id(), sanitized_name(original_name));
        let full_path = self.resolve(&storage_path)?;
        self.disk.create_dir_all(&self.root()).await?;
        self.disk.write(&full_path, bytes).await?;
        Ok(SavedBlob { storage_path, size_bytes: i64::try_from(bytes.len()).unwrap_or(i64::MAX) })
    }

    /// Copies a stored file to the same `storage_path` under another storage's root.
    pub async fn copy_to(&self, storage_path: &str, target: &FileStorageService) -> io::Result<()> {
        self.disk.create_dir_all(&target.root()).await?;
        self.disk.copy(&self.resolve(storage_path)?, &target.resolve(storage_path)?).await
    }

    pub async fn size(&self, storage_path: &str) -> io::Result<u64> {
        self.disk.size(&self.resolve(storage_path)?).await
    }

    /// `stream`: the open file, read by the download route.
    pub async fn open(&self, storage_path: &str) -> io::Result<tokio::fs::File> {
        self.disk.open(&self.resolve(storage_path)?).await
    }

    /// Removing a file that's already gone is fine; other errors are returned.
    pub async fn remove(&self, storage_path: &str) -> io::Result<()> {
        match self.disk.remove_file(&self.resolve(storage_path)?).await {
            Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
            other => other,
        }
    }

    /// Refuses (`InvalidInput`, "Invalid storage path.") any path that lands outside the root.
    pub fn resolve(&self, storage_path: &str) -> io::Result<PathBuf> {
        let root = self.root();
        let full = normalize(&root.join(storage_path));
        if full != root && full.starts_with(&root) {
            Ok(full)
        } else {
            Err(io::Error::new(io::ErrorKind::InvalidInput, "Invalid storage path."))
        }
    }
}

/// `path.resolve(path)`: absolute, with `.` and `..` folded.
pub fn absolute(path: &Path) -> PathBuf {
    normalize(&std::path::absolute(path).unwrap_or_else(|_| path.to_path_buf()))
}

/// Folds `.` and `..` without touching the disk, like `path.resolve`.
fn normalize(path: &Path) -> PathBuf {
    use std::path::Component;
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            other => normalized.push(other.as_os_str()),
        }
    }
    normalized
}

fn is_separator(char: char) -> bool {
    char == '/' || (cfg!(windows) && char == '\\')
}

/// `path.basename(name)` for the current OS.
fn base_name(name: &str) -> &str {
    let trimmed = name.trim_end_matches(is_separator);
    let last = trimmed.rsplit(is_separator).next().unwrap_or_default();
    match last.as_bytes() {
        [drive, b':', ..] if cfg!(windows) && drive.is_ascii_alphabetic() => &last[2..],
        _ => last,
    }
}

/// `path.extname(base)`: from the last dot, unless the name starts there or is `..`.
fn extension(base: &str) -> &str {
    match base.rfind('.') {
        Some(dot) if dot > 0 && base != ".." => &base[dot..],
        _ => "",
    }
}

/// `<base><ext>`, the part of the stored name that comes from the upload: the
/// replacements run per UTF-16 code unit, like the Node regexes without `u`.
fn sanitized_name(original_name: &str) -> String {
    let full = base_name(original_name);
    let ext = extension(full);
    let stem = full.strip_suffix(ext).unwrap_or(full);
    let base: String = stem
        .encode_utf16()
        .map(|unit| match char::from_u32(u32::from(unit)) {
            Some(char) if char.is_ascii_alphanumeric() || char == '_' || char == '-' => char,
            _ => '_',
        })
        .take(100)
        .collect();
    let ext: String =
        ext.to_lowercase().chars().filter(|char| matches!(char, 'a'..='z' | '0'..='9' | '.')).take(8).collect();
    format!("{}{ext}", if base.is_empty() { "upload" } else { base.as_str() })
}

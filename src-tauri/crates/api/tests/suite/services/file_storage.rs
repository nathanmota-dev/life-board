use life_board_api::services::file_storage::FileStorageService;
use tempfile::TempDir;

use crate::common::{read_all, temp_dir};

fn setup() -> (TempDir, FileStorageService) {
    let dir = temp_dir("life-board-files-");
    let storage = FileStorageService::new(dir.path().join("uploads"));
    (dir, storage)
}

/// `/^\w{26}-<suffix>$/`.
#[track_caller]
fn assert_stored_as(storage_path: &str, suffix: &str) {
    let (id, rest) = storage_path.split_at(26.min(storage_path.len()));
    assert!(id.len() == 26 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_'), "{storage_path}");
    assert_eq!(rest, format!("-{suffix}"), "{storage_path}");
}

fn read(path: std::path::PathBuf) -> String {
    std::fs::read_to_string(path).unwrap()
}

#[tokio::test]
#[ignore = "pending #52"]
async fn saves_measures_streams_and_removes_files() {
    let (dir, storage) = setup();
    let blob = storage.save(b"hello", "My Receipt (1).PNG").await.unwrap();

    assert_eq!(blob.size_bytes, 5);
    assert_stored_as(&blob.storage_path, "My_Receipt__1_.png");
    assert_eq!(read(dir.path().join("uploads").join(&blob.storage_path)), "hello");
    assert_eq!(storage.size(&blob.storage_path).await.unwrap(), 5);
    assert_eq!(read_all(storage.open(&blob.storage_path).await.unwrap()).await, "hello");

    storage.remove(&blob.storage_path).await.unwrap();
    assert!(storage.size(&blob.storage_path).await.is_err());
    // Removing a file that's already gone is fine.
    storage.remove(&blob.storage_path).await.unwrap();
}

#[tokio::test]
#[ignore = "pending #52"]
async fn switches_roots_and_copies_files_to_another_storage() {
    let (dir, storage) = setup();
    let blob = storage.save(b"hello", "a.txt").await.unwrap();
    let other = dir.path().join("other").join("uploads");
    let target = FileStorageService::new(&other);

    storage.copy_to(&blob.storage_path, &target).await.unwrap();
    assert_eq!(read(other.join(&blob.storage_path)), "hello");
    assert_eq!(storage.size(&blob.storage_path).await.unwrap(), 5);

    storage.set_root(&other);
    assert_eq!(storage.root(), other);
    let next = storage.save(b"x", "b.txt").await.unwrap();
    assert_eq!(read(other.join(&next.storage_path)), "x");
}

#[tokio::test]
#[ignore = "pending #52"]
async fn sanitizes_hostile_names_and_falls_back_when_nothing_is_left() {
    let (_dir, storage) = setup();
    let blob = storage.save(b"x", "../../etc/passwd").await.unwrap();
    assert_stored_as(&blob.storage_path, "passwd");

    let unnamed = storage.save(b"x", "").await.unwrap();
    assert_stored_as(&unnamed.storage_path, "upload");
}

#[tokio::test]
#[ignore = "pending #52"]
async fn refuses_storage_paths_outside_the_root() {
    let (_dir, storage) = setup();
    assert_eq!(storage.size("../secret.key").await.unwrap_err().to_string(), "Invalid storage path.");
    assert_eq!(storage.open("/etc/passwd").await.unwrap_err().to_string(), "Invalid storage path.");
    assert_eq!(storage.remove("..").await.unwrap_err().to_string(), "Invalid storage path.");
}

#[tokio::test]
#[ignore = "pending #52"]
async fn works_under_a_profile_path_with_spaces_non_ascii_and_url_syntax() {
    let (dir, _storage) = setup();
    let root = dir.path().join("Usuário Ç #1 %20").join("uploads");
    let profile = FileStorageService::new(&root);
    let blob = profile.save("olá".as_bytes(), "Recibo de março.pdf").await.unwrap();

    assert_eq!(read(root.join(&blob.storage_path)), "olá");
    assert_eq!(read_all(profile.open(&blob.storage_path).await.unwrap()).await, "olá");
    profile.remove(&blob.storage_path).await.unwrap();
    assert!(profile.size(&blob.storage_path).await.is_err());
}

#[tokio::test]
#[ignore = "pending #52"]
async fn rethrows_unexpected_errors_when_removing() {
    let (_dir, storage) = setup();
    let blob = storage.save(b"x", "a.txt").await.unwrap();
    // Removing the uploads directory itself as a file fails, not as an already missing file.
    assert!(storage.remove(&format!("{}/..", blob.storage_path)).await.is_err());
}

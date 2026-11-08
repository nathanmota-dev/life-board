use std::io::ErrorKind;

use life_board_api::services::file_storage::{Disk, FileStorageService, RealDisk};
use tempfile::TempDir;

use crate::common::{list_dir, read_all, temp_dir};

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
async fn sanitizes_hostile_names_and_falls_back_when_nothing_is_left() {
    let (_dir, storage) = setup();
    let blob = storage.save(b"x", "../../etc/passwd").await.unwrap();
    assert_stored_as(&blob.storage_path, "passwd");

    let unnamed = storage.save(b"x", "").await.unwrap();
    assert_stored_as(&unnamed.storage_path, "upload");
}

#[tokio::test]
async fn refuses_storage_paths_outside_the_root() {
    let (_dir, storage) = setup();
    assert_eq!(storage.size("../secret.key").await.unwrap_err().to_string(), "Invalid storage path.");
    assert_eq!(storage.open("/etc/passwd").await.unwrap_err().to_string(), "Invalid storage path.");
    assert_eq!(storage.remove("..").await.unwrap_err().to_string(), "Invalid storage path.");
}

#[tokio::test]
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
async fn rethrows_unexpected_errors_when_removing() {
    let (_dir, storage) = setup();
    let blob = storage.save(b"x", "a.txt").await.unwrap();
    // Removing the uploads directory itself as a file fails, not as an already missing file.
    assert!(storage.remove(&format!("{}/..", blob.storage_path)).await.is_err());
}

#[tokio::test]
async fn names_stored_files_like_the_node_path_and_regex_rules() {
    let (_dir, storage) = setup();
    for (name, suffix) in [
        (".bashrc", "_bashrc".to_owned()),
        ("a.", "a.".to_owned()),
        ("archive.TAR.GZ", "archive_TAR.gz".to_owned()),
        ("😀.png", "__.png".to_owned()),
        ("café.jpg", "caf_.jpg".to_owned()),
        ("..", "__".to_owned()),
        ("...", "__.".to_owned()),
        (".", "_".to_owned()),
        ("name.ABCDEFGHIJKL", "name.abcdefg".to_owned()),
        ("a b/c d.Txt", "c_d.txt".to_owned()),
        ("dir/", "dir".to_owned()),
        ("K.K\u{212A}", "K.kk".to_owned()),
        (&"x".repeat(150), "x".repeat(100)),
    ] {
        let blob = storage.save(b"x", name).await.unwrap();
        assert_stored_as(&blob.storage_path, &suffix);
    }
}

#[test]
fn keeps_every_path_inside_the_root_on_each_os() {
    let (_dir, storage) = setup();
    let root = storage.root();
    let invalid = |path: &str| storage.resolve(path).unwrap_err().to_string() == "Invalid storage path.";

    for path in ["", ".", "..", "../secret.key", "a/../../secret.key", "a/..", "/etc/passwd", "/"] {
        assert!(invalid(path), "{path}");
    }
    assert_eq!(storage.resolve("a/../b.txt").unwrap(), root.join("b.txt"));
    if cfg!(windows) {
        for path in [
            r"..\secret.key",
            r"a\..\..\secret.key",
            r"C:\Windows\system32",
            "C:relative",
            r"\rooted",
            r"\\server\share\x",
        ] {
            assert!(invalid(path), "{path}");
        }
        assert_eq!(storage.resolve(r"a\..\b.txt").unwrap(), root.join("b.txt"));
    } else {
        // Only `/` separates paths here: this is one odd file name inside the root.
        assert_eq!(storage.resolve(r"..\secret.key").unwrap(), root.join(r"..\secret.key"));
    }
}

#[tokio::test]
async fn checks_that_a_folder_accepts_new_files_and_leaves_nothing_behind() {
    let (dir, _storage) = setup();
    let file = dir.path().join("file.txt");
    std::fs::write(&file, "x").unwrap();

    assert!(RealDisk.check_writable_dir(dir.path()).await.is_ok());
    assert_eq!(list_dir(dir.path()), ["file.txt"]);
    assert_eq!(RealDisk.check_writable_dir(&dir.path().join("missing")).await.unwrap_err().kind(), ErrorKind::NotFound);
    assert!(RealDisk.check_writable_dir(&file).await.is_err());

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let locked = dir.path().join("locked");
        std::fs::create_dir(&locked).unwrap();
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o555)).unwrap();
        // root ignores the mode, so there is nothing to observe under it.
        if std::fs::File::create(locked.join("probe")).is_err() {
            assert!(RealDisk.check_writable_dir(&locked).await.is_err());
        }
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o755)).unwrap();
    }
}

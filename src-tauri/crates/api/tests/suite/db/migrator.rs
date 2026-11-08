//! Rust-only: the embedded migrations are Drizzle's, recorded the way Drizzle
//! records them, so Node and Rust can open each other's profiles.

use life_board_api::db::{Db, MIGRATIONS};
use rusqlite::{Connection, OpenFlags};
use serde::Deserialize;

use crate::common::{NODE_PROFILE, fixture, temp_dir};

#[derive(Deserialize)]
struct Journal {
    entries: Vec<JournalEntry>,
}

#[derive(Deserialize)]
struct JournalEntry {
    tag: String,
    when: i64,
}

fn drizzle_folder() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../api/drizzle")
}

fn recorded(path: &std::path::Path) -> Vec<(String, i64)> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
    let mut statement = conn.prepare("SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at").unwrap();
    statement.query_map([], |row| Ok((row.get(0)?, row.get(1)?))).unwrap().collect::<Result<_, _>>().unwrap()
}

fn schema(path: &std::path::Path) -> Vec<(String, Option<String>)> {
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY).unwrap();
    let mut statement = conn.prepare("SELECT name, sql FROM sqlite_master ORDER BY type, name").unwrap();
    statement.query_map([], |row| Ok((row.get(0)?, row.get(1)?))).unwrap().collect::<Result<_, _>>().unwrap()
}

#[test]
fn embeds_every_migration_of_the_drizzle_journal() {
    let folder = drizzle_folder();
    let journal: Journal =
        serde_json::from_str(&std::fs::read_to_string(folder.join("meta/_journal.json")).unwrap()).unwrap();
    let embedded: Vec<(&str, i64)> = MIGRATIONS.iter().map(|migration| (migration.tag, migration.when)).collect();
    let expected: Vec<(&str, i64)> = journal.entries.iter().map(|entry| (entry.tag.as_str(), entry.when)).collect();
    assert_eq!(embedded, expected);
    for migration in MIGRATIONS {
        let sql = std::fs::read_to_string(folder.join(format!("{}.sql", migration.tag))).unwrap();
        assert_eq!(migration.sql, sql, "{} differs from its file", migration.tag);
    }
}

#[test]
fn hashes_migrations_like_drizzle_did_in_the_node_profile() {
    let embedded: Vec<(String, i64)> = MIGRATIONS.iter().map(|migration| (migration.hash(), migration.when)).collect();
    assert_eq!(recorded(&fixture(&format!("{NODE_PROFILE}.db"))), embedded);
}

#[tokio::test]
async fn leaves_a_profile_migrated_by_node_unchanged() {
    let dir = temp_dir("node-profile-");
    let path = dir.path().join("life-board.db");
    std::fs::copy(fixture(&format!("{NODE_PROFILE}.db")), &path).unwrap();
    let before = (recorded(&path), schema(&path));

    Db::open(&path).await.unwrap().close().await.unwrap();

    assert_eq!((recorded(&path), schema(&path)), before);
}

#[tokio::test]
async fn migrates_a_new_profile_to_the_schema_and_records_node_writes() {
    let dir = temp_dir("rust-profile-");
    let path = dir.path().join("life-board.db");

    Db::open(&path).await.unwrap().close().await.unwrap();

    let node = fixture(&format!("{NODE_PROFILE}.db"));
    assert_eq!(recorded(&path), recorded(&node));
    assert_eq!(schema(&path), schema(&node));
}

#[tokio::test]
async fn applies_only_the_missing_migrations_to_a_partially_migrated_profile() {
    let dir = temp_dir("partial-profile-");
    let path = dir.path().join("life-board.db");
    let legacy = Db::open_with(&path, &MIGRATIONS[..5]).await.unwrap();
    legacy
        .call(|conn| {
            conn.execute_batch("INSERT INTO tasks (id, title, tags, linked_thought_ids, created_at, updated_at) VALUES ('kept', 'Kept', '[]', '[]', 1792195200000, 1792195200000)")
        })
        .await
        .unwrap();
    legacy.close().await.unwrap();
    let before = recorded(&path);
    assert_eq!(before.len(), 5);

    let upgraded = Db::open(&path).await.unwrap();
    let title: String = upgraded
        .call(|conn| conn.query_row("SELECT title FROM tasks WHERE id = 'kept'", [], |row| row.get(0)))
        .await
        .unwrap();
    upgraded.close().await.unwrap();

    let after = recorded(&path);
    let embedded: Vec<(String, i64)> = MIGRATIONS.iter().map(|migration| (migration.hash(), migration.when)).collect();
    assert_eq!(after, embedded);
    assert_eq!(after[..5], before[..]);
    assert_eq!(title, "Kept");
    assert_eq!(schema(&path), schema(&fixture(&format!("{NODE_PROFILE}.db"))));
}

#[tokio::test]
async fn reopening_a_migrated_profile_records_nothing_new() {
    let dir = temp_dir("rust-profile-");
    let path = dir.path().join("life-board.db");
    Db::open(&path).await.unwrap().close().await.unwrap();
    let first = recorded(&path);

    Db::open(&path).await.unwrap().close().await.unwrap();

    assert_eq!(recorded(&path), first);
}

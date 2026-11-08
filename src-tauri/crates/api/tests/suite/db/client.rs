use std::path::Path;

use life_board_api::db::{Db, open_flags};
use rstest::rstest;
use rusqlite::OpenFlags;

use crate::common::{list_dir, temp_dir};

// `?` is valid in POSIX folder names only; the other names exist on every OS.
#[rstest]
#[case::spaces("com espaço")]
#[case::non_ascii("não-ascii ç日本")]
#[case::hash("C# projetos")]
#[case::encoded_space("100%20 off")]
#[case::percent("50% off")]
#[case::query_syntax("a&b=c;d")]
#[case::question_mark("what?")]
#[tokio::test]
async fn opens_the_database_exactly_at(#[case] folder: &str) {
    if cfg!(windows) && folder.contains('?') {
        return;
    }
    let root = temp_dir("life-board-url-");
    let dir = root.path().join(folder);
    std::fs::create_dir(&dir).unwrap();
    let database = Db::open(&dir.join("life-board.db")).await.unwrap();

    assert_eq!(list_dir(root.path()), vec![folder.to_owned()]);
    assert!(list_dir(&dir).contains(&"life-board.db".to_owned()));
    database.close().await.unwrap();
}

// Node encodes the path into a libsql `file:` URL. rusqlite takes the path
// itself, so the equivalent is opening without SQLite's URI parsing: a path
// is never read as `file:<path>?<query>#<fragment>` or an `//authority`.
#[rstest]
#[case::windows_profile(r"C:\Users\João Ninguém\AppData\Roaming\life-board-app\life-board.db")]
#[case::windows_symbols(r"D:\C# 100%\life-board.db")]
#[case::unc_share(r"\\server\share\life-board.db")]
#[case::double_slash("//home/user/.config/life-board-app/life-board.db")]
#[case::macos_profile("/Users/me/Library/Application Support/life-board-app/life-board.db")]
#[test]
fn keeps_intact_for_libsql(#[case] path: &str) {
    assert!(!open_flags().contains(OpenFlags::SQLITE_OPEN_URI));
    assert_eq!(Path::new(path).to_str(), Some(path));
}

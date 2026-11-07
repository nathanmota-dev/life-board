use serde_json::json;

use crate::common::{TestApp, assert_match};

fn display(path: &std::path::Path) -> String {
    path.to_string_lossy().into_owned()
}

#[tokio::test]
#[ignore = "pending #52"]
async fn reads_and_changes_the_uploads_folder() {
    let ctx = TestApp::new().await;
    let default_uploads_dir = display(&ctx.data_dir.join("uploads"));
    let initial = ctx.get("/api/settings/files").await;
    assert_eq!(
        initial.json(),
        json!({ "baseDir": null, "uploadsDir": default_uploads_dir, "defaultUploadsDir": default_uploads_dir })
    );

    let apps = ctx.data_dir.join("apps");
    std::fs::create_dir(&apps).unwrap();
    let changed = ctx.put("/api/settings/files", json!({ "baseDir": display(&apps) })).await;
    assert_match(
        &changed.json(),
        &json!({ "baseDir": display(&apps), "uploadsDir": display(&apps.join("life-board-app").join("uploads")) }),
    );

    let reset = ctx.put("/api/settings/files", json!({ "baseDir": null })).await;
    assert_match(&reset.json(), &json!({ "baseDir": null, "uploadsDir": default_uploads_dir }));
}

#[tokio::test]
#[ignore = "pending #52"]
async fn rejects_invalid_folders() {
    let ctx = TestApp::new().await;
    let empty = ctx.put("/api/settings/files", json!({ "baseDir": " " })).await;
    assert_eq!(empty.json()["error"], "validation_error");

    let missing = ctx.put("/api/settings/files", json!({ "baseDir": display(&ctx.data_dir.join("nope")) })).await;
    assert_eq!(missing.status(), 400);
    assert_eq!(missing.json()["error"], "invalid_dir");
}

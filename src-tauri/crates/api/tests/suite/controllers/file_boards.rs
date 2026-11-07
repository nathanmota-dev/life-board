use life_board_api::dto::file_boards::MAX_UPLOAD_BYTES;
use serde_json::json;

use crate::common::{TestApp, assert_match, len, multipart_request, text};

async fn create_board(ctx: &TestApp) -> String {
    let response = ctx.post("/api/file-boards", json!({ "name": "Receipts", "kind": "receipts" })).await;
    assert_eq!(response.status(), 201);
    text(&response.json(), "id")
}

#[tokio::test]
#[ignore = "pending #52"]
async fn manages_boards() {
    let ctx = TestApp::new().await;
    let id = create_board(&ctx).await;

    assert_eq!(len(&ctx.get("/api/file-boards").await.json()["items"]), 1);
    assert_eq!(ctx.patch(&format!("/api/file-boards/{id}"), json!({ "name": "Bills" })).await.json()["name"], "Bills");
    assert_eq!(ctx.delete(&format!("/api/file-boards/{id}")).await.json(), json!({ "ok": true }));
}

#[tokio::test]
#[ignore = "pending #52"]
async fn uploads_downloads_updates_and_deletes_items() {
    let ctx = TestApp::new().await;
    let board_id = create_board(&ctx).await;
    let upload = ctx
        .send(multipart_request(
            &format!("/api/file-boards/{board_id}/items"),
            &[("kind", "receipt"), ("amountCents", "1990"), ("title", "Lunch")],
            Some(("lunch.png", "image/png", b"png")),
        ))
        .await;
    assert_eq!(upload.status(), 201);
    let item = upload.json();
    assert_match(&item, &json!({ "kind": "receipt", "amountCents": 1990, "title": "Lunch", "mime": "image/png" }));
    let item_id = text(&item, "id");

    assert_eq!(len(&ctx.get(&format!("/api/file-boards/{board_id}/items")).await.json()["items"]), 1);

    let download = ctx.get(&format!("/api/file-items/{item_id}/file")).await;
    assert_eq!(download.status(), 200);
    assert_eq!(download.header("content-type"), Some("image/png"));
    assert_eq!(download.text(), "png");

    let updated = ctx.patch(&format!("/api/file-items/{item_id}"), json!({ "notes": "Team lunch" })).await;
    assert_eq!(updated.json()["notes"], "Team lunch");

    assert_eq!(ctx.delete(&format!("/api/file-items/{item_id}")).await.json(), json!({ "ok": true }));
    assert_eq!(ctx.get(&format!("/api/file-items/{item_id}/file")).await.status(), 404);
}

#[tokio::test]
#[ignore = "pending #52"]
async fn stops_serving_a_board_s_files_once_the_board_is_deleted() {
    let ctx = TestApp::new().await;
    let board_id = create_board(&ctx).await;
    let upload = ctx
        .send(multipart_request(
            &format!("/api/file-boards/{board_id}/items"),
            &[],
            Some(("a.png", "image/png", b"png")),
        ))
        .await;
    let item = upload.json();

    assert_eq!(ctx.delete(&format!("/api/file-boards/{board_id}")).await.json(), json!({ "ok": true }));
    assert_eq!(ctx.get(&format!("/api/file-items/{}/file", text(&item, "id"))).await.status(), 404);
    assert!(!ctx.data_dir.join("uploads").join(text(&item, "storagePath")).exists());
}

#[tokio::test]
#[ignore = "pending #52"]
async fn rejects_uploads_without_a_file_with_bad_fields_or_over_the_size_limit() {
    let ctx = TestApp::new().await;
    let board_id = create_board(&ctx).await;
    let url = format!("/api/file-boards/{board_id}/items");

    let no_body = ctx.post(&url, json!({})).await;
    assert_eq!(no_body.json()["error"], "missing_file");

    let no_file = ctx.send(multipart_request(&url, &[("title", "x")], None)).await;
    assert_eq!(no_file.json()["error"], "missing_file");

    let bad_field =
        ctx.send(multipart_request(&url, &[("kind", "spaceship")], Some(("a.txt", "text/plain", b"a")))).await;
    assert_eq!(bad_field.status(), 400);
    assert_eq!(bad_field.json()["error"], "validation_error");

    let big = vec![0_u8; MAX_UPLOAD_BYTES + 1];
    let too_large = ctx.send(multipart_request(&url, &[], Some(("big.bin", "application/octet-stream", &big)))).await;
    assert_eq!(too_large.status(), 413);

    let unknown_board =
        ctx.send(multipart_request("/api/file-boards/missing/items", &[], Some(("a.txt", "text/plain", b"a")))).await;
    assert_eq!(unknown_board.status(), 404);
}

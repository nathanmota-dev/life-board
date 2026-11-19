use life_board_api::dto::file_boards::MAX_TEXT_CONTENT_BYTES;
use serde_json::{Value, json};

use crate::common::{TestApp, assert_match, len, list_dir, multipart_request, pluck, text};

async fn create(ctx: &TestApp, body: Value) -> Value {
    let response = ctx.post("/api/pages", body).await;
    assert_eq!(response.status(), 201, "{}", response.text());
    response.json()
}

fn pages_dir(ctx: &TestApp) -> std::path::PathBuf {
    ctx.data_dir.join("pages")
}

async fn import(ctx: &TestApp, fields: &[(&str, &str)], file: (&str, &str, &[u8])) -> crate::common::TestResponse {
    ctx.send(multipart_request("/api/pages/import", fields, Some(file))).await
}

#[tokio::test]
async fn builds_lists_renames_moves_and_deletes_a_three_level_tree_keeping_the_file_names() {
    let ctx = TestApp::new().await;
    let a = create(&ctx, json!({ "kind": "folder", "title": "  A  " })).await;
    let b = create(&ctx, json!({ "kind": "folder", "title": "B", "parentId": a["id"] })).await;
    let page =
        create(&ctx, json!({ "kind": "page", "title": "Doc", "parentId": b["id"], "content": "# Hi\r\n" })).await;
    assert_match(
        &page,
        &json!({ "kind": "page", "title": "Doc", "parentId": b["id"], "sizeBytes": 6, "createdAt": "<any string>" }),
    );
    assert_eq!(a["title"], "A");
    assert!(page.get("storagePath").is_none() && page.get("content").is_none());
    let file = format!("{}.md", text(&page, "id"));
    assert_eq!(list_dir(&pages_dir(&ctx)), std::slice::from_ref(&file));

    let listed = ctx.get("/api/pages").await.json();
    assert_eq!(pluck(&listed["items"], "title"), [json!("A"), json!("B"), json!("Doc")]);

    let id = text(&page, "id");
    let renamed = ctx.patch(&format!("/api/pages/{id}"), json!({ "title": "Renamed", "parentId": null })).await;
    assert_match(&renamed.json(), &json!({ "title": "Renamed", "parentId": null }));
    let moved = ctx.patch(&format!("/api/pages/{id}"), json!({ "parentId": a["id"] })).await;
    assert_eq!(moved.json()["parentId"], a["id"]);
    assert_eq!(list_dir(&pages_dir(&ctx)), [file]);

    let deleted = ctx.delete(&format!("/api/pages/{}", text(&a, "id"))).await;
    assert_eq!((deleted.status(), deleted.json()), (200, json!({ "ok": true })));
    assert_eq!(len(&ctx.get("/api/pages").await.json()["items"]), 0);
    assert!(list_dir(&pages_dir(&ctx)).is_empty());
}

#[tokio::test]
async fn reads_and_saves_a_page_s_content_exactly() {
    let ctx = TestApp::new().await;
    let page = create(&ctx, json!({ "kind": "page", "title": "Doc" })).await;
    let url = format!("/api/pages/{}/content", text(&page, "id"));

    let empty = ctx.get(&url).await;
    assert_match(&empty.json(), &json!({ "content": "", "updatedAt": "<any string>" }));

    let text_with_crlf = "# T\r\n\r\n  indented\r\n\r\n";
    let saved = ctx.put(&url, json!({ "content": text_with_crlf })).await;
    assert_eq!(saved.status(), 200);
    assert_match(&saved.json(), &json!({ "sizeBytes": text_with_crlf.len(), "title": "Doc" }));
    assert_eq!(ctx.get(&url).await.json()["content"], text_with_crlf);
    assert_eq!(
        std::fs::read_to_string(pages_dir(&ctx).join(format!("{}.md", text(&page, "id")))).unwrap(),
        text_with_crlf
    );
}

#[tokio::test]
async fn refuses_bad_requests_and_unknown_items() {
    let ctx = TestApp::new().await;
    let folder = create(&ctx, json!({ "kind": "folder", "title": "F" })).await;
    let page = create(&ctx, json!({ "kind": "page", "title": "P" })).await;
    let (folder_id, page_id) = (text(&folder, "id"), text(&page, "id"));

    let content_of_folder = ctx.get(&format!("/api/pages/{folder_id}/content")).await;
    assert_match(&content_of_folder.json(), &json!({ "error": "not_a_page" }));
    assert_eq!(content_of_folder.status(), 400);
    assert_eq!(ctx.put(&format!("/api/pages/{folder_id}/content"), json!({ "content": "x" })).await.status(), 400);

    let into_page = ctx.post("/api/pages", json!({ "kind": "page", "title": "X", "parentId": page_id })).await;
    assert_eq!((into_page.status(), into_page.json()["error"].clone()), (400, json!("invalid_parent")));
    let into_self = ctx.patch(&format!("/api/pages/{folder_id}"), json!({ "parentId": folder_id })).await;
    assert_eq!((into_self.status(), into_self.json()["error"].clone()), (400, json!("invalid_parent")));

    for uri in ["/content", ""] {
        assert_eq!(ctx.get(&format!("/api/pages/missing{uri}")).await.status(), 404);
    }
    assert_eq!(ctx.patch("/api/pages/missing", json!({ "title": "x" })).await.status(), 404);
    assert_eq!(ctx.put("/api/pages/missing/content", json!({ "content": "x" })).await.status(), 404);
    assert_eq!(ctx.delete("/api/pages/missing").await.status(), 404);

    std::fs::remove_file(pages_dir(&ctx).join(format!("{page_id}.md"))).unwrap();
    let gone = ctx.get(&format!("/api/pages/{page_id}/content")).await;
    assert_eq!((gone.status(), gone.json()["error"].clone()), (404, json!("content_missing")));
}

#[tokio::test]
async fn validates_the_bodies() {
    let ctx = TestApp::new().await;
    let page = create(&ctx, json!({ "kind": "page", "title": "P" })).await;
    for body in [
        json!({ "title": "x" }),
        json!({ "kind": "other", "title": "x" }),
        json!({ "kind": "page" }),
        json!({ "kind": "page", "title": "   " }),
        json!({ "kind": "page", "title": "x".repeat(201) }),
        json!({ "kind": "folder", "title": "x", "content": "text" }),
        json!({ "kind": "page", "title": "x", "content": 1 }),
    ] {
        let response = ctx.post("/api/pages", body.clone()).await;
        assert_eq!((response.status(), response.json()["error"].clone()), (400, json!("validation_error")), "{body}");
    }
    let id = text(&page, "id");
    assert_eq!(ctx.patch(&format!("/api/pages/{id}"), json!({ "title": "" })).await.status(), 400);
    assert_eq!(ctx.put(&format!("/api/pages/{id}/content"), json!({})).await.status(), 400);
}

#[tokio::test]
async fn limits_the_size_of_the_text() {
    let ctx = TestApp::new().await;
    let page = create(&ctx, json!({ "kind": "page", "title": "P" })).await;
    let url = format!("/api/pages/{}/content", text(&page, "id"));

    // Two megabytes of text that JSON has to escape still fit in the request.
    let escaped = "\n".repeat(MAX_TEXT_CONTENT_BYTES);
    assert_eq!(ctx.put(&url, json!({ "content": escaped })).await.status(), 200);

    let too_big = ctx.put(&url, json!({ "content": "a".repeat(MAX_TEXT_CONTENT_BYTES + 1) })).await;
    assert_eq!((too_big.status(), too_big.json()["error"].clone()), (413, json!("content_too_large")));
    let on_create = ctx
        .post("/api/pages", json!({ "kind": "page", "title": "x", "content": "a".repeat(MAX_TEXT_CONTENT_BYTES + 1) }))
        .await;
    assert_eq!(on_create.status(), 413);
}

#[tokio::test]
async fn imports_markdown_twice_reusing_the_folders() {
    let ctx = TestApp::new().await;
    let fields = [("folderPath", "VBL/AKYOU")];
    let first = import(&ctx, &fields, ("MindShef - Task.md", "text/markdown", b"# One\r\n")).await;
    assert_eq!(first.status(), 201, "{}", first.text());
    let second = import(&ctx, &fields, ("MindShef - Task.md", "text/markdown", b"# Two")).await;
    assert_eq!(second.status(), 201);

    let items = ctx.get("/api/pages").await.json()["items"].clone();
    let kinds: Vec<&Value> = items.as_array().unwrap().iter().map(|item| &item["kind"]).collect();
    assert_eq!(kinds, [&json!("folder"), &json!("folder"), &json!("page"), &json!("page")]);
    assert_eq!(first.json()["parentId"], second.json()["parentId"]);
    assert_eq!(first.json()["title"], "MindShef - Task");

    let under =
        import(&ctx, &[("parentId", &text(&first.json(), "parentId")), ("folderPath", "")], ("x.markdown", "", b"x"))
            .await;
    assert_eq!(under.status(), 201);
    assert_eq!(under.json()["parentId"], first.json()["parentId"]);
}

#[tokio::test]
async fn refuses_bad_imports() {
    let ctx = TestApp::new().await;
    let page = create(&ctx, json!({ "kind": "page", "title": "P" })).await;

    let txt = import(&ctx, &[], ("a.txt", "text/plain", b"x")).await;
    assert_eq!((txt.status(), txt.json()["error"].clone()), (400, json!("unsupported_type")));
    let encoding = import(&ctx, &[], ("a.md", "text/markdown", &[0xff, 0xfe])).await;
    assert_eq!((encoding.status(), encoding.json()["error"].clone()), (400, json!("invalid_encoding")));
    let parent = import(&ctx, &[("parentId", &text(&page, "id"))], ("a.md", "text/markdown", b"x")).await;
    assert_eq!((parent.status(), parent.json()["error"].clone()), (400, json!("invalid_parent")));
    let missing = ctx.send(multipart_request("/api/pages/import", &[], None)).await;
    assert_eq!((missing.status(), missing.json()["error"].clone()), (400, json!("missing_file")));

    let big = vec![b'a'; MAX_TEXT_CONTENT_BYTES + 1];
    let too_big = import(&ctx, &[], ("a.md", "text/markdown", &big)).await;
    assert_eq!(too_big.status(), 413);
    let at_limit = vec![b'a'; MAX_TEXT_CONTENT_BYTES];
    assert_eq!(import(&ctx, &[], ("a.md", "text/markdown", &at_limit)).await.status(), 201);
    assert_eq!(len(&ctx.get("/api/pages").await.json()["items"]), 2);
}

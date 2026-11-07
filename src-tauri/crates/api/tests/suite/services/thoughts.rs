use life_board_api::db::schema::thoughts::{self, NewThought};
use life_board_api::dto::thoughts::{CreateThoughtBody, ListThoughtsQuery, UpdateThoughtBody};
use life_board_api::services::thoughts::ThoughtsService;
use serde_json::json;

use crate::common::{TestDb, assert_match, assert_not_found, ms, test_db, to_json};

async fn setup() -> (TestDb, ThoughtsService) {
    let ctx = test_db().await;
    let service = ThoughtsService::new(ctx.db.clone());
    (ctx, service)
}

fn query(limit: i64) -> ListThoughtsQuery {
    ListThoughtsQuery { limit, ..Default::default() }
}

#[tokio::test]
#[ignore = "pending #51"]
async fn lists_pinned_thoughts_first_newest_first_with_cursor_pagination() {
    let (ctx, service) = setup().await;
    let thought = |id: &str, body: &str, created: i64| NewThought {
        id: id.into(),
        body: Some(body.into()),
        created_at: Some(ms(created)),
        ..Default::default()
    };
    thoughts::insert(
        &ctx.db,
        vec![
            thought("a", "oldest", 1_000),
            thought("b", "middle", 2_000),
            thought("c", "newest", 3_000),
            NewThought { pinned: Some(true), ..thought("p", "pinned", 500) },
        ],
    )
    .await
    .unwrap();

    let first = service.list(query(2)).await.unwrap();
    assert_eq!(first.items.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(), ["p", "c"]);
    assert_eq!(first.next_cursor.as_deref(), Some("0:3000:c"));

    let second = service.list(ListThoughtsQuery { cursor: first.next_cursor, ..query(2) }).await.unwrap();
    assert_eq!(second.items.iter().map(|t| t.id.as_str()).collect::<Vec<_>>(), ["b", "a"]);
    assert_eq!(second.next_cursor, None);
}

#[tokio::test]
#[ignore = "pending #51"]
async fn filters_by_pinned_tag_and_search() {
    let (_ctx, service) = setup().await;
    service
        .create(CreateThoughtBody {
            title: Some(Some("Idea".into())),
            body: Some("Build a habit tracker".into()),
            tags: Some(vec!["app".into()]),
            pinned: Some(true),
            ..Default::default()
        })
        .await
        .unwrap();
    service.create(CreateThoughtBody { body: Some("Groceries".into()), ..Default::default() }).await.unwrap();

    assert_eq!(service.list(ListThoughtsQuery { pinned: Some(true), ..query(10) }).await.unwrap().items.len(), 1);
    assert_eq!(
        service.list(ListThoughtsQuery { pinned: Some(false), ..query(10) }).await.unwrap().items[0].body,
        "Groceries"
    );
    let title = |page: life_board_api::services::thoughts::ThoughtPage| page.items[0].title.clone();
    assert_eq!(
        title(service.list(ListThoughtsQuery { tag: Some("app".into()), ..query(10) }).await.unwrap()).as_deref(),
        Some("Idea")
    );
    assert_eq!(
        title(service.list(ListThoughtsQuery { search: Some("habit".into()), ..query(10) }).await.unwrap()).as_deref(),
        Some("Idea")
    );
    assert_eq!(
        service.list(ListThoughtsQuery { search: Some("idea".into()), ..query(10) }).await.unwrap().items.len(),
        1
    );
}

#[tokio::test]
#[ignore = "pending #51"]
async fn gets_updates_and_soft_deletes() {
    let (_ctx, service) = setup().await;
    let thought = service.create(CreateThoughtBody { body: Some("Draft".into()), ..Default::default() }).await.unwrap();
    assert_match(&to_json(&thought), &json!({ "title": null, "pinned": false, "tags": [] }));

    assert!(
        service
            .update(&thought.id, UpdateThoughtBody { pinned: Some(true), ..Default::default() })
            .await
            .unwrap()
            .pinned
    );
    assert!(service.get(&thought.id).await.unwrap().pinned);

    service.remove(&thought.id).await.unwrap();
    assert_not_found(service.get(&thought.id).await);
    assert_not_found(
        service.update(&thought.id, UpdateThoughtBody { body: Some("x".into()), ..Default::default() }).await,
    );
    assert_not_found(service.remove(&thought.id).await);
}

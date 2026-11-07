use life_board_api::db::schema::calendar::{self, NewCalendarEvent};
use life_board_api::db::schema::goals::{NewGoal, insert_goals};
use life_board_api::db::schema::tasks::{self, NewTask, TaskStatus};
use life_board_api::db::schema::thoughts::{self, NewThought};
use life_board_api::dto::links::{BacklinkKind, BacklinkTarget, ResolveLinksBody};
use life_board_api::services::links::LinksService;
use serde_json::json;

use crate::common::{ANY_STRING, TestDb, assert_match, local, now, test_db, to_json};

fn ids(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| (*value).to_owned()).collect()
}

async fn setup() -> (TestDb, LinksService) {
    let ctx = test_db().await;
    let service = LinksService::new(ctx.db.clone());
    tasks::insert(
        &ctx.db,
        vec![
            NewTask {
                id: "t1".into(),
                title: "Write report".into(),
                linked_thought_ids: Some(ids(&["th1"])),
                ..Default::default()
            },
            NewTask {
                id: "t2".into(),
                title: "Ship it".into(),
                status: Some(TaskStatus::Done),
                linked_thought_ids: Some(ids(&["th1"])),
                ..Default::default()
            },
            NewTask {
                id: "t3".into(),
                title: "Deleted".into(),
                linked_thought_ids: Some(ids(&["th1"])),
                deleted_at: Some(now()),
                ..Default::default()
            },
        ],
    )
    .await
    .unwrap();
    thoughts::insert(
        &ctx.db,
        vec![
            NewThought {
                id: "th1".into(),
                title: Some("Report idea".into()),
                linked_task_ids: Some(ids(&["t1"])),
                ..Default::default()
            },
            NewThought {
                id: "th2".into(),
                body: Some("<p>An <b>untitled</b> note</p>".into()),
                linked_task_ids: Some(ids(&["t1"])),
                ..Default::default()
            },
            NewThought {
                id: "th3".into(),
                body: Some(String::new()),
                linked_task_ids: Some(ids(&["t1"])),
                ..Default::default()
            },
        ],
    )
    .await
    .unwrap();
    calendar::insert(
        &ctx.db,
        vec![NewCalendarEvent {
            id: "e1".into(),
            title: "Review".into(),
            start_at: local(2026, 10, 17, 10, 0),
            end_at: local(2026, 10, 17, 11, 0),
            linked_task_ids: Some(ids(&["t1"])),
            linked_thought_ids: Some(ids(&["th1"])),
            ..Default::default()
        }],
    )
    .await
    .unwrap();
    insert_goals(
        &ctx.db,
        vec![NewGoal {
            id: "g1".into(),
            title: "Get promoted".into(),
            linked_task_ids: Some(ids(&["t1"])),
            ..Default::default()
        }],
    )
    .await
    .unwrap();
    (ctx, service)
}

#[tokio::test]
#[ignore = "pending #51"]
async fn resolves_ids_from_every_module_and_skips_deleted_ones() {
    let (_ctx, service) = setup().await;
    let links = service
        .resolve(ResolveLinksBody {
            task_ids: ids(&["t1", "t3"]),
            thought_ids: ids(&["th1"]),
            calendar_ids: ids(&["e1"]),
            goal_ids: ids(&["g1"]),
        })
        .await
        .unwrap();

    let found: Vec<String> = links
        .iter()
        .map(|link| {
            let link = to_json(link);
            format!("{}:{}", link["moduleId"].as_str().unwrap(), link["entity"]["id"].as_str().unwrap())
        })
        .collect();
    assert_eq!(found, ["tasks:t1", "thoughts:th1", "calendar:e1", "goals:g1"]);
    assert_eq!(service.resolve(ResolveLinksBody::default()).await.unwrap(), []);
}

#[tokio::test]
#[ignore = "pending #51"]
async fn finds_what_links_to_a_thought() {
    let (_ctx, service) = setup().await;
    let backlinks = service.backlinks(BacklinkTarget { kind: BacklinkKind::Thought, id: "th1".into() }).await.unwrap();

    assert_match(
        &to_json(&backlinks),
        &json!([
            { "source": "tasks", "sourceId": "t1", "label": "Write report", "meta": "none" },
            { "source": "tasks", "sourceId": "t2", "label": "Ship it", "meta": "done" },
            { "source": "calendar", "sourceId": "e1", "label": "Review", "meta": ANY_STRING },
        ]),
    );
}

#[tokio::test]
#[ignore = "pending #51"]
async fn finds_what_links_to_a_task_labelling_untitled_thoughts_from_their_body() {
    let (_ctx, service) = setup().await;
    let backlinks = service.backlinks(BacklinkTarget { kind: BacklinkKind::Task, id: "t1".into() }).await.unwrap();

    let pairs: Vec<(String, String)> =
        backlinks.iter().map(|link| (link.source.to_string(), link.label.clone())).collect();
    let expected = [
        ("thoughts", "Report idea"),
        ("thoughts", "An untitled note"),
        ("thoughts", "(untitled thought)"),
        ("calendar", "Review"),
        ("goals", "Get promoted"),
    ];
    assert_eq!(pairs, expected.map(|(source, label)| (source.to_owned(), label.to_owned())));
}

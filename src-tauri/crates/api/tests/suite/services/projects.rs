use life_board_api::db::columns::{StringEnum, to_millis};
use life_board_api::db::schema::projects::{NewProject, ProjectStatus, insert_projects};
use life_board_api::dto::projects::{CreateProjectBody, ListProjectsQuery, MoveProjectBody, UpdateProjectBody};
use life_board_api::services::projects::{ARCHIVE_AFTER_MS, ProjectsService};
use serde_json::json;

use crate::common::{TestDb, assert_bad_request, assert_match, assert_not_found, ms, now, test_db, to_json};

async fn setup() -> (TestDb, ProjectsService) {
    let ctx = test_db().await;
    let service = ProjectsService::new(ctx.db.clone());
    (ctx, service)
}

/// The board as (title, status, order), column by column.
async fn board(service: &ProjectsService) -> Vec<(String, ProjectStatus, i64)> {
    let column = |status: &ProjectStatus| ProjectStatus::ALL.iter().position(|item| item == status);
    let mut cards: Vec<(String, ProjectStatus, i64)> = service
        .list(ListProjectsQuery::default())
        .await
        .unwrap()
        .items
        .into_iter()
        .map(|p| (p.title, p.status, p.order))
        .collect();
    cards.sort_by_key(|(_, status, order)| (column(status), *order));
    cards
}

fn card(title: &str, status: ProjectStatus, order: i64) -> (String, ProjectStatus, i64) {
    (title.into(), status, order)
}

fn titled(title: &str) -> CreateProjectBody {
    CreateProjectBody { title: title.into(), ..Default::default() }
}

fn to(status: ProjectStatus, order: i64) -> MoveProjectBody {
    MoveProjectBody { status, order, pause_reason: None }
}

fn reason(text: &str) -> Option<Option<String>> {
    Some(Some(text.into()))
}

async fn archived_ids(service: &ProjectsService) -> Vec<String> {
    service.list(ListProjectsQuery { archived: true }).await.unwrap().items.into_iter().map(|p| p.id).collect()
}

#[tokio::test]
async fn adds_new_projects_to_the_top_of_their_column() {
    let (_ctx, service) = setup().await;
    let first = service.create(titled("Budget app")).await.unwrap();
    let second = service
        .create(CreateProjectBody { description: Some("Write about side projects".into()), ..titled("Blog") })
        .await
        .unwrap();
    let started = service
        .create(CreateProjectBody {
            status: Some(ProjectStatus::InProgress),
            pause_reason: reason("ignored"),
            ..titled("Garden")
        })
        .await
        .unwrap();

    assert_match(
        &to_json(&first),
        &json!({ "status": "idea", "description": "", "pauseReason": null, "archivedAt": null }),
    );
    assert_eq!(second.order, 0);
    assert_match(&to_json(&started), &json!({ "order": 0, "status": "in_progress", "pauseReason": null }));
    assert_eq!(
        board(&service).await,
        [
            card("Blog", ProjectStatus::Idea, 0),
            card("Budget app", ProjectStatus::Idea, 1),
            card("Garden", ProjectStatus::InProgress, 0)
        ]
    );
}

#[tokio::test]
async fn keeps_the_pause_reason_of_projects_created_as_paused() {
    let (_ctx, service) = setup().await;
    let paused = || Some(ProjectStatus::Paused);
    let waiting = service
        .create(CreateProjectBody { status: paused(), pause_reason: reason("Waiting"), ..titled("Paused") })
        .await
        .unwrap();
    assert_eq!(waiting.pause_reason.as_deref(), Some("Waiting"));
    let blank = service
        .create(CreateProjectBody { status: paused(), pause_reason: reason(""), ..titled("Blank") })
        .await
        .unwrap();
    assert_eq!(blank.pause_reason, None);
}

#[tokio::test]
async fn lists_by_order_then_creation_time() {
    let (ctx, service) = setup().await;
    let project = |id: &str, order, created| NewProject {
        id: id.into(),
        title: id.to_uppercase(),
        order: Some(order),
        created_at: Some(ms(created)),
        ..Default::default()
    };
    insert_projects(&ctx.db, vec![project("b", 1, 1_000), project("c", 0, 2_000), project("a", 0, 1_000)])
        .await
        .unwrap();
    let ids: Vec<String> =
        service.list(ListProjectsQuery::default()).await.unwrap().items.into_iter().map(|p| p.id).collect();
    assert_eq!(ids, ["a", "c", "b"]);
}

#[tokio::test]
async fn reorders_inside_a_column_without_gaps() {
    let (_ctx, service) = setup().await;
    let c = service.create(titled("C")).await.unwrap();
    service.create(titled("B")).await.unwrap();
    service.create(titled("A")).await.unwrap();

    let moved = service.r#move(&c.id, to(ProjectStatus::Idea, 0)).await.unwrap();
    let order: Vec<(String, i64)> = moved.items.into_iter().map(|p| (p.title, p.order)).collect();
    assert_eq!(order, [("C".to_owned(), 0), ("A".to_owned(), 1), ("B".to_owned(), 2)]);
    assert_eq!(service.history(&c.id).await.unwrap().items.len(), 1);
}

#[tokio::test]
async fn moves_across_columns_rewriting_both_of_them_and_recording_the_change() {
    let (_ctx, service) = setup().await;
    let b = service.create(titled("B")).await.unwrap();
    let a = service.create(titled("A")).await.unwrap();
    service.create(CreateProjectBody { status: Some(ProjectStatus::Paused), ..titled("Y") }).await.unwrap();
    service.create(CreateProjectBody { status: Some(ProjectStatus::Paused), ..titled("X") }).await.unwrap();
    let before = service.get(&a.id).await.unwrap().status_changed_at;

    service
        .r#move(&a.id, MoveProjectBody { pause_reason: reason("Waiting on parts"), ..to(ProjectStatus::Paused, 1) })
        .await
        .unwrap();
    assert_eq!(
        board(&service).await,
        [
            card("B", ProjectStatus::Idea, 0),
            card("X", ProjectStatus::Paused, 0),
            card("A", ProjectStatus::Paused, 1),
            card("Y", ProjectStatus::Paused, 2),
        ]
    );
    let moved = service.get(&a.id).await.unwrap();
    assert_eq!(moved.pause_reason.as_deref(), Some("Waiting on parts"));
    assert!(moved.status_changed_at >= before);
    let history: Vec<(ProjectStatus, Option<String>)> =
        service.history(&a.id).await.unwrap().items.into_iter().map(|h| (h.status, h.pause_reason)).collect();
    assert_eq!(history, [(ProjectStatus::Paused, Some("Waiting on parts".to_owned())), (ProjectStatus::Idea, None)]);

    service.r#move(&a.id, to(ProjectStatus::Planned, 50)).await.unwrap();
    assert_eq!(service.get(&a.id).await.unwrap().pause_reason, None);
    service.r#move(&b.id, to(ProjectStatus::Planned, 50)).await.unwrap();
    assert_eq!(
        board(&service).await,
        [
            card("A", ProjectStatus::Planned, 0),
            card("B", ProjectStatus::Planned, 1),
            card("X", ProjectStatus::Paused, 0),
            card("Y", ProjectStatus::Paused, 1),
        ]
    );
}

#[tokio::test]
async fn moves_a_project_when_its_status_is_edited() {
    let (_ctx, service) = setup().await;
    let a = service.create(titled("A")).await.unwrap();
    service.create(CreateProjectBody { status: Some(ProjectStatus::Paused), ..titled("Existing") }).await.unwrap();
    let update = |input: UpdateProjectBody| service.update(&a.id, input);

    let paused = update(UpdateProjectBody {
        title: Some("A2".into()),
        status: Some(ProjectStatus::Paused),
        pause_reason: reason("Busy"),
        ..Default::default()
    })
    .await
    .unwrap();
    assert_match(&to_json(&paused), &json!({ "title": "A2", "status": "paused", "order": 0, "pauseReason": "Busy" }));
    let pause = |status: Option<ProjectStatus>, text: &str| UpdateProjectBody {
        status,
        pause_reason: reason(text),
        ..Default::default()
    };
    assert_eq!(update(pause(None, "Still busy")).await.unwrap().pause_reason.as_deref(), Some("Still busy"));
    assert_eq!(update(pause(Some(ProjectStatus::Paused), "")).await.unwrap().pause_reason, None);
    assert_eq!(update(pause(Some(ProjectStatus::Done), "x")).await.unwrap().pause_reason, None);
    assert_eq!(update(pause(None, "not paused")).await.unwrap().pause_reason, None);
    let statuses: Vec<ProjectStatus> =
        service.history(&a.id).await.unwrap().items.into_iter().map(|h| h.status).collect();
    assert_eq!(statuses, [ProjectStatus::Done, ProjectStatus::Paused, ProjectStatus::Idea]);
}

#[tokio::test]
async fn archives_done_projects_and_restores_them_to_the_top_of_done() {
    let (_ctx, service) = setup().await;
    let idea = service.create(titled("Idea")).await.unwrap();
    let done = service.create(CreateProjectBody { status: Some(ProjectStatus::Done), ..titled("Done") }).await.unwrap();
    service.create(CreateProjectBody { status: Some(ProjectStatus::Done), ..titled("Other") }).await.unwrap();

    assert_bad_request(service.archive(&idea.id).await);
    assert!(service.archive(&done.id).await.unwrap().archived_at.is_some());
    assert_not_found(service.archive(&done.id).await);
    assert_not_found(service.r#move(&done.id, to(ProjectStatus::Idea, 0)).await);
    assert_eq!(board(&service).await, [card("Idea", ProjectStatus::Idea, 0), card("Other", ProjectStatus::Done, 0)]);
    let archived: Vec<String> =
        service.list(ListProjectsQuery { archived: true }).await.unwrap().items.into_iter().map(|p| p.title).collect();
    assert_eq!(archived, ["Done"]);
    assert_eq!(service.get(&done.id).await.unwrap().title, "Done");

    let restored = service.restore(&done.id).await.unwrap();
    assert_match(&to_json(&restored), &json!({ "archivedAt": null, "status": "done", "order": 0 }));
    assert_eq!(
        board(&service).await,
        [
            card("Idea", ProjectStatus::Idea, 0),
            card("Done", ProjectStatus::Done, 0),
            card("Other", ProjectStatus::Done, 1)
        ]
    );
    assert!(archived_ids(&service).await.is_empty());
    let statuses: Vec<ProjectStatus> =
        service.history(&done.id).await.unwrap().items.into_iter().map(|h| h.status).collect();
    assert_eq!(statuses, [ProjectStatus::Done, ProjectStatus::Done]);
    assert_not_found(service.restore(&done.id).await);
    assert_not_found(service.restore("missing").await);
}

#[tokio::test]
async fn archives_projects_that_have_been_done_for_over_14_days_when_the_board_is_listed() {
    let (ctx, service) = setup().await;
    let at = to_millis(now());
    let project = |id: &str, title: &str, status, changed| NewProject {
        id: id.into(),
        title: title.into(),
        status: Some(status),
        status_changed_at: Some(ms(changed)),
        ..Default::default()
    };
    insert_projects(
        &ctx.db,
        vec![
            project("old", "Old", ProjectStatus::Done, at - ARCHIVE_AFTER_MS - 1_000),
            project("recent", "Recent", ProjectStatus::Done, at - ARCHIVE_AFTER_MS + 60_000),
            project("paused", "Paused", ProjectStatus::Paused, 0),
        ],
    )
    .await
    .unwrap();

    let mut ids: Vec<String> =
        service.list(ListProjectsQuery::default()).await.unwrap().items.into_iter().map(|p| p.id).collect();
    ids.sort();
    assert_eq!(ids, ["paused", "recent"]);
    assert_eq!(archived_ids(&service).await, ["old"]);
}

#[tokio::test]
async fn undoes_a_delete_in_place() {
    let (_ctx, service) = setup().await;
    service.create(titled("B")).await.unwrap();
    let a = service.create(titled("A")).await.unwrap();

    service.remove(&a.id).await.unwrap();
    let titles: Vec<String> =
        service.list(ListProjectsQuery::default()).await.unwrap().items.into_iter().map(|p| p.title).collect();
    assert_eq!(titles, ["B"]);
    assert_match(&to_json(&service.restore(&a.id).await.unwrap()), &json!({ "deletedAt": null, "status": "idea" }));
    assert_eq!(board(&service).await, [card("A", ProjectStatus::Idea, 0), card("B", ProjectStatus::Idea, 1)]);
}

#[tokio::test]
async fn gets_updates_and_soft_deletes() {
    let (_ctx, service) = setup().await;
    let project = service.create(titled("Draft")).await.unwrap();

    let updated = service
        .update(&project.id, UpdateProjectBody { description: Some("Notes".into()), ..Default::default() })
        .await
        .unwrap();
    assert_eq!(updated.description, "Notes");
    assert_eq!(service.get(&project.id).await.unwrap().description, "Notes");

    service.remove(&project.id).await.unwrap();
    assert_not_found(service.get(&project.id).await);
    assert_not_found(service.history(&project.id).await);
    assert_not_found(
        service.update(&project.id, UpdateProjectBody { title: Some("x".into()), ..Default::default() }).await,
    );
    assert_not_found(service.remove(&project.id).await);
    assert!(service.list(ListProjectsQuery::default()).await.unwrap().items.is_empty());
}

#[tokio::test]
async fn drops_archived_projects_from_deletes_too() {
    let (ctx, service) = setup().await;
    let done = service.create(CreateProjectBody { status: Some(ProjectStatus::Done), ..titled("Done") }).await.unwrap();
    service.archive(&done.id).await.unwrap();
    service.remove(&done.id).await.unwrap();
    assert!(archived_ids(&service).await.is_empty());
    let id = done.id.clone();
    let archived_at: Option<i64> = ctx
        .db
        .call(move |conn| conn.query_row("SELECT archived_at FROM projects WHERE id = ?1", [id], |row| row.get(0)))
        .await
        .unwrap();
    assert!(archived_at.is_some());
}

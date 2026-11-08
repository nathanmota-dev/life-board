use life_board_api::db::columns::to_millis;
use life_board_api::db::schema::tasks::{TaskColor, TaskPriority, TaskStatus};
use life_board_api::dto::tasks::{
    CreateTaskBody, ListTasksQuery, ReorderTasksBody, TaskInclude, TaskOrder, UpdateTaskBody,
};
use life_board_api::services::tasks::{TaskList, TaskWithChildren, TasksService};
use serde_json::json;

use crate::common::{TestDb, assert_error, assert_match, assert_not_found, local_day, now, test_db, to_json};

async fn setup() -> (TestDb, TasksService) {
    let ctx = test_db().await;
    let service = TasksService::new(ctx.db.clone());
    (ctx, service)
}

/// `service.list({ limit: 50, ...query })`.
async fn list(service: &TasksService, query: ListTasksQuery) -> TaskList {
    service.list(query).await.unwrap()
}

fn titles(list: &TaskList) -> Vec<String> {
    list.tasks().iter().map(|task| task.title.clone()).collect()
}

fn sorted(mut values: Vec<String>) -> Vec<String> {
    values.sort();
    values
}

fn task(title: &str) -> CreateTaskBody {
    CreateTaskBody { title: title.into(), ..Default::default() }
}

fn items(titles: &[&str]) -> Option<Vec<String>> {
    Some(titles.iter().map(|title| (*title).to_owned()).collect())
}

fn board_query() -> ListTasksQuery {
    ListTasksQuery { include: Some(TaskInclude::Children), ..Default::default() }
}

fn with_children(list: TaskList) -> Vec<TaskWithChildren> {
    match list {
        TaskList::WithChildren(tasks) => tasks,
        TaskList::Tasks(tasks) => panic!("expected tasks with children, got {tasks:?}"),
    }
}

#[tokio::test]
async fn creates_tasks_with_defaults_and_stamps_completedat_when_created_as_done() {
    let (_ctx, service) = setup().await;
    let open = service.create(task("Open")).await.unwrap();
    let done = service.create(CreateTaskBody { status: Some(TaskStatus::Done), ..task("Done") }).await.unwrap();

    assert_match(&to_json(&open), &json!({ "status": "inbox", "priority": "none", "tags": [], "completedAt": null }));
    assert!(done.task.completed_at.is_some());
}

#[tokio::test]
async fn orders_open_tasks_by_priority_and_due_date_done_tasks_last() {
    let (_ctx, service) = setup().await;
    service
        .create(CreateTaskBody { status: Some(TaskStatus::Done), priority: Some(TaskPriority::High), ..task("done") })
        .await
        .unwrap();
    service.create(CreateTaskBody { priority: Some(TaskPriority::Low), ..task("low") }).await.unwrap();
    service.create(CreateTaskBody { priority: Some(TaskPriority::High), ..task("high, no due") }).await.unwrap();
    service
        .create(CreateTaskBody {
            priority: Some(TaskPriority::High),
            due_at: Some(Some(local_day(2026, 1, 1))),
            ..task("high, due")
        })
        .await
        .unwrap();

    assert_eq!(titles(&list(&service, ListTasksQuery::default()).await), ["high, due", "high, no due", "low", "done"]);
}

#[tokio::test]
async fn filters_by_status_tag_parent_and_search() {
    let (_ctx, service) = setup().await;
    let parent = service.create(task("Parent")).await.unwrap();
    service
        .create(CreateTaskBody { tags: items(&["errands"]), status: Some(TaskStatus::Today), ..task("Buy milk") })
        .await
        .unwrap();
    service
        .create(CreateTaskBody { parent_task_id: Some(Some(parent.task.id.clone())), ..task("Milk the cow") })
        .await
        .unwrap();
    service
        .create(CreateTaskBody { description: Some(Some("about 100% of the plan".into())), ..task("Call mom") })
        .await
        .unwrap();

    let q = ListTasksQuery::default;
    assert_eq!(titles(&list(&service, ListTasksQuery { status: Some(TaskStatus::Today), ..q() }).await), ["Buy milk"]);
    assert_eq!(titles(&list(&service, ListTasksQuery { tag: Some("errands".into()), ..q() }).await), ["Buy milk"]);
    assert_eq!(
        titles(&list(&service, ListTasksQuery { parent_task_id: Some(parent.task.id.clone()), ..q() }).await),
        ["Milk the cow"]
    );
    // A checklist item's match surfaces its parent, never the item itself.
    assert_eq!(
        sorted(titles(&list(&service, ListTasksQuery { search: Some("MILK".into()), ..q() }).await)),
        ["Buy milk", "Parent"]
    );
    // LIKE wildcards in the search term are matched literally.
    assert_eq!(titles(&list(&service, ListTasksQuery { search: Some("100%".into()), ..q() }).await), ["Call mom"]);
    assert_eq!(list(&service, ListTasksQuery { search: Some("%".into()), ..q() }).await.len(), 1);
    assert_eq!(list(&service, ListTasksQuery { limit: 1, ..q() }).await.len(), 1);
}

#[tokio::test]
async fn never_lists_checklist_items_as_top_level_tasks() {
    let (_ctx, service) = setup().await;
    let parent = service
        .create(CreateTaskBody { status: Some(TaskStatus::Today), items: items(&["Eggs"]), ..task("Groceries") })
        .await
        .unwrap();
    service
        .update(&parent.children[0].id, UpdateTaskBody { status: Some(TaskStatus::Done), ..Default::default() })
        .await
        .unwrap();

    assert_eq!(titles(&list(&service, ListTasksQuery::default()).await), ["Groceries"]);
    assert!(
        titles(&list(&service, ListTasksQuery { status: Some(TaskStatus::Done), ..Default::default() }).await)
            .is_empty()
    );
}

#[tokio::test]
async fn creates_checklist_items_with_the_task_and_returns_them_with_include_children() {
    let (_ctx, service) = setup().await;
    let created =
        service.create(CreateTaskBody { items: items(&["Passport", "Tickets"]), ..task("Trip") }).await.unwrap();
    let id = created.task.id.clone();
    let children: Vec<(String, Option<String>, i64)> =
        created.children.iter().map(|item| (item.title.clone(), item.parent_task_id.clone(), item.order)).collect();
    assert_eq!(children, [("Passport".to_owned(), Some(id.clone()), 0), ("Tickets".to_owned(), Some(id.clone()), 1)]);

    let extra = service
        .create(CreateTaskBody {
            parent_task_id: Some(Some(id.clone())),
            priority: Some(TaskPriority::High),
            ..task("Charger")
        })
        .await
        .unwrap();
    assert_eq!(extra.task.order, 2);
    // Checklist items keep their written order whatever their priority.
    assert_eq!(
        titles(&list(&service, ListTasksQuery { parent_task_id: Some(id.clone()), ..Default::default() }).await),
        ["Passport", "Tickets", "Charger"]
    );
    service.remove(&created.children[0].id).await.unwrap();

    let board = with_children(list(&service, board_query()).await);
    assert_eq!(board[0].task.id, id);
    assert_eq!(board[0].children.iter().map(|item| item.title.as_str()).collect::<Vec<_>>(), ["Tickets", "Charger"]);
    assert!(list(&service, ListTasksQuery { search: Some("nothing".into()), ..board_query() }).await.is_empty());
}

#[tokio::test]
async fn puts_new_tasks_on_top_of_the_board_and_saves_reorders() {
    let (_ctx, service) = setup().await;
    let first = service.create(task("First")).await.unwrap();
    let second = service.create(task("Second")).await.unwrap();
    let board = || async {
        with_children(list(&service, board_query()).await)
            .into_iter()
            .map(|item| (item.task.title, item.task.pinned))
            .collect::<Vec<_>>()
    };

    assert_eq!(board().await, [("Second".to_owned(), false), ("First".to_owned(), false)]);

    service
        .reorder(ReorderTasksBody(vec![
            TaskOrder { id: first.task.id.clone(), order: 0, pinned: true },
            TaskOrder { id: second.task.id.clone(), order: 1, pinned: false },
        ]))
        .await
        .unwrap();
    assert_eq!(board().await, [("First".to_owned(), true), ("Second".to_owned(), false)]);
    assert_eq!(titles(&list(&service, ListTasksQuery { pinned: Some(true), ..Default::default() }).await), ["First"]);
    assert_eq!(titles(&list(&service, ListTasksQuery { pinned: Some(false), ..Default::default() }).await), ["Second"]);
}

#[tokio::test]
async fn rejects_reorders_with_unknown_duplicate_or_checklist_ids() {
    let (_ctx, service) = setup().await;
    let created = service.create(CreateTaskBody { items: items(&["Item"]), ..task("Task") }).await.unwrap();
    let order = |id: &str, order| TaskOrder { id: id.into(), order, pinned: false };
    let invalid = [
        vec![order("missing", 0)],
        vec![order(&created.task.id, 0), order(&created.task.id, 1)],
        vec![order(&created.children[0].id, 0)],
    ];
    for items in invalid {
        assert_error(service.reorder(ReorderTasksBody(items)).await, 400, "invalid_order");
    }
}

#[tokio::test]
async fn filters_by_color_and_hides_archived_tasks_unless_asked_for() {
    let (_ctx, service) = setup().await;
    let red = service
        .create(CreateTaskBody { color: Some(Some(TaskColor::Red)), pinned: Some(true), ..task("Red") })
        .await
        .unwrap();
    service.create(task("Plain")).await.unwrap();

    assert_eq!(
        titles(&list(&service, ListTasksQuery { color: Some(TaskColor::Red), ..Default::default() }).await),
        ["Red"]
    );

    service
        .update(&red.task.id, UpdateTaskBody { archived_at: Some(Some(now())), ..Default::default() })
        .await
        .unwrap();
    assert_eq!(titles(&list(&service, ListTasksQuery::default()).await), ["Plain"]);
    assert_eq!(titles(&list(&service, ListTasksQuery { archived: Some(true), ..Default::default() }).await), ["Red"]);

    service
        .update(&red.task.id, UpdateTaskBody { archived_at: Some(None), color: Some(None), ..Default::default() })
        .await
        .unwrap();
    assert_eq!(
        sorted(titles(&list(&service, ListTasksQuery { archived: Some(false), ..Default::default() }).await)),
        ["Plain", "Red"]
    );
}

#[tokio::test]
async fn sets_completedat_when_moving_into_done_and_clears_it_when_leaving() {
    let (_ctx, service) = setup().await;
    let created = service.create(task("Task")).await.unwrap();
    let id = created.task.id;

    let done =
        service.update(&id, UpdateTaskBody { status: Some(TaskStatus::Done), ..Default::default() }).await.unwrap();
    assert!(done.completed_at.is_some());

    let custom = local_day(2026, 6, 1);
    let stamped = service
        .update(
            &id,
            UpdateTaskBody { status: Some(TaskStatus::Done), completed_at: Some(Some(custom)), ..Default::default() },
        )
        .await
        .unwrap();
    assert_eq!(stamped.completed_at, Some(custom));

    let reopened =
        service.update(&id, UpdateTaskBody { status: Some(TaskStatus::Today), ..Default::default() }).await.unwrap();
    assert_eq!(reopened.completed_at, None);
    let renamed =
        service.update(&id, UpdateTaskBody { title: Some("Renamed".into()), ..Default::default() }).await.unwrap();
    assert_eq!(renamed.title, "Renamed");
}

#[tokio::test]
async fn filters_by_focus_day_and_keeps_the_day_when_the_task_is_completed() {
    let (_ctx, service) = setup().await;
    let day = || Some(Some("2026-10-19".to_owned()));
    let focus = service
        .create(CreateTaskBody { status: Some(TaskStatus::Today), focus_day: day(), ..task("Write report") })
        .await
        .unwrap();
    service.create(CreateTaskBody { focus_day: Some(Some("2026-10-18".into())), ..task("Yesterday") }).await.unwrap();
    service.create(task("Plain")).await.unwrap();
    let on_day = || ListTasksQuery { focus_day: Some("2026-10-19".into()), ..Default::default() };

    assert_eq!(titles(&list(&service, on_day()).await), ["Write report"]);

    let done = service
        .update(&focus.task.id, UpdateTaskBody { status: Some(TaskStatus::Done), ..Default::default() })
        .await
        .unwrap();
    assert_eq!(done.focus_day.as_deref(), Some("2026-10-19"));
    assert!(done.completed_at.is_some());
    let statuses: Vec<TaskStatus> = list(&service, on_day()).await.tasks().iter().map(|task| task.status).collect();
    assert_eq!(statuses, [TaskStatus::Done]);

    let cleared =
        service.update(&focus.task.id, UpdateTaskBody { focus_day: Some(None), ..Default::default() }).await.unwrap();
    assert_eq!(cleared.focus_day, None);
    assert!(list(&service, on_day()).await.is_empty());
}

#[tokio::test]
async fn refuses_a_fourth_focus_task_for_the_same_day() {
    let (_ctx, service) = setup().await;
    let day = "2026-10-19";
    let on = |focus: &str| Some(Some(focus.to_owned()));
    let picked = [
        service.create(CreateTaskBody { focus_day: on(day), ..task("One") }).await.unwrap(),
        service.create(CreateTaskBody { focus_day: on(day), ..task("Two") }).await.unwrap(),
    ];
    let third = service.create(task("Three")).await.unwrap();
    service
        .update(
            &third.task.id,
            UpdateTaskBody { focus_day: on(day), status: Some(TaskStatus::Done), ..Default::default() },
        )
        .await
        .unwrap();
    let fourth = service.create(task("Four")).await.unwrap();

    assert_error(
        service.update(&fourth.task.id, UpdateTaskBody { focus_day: on(day), ..Default::default() }).await,
        400,
        "focus_limit",
    );
    assert_error(service.create(CreateTaskBody { focus_day: on(day), ..task("Five") }).await, 400, "focus_limit");
    // Re-saving a task already in the day's focus doesn't count it twice.
    let resaved = service
        .update(
            &picked[0].task.id,
            UpdateTaskBody { focus_day: on(day), title: Some("One!".into()), ..Default::default() },
        )
        .await
        .unwrap();
    assert_eq!(resaved.title, "One!");
    // Other days have their own slots.
    let other_day = service
        .update(&fourth.task.id, UpdateTaskBody { focus_day: on("2026-10-20"), ..Default::default() })
        .await
        .unwrap();
    assert_eq!(other_day.focus_day.as_deref(), Some("2026-10-20"));

    // Archived and deleted focus tasks free their slot.
    service
        .update(&picked[0].task.id, UpdateTaskBody { archived_at: Some(Some(now())), ..Default::default() })
        .await
        .unwrap();
    service.remove(&picked[1].task.id).await.unwrap();
    service.update(&fourth.task.id, UpdateTaskBody { focus_day: on(day), ..Default::default() }).await.unwrap();
    let five = service.create(CreateTaskBody { focus_day: on(day), ..task("Five") }).await.unwrap();
    assert_eq!(five.task.focus_day.as_deref(), Some(day));
    assert_eq!(list(&service, ListTasksQuery { focus_day: Some(day.into()), ..Default::default() }).await.len(), 3);
}

#[tokio::test]
async fn soft_deletes_and_then_treats_the_task_as_missing() {
    let (_ctx, service) = setup().await;
    let created = service.create(task("Task")).await.unwrap();
    let id = created.task.id;
    assert_eq!(service.get(&id).await.unwrap().id, id);

    service.remove(&id).await.unwrap();

    assert!(list(&service, ListTasksQuery::default()).await.is_empty());
    assert_not_found(service.get(&id).await);
    assert_not_found(service.update(&id, UpdateTaskBody { title: Some("x".into()), ..Default::default() }).await);
    assert_not_found(service.remove(&id).await);
}

#[tokio::test]
async fn restores_a_deleted_task_with_the_checklist_items_deleted_alongside_it() {
    let (ctx, service) = setup().await;
    let created =
        service.create(CreateTaskBody { items: items(&["Passport", "Tickets"]), ..task("Trip") }).await.unwrap();
    let id = created.task.id.clone();
    // Deleted on its own a while before the task.
    let (item_id, deleted_at) = (created.children[0].id.clone(), to_millis(local_day(2026, 1, 1)));
    ctx.db
        .call(move |conn| {
            conn.execute("UPDATE tasks SET deleted_at = ?1 WHERE id = ?2", rusqlite::params![deleted_at, item_id])
        })
        .await
        .unwrap();
    service.remove(&id).await.unwrap();
    let checklist = || ListTasksQuery { parent_task_id: Some(id.clone()), ..Default::default() };
    assert!(list(&service, checklist()).await.is_empty());

    assert_match(&to_json(&service.restore(&id).await.unwrap()), &json!({ "id": id, "deletedAt": null }));
    // The item deleted on its own earlier stays deleted.
    assert_eq!(titles(&list(&service, checklist()).await), ["Tickets"]);
    assert_not_found(service.restore(&id).await);
    assert_not_found(service.restore("missing").await);
}

use life_board_api::db::Db;
use life_board_api::db::columns::Timestamp;
use life_board_api::db::schema::goals::{
    Goal, GoalDomain, GoalProgressMode, GoalProgressSnapshot, GoalStatus, NewGoal, NewGoalProgressSnapshot,
    insert_goals, insert_snapshots,
};
use life_board_api::db::schema::habits::{NewHabit, NewHabitLog, insert_habits, insert_logs};
use life_board_api::db::schema::tasks::{self, NewTask, TaskStatus};
use life_board_api::dto::goals::{
    CreateGoalBody, CreateMilestoneBody, GoalProgressQuery, UpdateGoalBody, UpdateMilestoneBody,
};
use life_board_api::services::date::{add_days, to_day_key};
use life_board_api::services::goals::{
    GoalBreakdown, GoalRisk, GoalsService, HabitRow, LogRow, ProgressHistory, ProgressPart, ProgressPoint, RiskInfo,
    auto_progress, goal_risk, habits_part,
};
use serde_json::json;

use crate::common::{TestDb, assert_match, assert_not_found, local, local_day, now, test_db, to_json};

async fn setup() -> (TestDb, GoalsService) {
    let ctx = test_db().await;
    let service = GoalsService::new(ctx.db.clone());
    (ctx, service)
}

/// `goal(extra)`: a goal from Oct 1 to Oct 31 2026, created Sep 1.
fn goal_with(extra: impl FnOnce(&mut Goal)) -> Goal {
    let mut goal = Goal {
        id: "g1".into(),
        title: "Goal".into(),
        why: None,
        domain: GoalDomain::Personal,
        status: GoalStatus::Active,
        start_at: Some(local_day(2026, 10, 1)),
        target_at: Some(local_day(2026, 10, 31)),
        completed_at: None,
        color: "#a855f7".into(),
        progress: 0,
        progress_mode: GoalProgressMode::Auto,
        linked_task_ids: Vec::new(),
        linked_thought_ids: Vec::new(),
        linked_habit_ids: Vec::new(),
        created_at: local_day(2026, 9, 1),
        updated_at: local_day(2026, 9, 1),
        deleted_at: None,
    };
    extra(&mut goal);
    goal
}

fn goal() -> Goal {
    goal_with(|_| {})
}

fn part(done: i64, total: i64) -> Option<ProgressPart> {
    Some(ProgressPart { done, total })
}

fn breakdown(
    milestones: Option<ProgressPart>,
    tasks: Option<ProgressPart>,
    habits: Option<ProgressPart>,
) -> GoalBreakdown {
    GoalBreakdown { milestones, tasks, habits }
}

fn habit_row(id: &str, target: i64, created_at: Timestamp) -> HabitRow {
    HabitRow { id: id.into(), target, created_at }
}

fn log_row(habit_id: &str, day: &str, count: i64, target: Option<i64>) -> LogRow {
    LogRow { habit_id: habit_id.into(), day: day.into(), count, target }
}

fn titled(title: &str) -> CreateGoalBody {
    CreateGoalBody { title: title.into(), ..Default::default() }
}

fn milestone(title: &str) -> CreateMilestoneBody {
    CreateMilestoneBody { title: title.into(), due_at: None }
}

async fn add_task(db: &Db, id: &str, status: TaskStatus) {
    tasks::insert(db, vec![NewTask { id: id.into(), title: id.into(), status: Some(status), ..Default::default() }])
        .await
        .unwrap();
}

async fn add_habit(db: &Db, id: &str, target: i64, created_at: Timestamp) {
    insert_habits(
        db,
        vec![NewHabit { id: id.into(), name: id.into(), target, created_at: Some(created_at), ..Default::default() }],
    )
    .await
    .unwrap();
}

async fn log_habit(db: &Db, habit_id: &str, day: &str, count: i64, target: Option<i64>) {
    let row = NewHabitLog {
        id: format!("{habit_id}-{day}"),
        habit_id: habit_id.into(),
        day: day.into(),
        count: Some(count),
        target,
        ..Default::default()
    };
    insert_logs(db, vec![row]).await.unwrap();
}

async fn snapshots_of(db: &Db, goal_id: &str) -> Vec<GoalProgressSnapshot> {
    let goal_id = goal_id.to_owned();
    db.call(move |conn| {
        let mut statement = conn.prepare("SELECT * FROM goal_progress_snapshots WHERE goal_id = ?1")?;
        statement.query_map([goal_id], GoalProgressSnapshot::from_row)?.collect()
    })
    .await
    .unwrap()
}

#[test]
fn averages_the_parts_the_goal_has() {
    assert_eq!(auto_progress(&breakdown(part(1, 4), None, None)), 25);
    assert_eq!(auto_progress(&breakdown(part(1, 2), part(1, 1), None)), 75);
    assert_eq!(auto_progress(&breakdown(None, None, part(0, 0))), 0);
}

#[test]
fn sits_at_0_without_parts() {
    assert_eq!(auto_progress(&breakdown(None, None, None)), 0);
}

#[test]
fn counts_met_days_since_the_goal_s_start_with_today_only_once_it_s_met() {
    let today = local(2026, 10, 10, 15, 0);
    let water = habit_row("water", 2, local_day(2026, 9, 1));
    let logs = vec![
        log_row("water", "2026-09-30", 5, Some(2)),
        log_row("water", "2026-10-01", 2, Some(2)),
        log_row("water", "2026-10-02", 1, Some(2)),
        log_row("water", "2026-10-03", 1, Some(1)),
        log_row("water", "2026-10-10", 1, None),
    ];
    assert_eq!(habits_part(&goal(), std::slice::from_ref(&water), &logs, today), ProgressPart { done: 2, total: 9 });
    let mut met_today = logs[..4].to_vec();
    met_today.push(log_row("water", "2026-10-10", 2, None));
    assert_eq!(habits_part(&goal(), &[water], &met_today, today), ProgressPart { done: 3, total: 10 });
}

#[test]
fn uses_the_creation_date_without_a_start_date_and_skips_days_before_the_habit_existed() {
    let today = local(2026, 10, 10, 15, 0);
    let unstarted = || goal_with(|g| (g.start_at, g.created_at) = (None, local_day(2026, 10, 5)));
    let late = habit_row("late", 1, local_day(2026, 10, 8));
    assert_eq!(habits_part(&unstarted(), &[late], &[], today), ProgressPart { done: 0, total: 2 });
    let early = habit_row("early", 1, local_day(2026, 1, 1));
    assert_eq!(habits_part(&unstarted(), &[early], &[], today), ProgressPart { done: 0, total: 5 });
}

#[test]
fn is_empty_for_a_goal_that_hasn_t_started() {
    let today = local(2026, 10, 10, 15, 0);
    let habit = habit_row("h", 1, local_day(2026, 1, 1));
    let future = goal_with(|g| g.start_at = Some(local_day(2026, 10, 20)));
    assert_eq!(habits_part(&future, &[habit], &[], today), ProgressPart { done: 0, total: 0 });
}

fn risk(expected_progress: Option<i64>, risk: Option<GoalRisk>) -> RiskInfo {
    RiskInfo { expected_progress, risk }
}

#[test]
fn compares_progress_with_the_elapsed_share_of_the_timeline() {
    let at = local_day(2026, 10, 16);
    assert_eq!(goal_risk(&goal(), 50, at), risk(Some(50), None));
    assert_eq!(goal_risk(&goal(), 40, at), risk(Some(50), None));
    assert_eq!(goal_risk(&goal(), 39, at), risk(Some(50), Some(GoalRisk::AtRisk)));
}

#[test]
fn flags_active_goals_past_their_target_below_100() {
    let late = local_day(2026, 11, 2);
    assert_eq!(goal_risk(&goal(), 90, late), risk(Some(100), Some(GoalRisk::Overdue)));
    assert_eq!(goal_risk(&goal(), 100, late).risk, None);
    assert_eq!(goal_risk(&goal_with(|g| g.status = GoalStatus::Paused), 10, late).risk, None);
}

#[test]
fn starts_from_the_creation_date_and_handles_missing_or_inverted_dates() {
    let at = local_day(2026, 10, 16);
    assert_eq!(goal_risk(&goal_with(|g| g.target_at = None), 0, at), risk(None, None));
    let created = goal_with(|g| (g.start_at, g.created_at) = (None, local_day(2026, 10, 11)));
    assert_eq!(goal_risk(&created, 0, at).expected_progress, Some(25));
    assert_eq!(
        goal_risk(&goal_with(|g| g.start_at = Some(local_day(2026, 11, 1))), 0, at).expected_progress,
        Some(100)
    );
    assert_eq!(goal_risk(&goal_with(|g| g.start_at = Some(local_day(2026, 10, 20))), 0, at), risk(Some(0), None));
}

#[tokio::test]
async fn creates_a_goal_with_ordered_milestones() {
    let (_ctx, service) = setup().await;
    let created = service
        .create(CreateGoalBody {
            milestones: Some(vec![
                milestone("5k"),
                CreateMilestoneBody { due_at: Some(Some(local_day(2026, 12, 1))), ..milestone("10k") },
            ]),
            ..titled("Run a marathon")
        })
        .await
        .unwrap();

    assert_eq!(created.milestones_created, 2);
    assert_eq!(created.goal.goal.progress_mode, GoalProgressMode::Auto);
    let markers = &created.goal.milestone_markers;
    assert_eq!(markers.len(), 1);
    assert_eq!(
        (markers[0].title.as_str(), markers[0].due_at, markers[0].completed_at),
        ("10k", local_day(2026, 12, 1), None)
    );
    let detail = service.get(&created.goal.goal.id, now()).await.unwrap();
    let milestones: Vec<(&str, i64)> = detail.milestones.iter().map(|m| (m.title.as_str(), m.order)).collect();
    assert_eq!(milestones, [("5k", 0), ("10k", 1)]);
    assert_eq!(service.list(now()).await.unwrap().len(), 1);
    assert_eq!(service.create(titled("No milestones")).await.unwrap().milestones_created, 0);
}

#[tokio::test]
async fn stamps_completedat_only_while_completed() {
    let (_ctx, service) = setup().await;
    let created = service
        .create(CreateGoalBody { progress_mode: Some(GoalProgressMode::Manual), ..titled("Goal") })
        .await
        .unwrap();
    let id = created.goal.goal.id;
    let update = |input: UpdateGoalBody| service.update(&id, input);

    assert!(
        update(UpdateGoalBody { status: Some(GoalStatus::Completed), ..Default::default() })
            .await
            .unwrap()
            .goal
            .completed_at
            .is_some()
    );
    let custom = local_day(2026, 1, 2);
    let stamped = update(UpdateGoalBody {
        status: Some(GoalStatus::Completed),
        completed_at: Some(Some(custom)),
        ..Default::default()
    })
    .await
    .unwrap();
    assert_eq!(stamped.goal.completed_at, Some(custom));
    assert_eq!(
        update(UpdateGoalBody { status: Some(GoalStatus::Paused), ..Default::default() })
            .await
            .unwrap()
            .goal
            .completed_at,
        None
    );
    assert_eq!(update(UpdateGoalBody { progress: Some(40), ..Default::default() }).await.unwrap().goal.progress, 40);
}

#[tokio::test]
async fn derives_auto_progress_from_milestones_alone() {
    let (_ctx, service) = setup().await;
    let created = service
        .create(CreateGoalBody { milestones: Some(vec![milestone("A"), milestone("B")]), ..titled("Goal") })
        .await
        .unwrap();
    assert_match(
        &to_json(&created.goal),
        &json!({ "progress": 0, "breakdown": { "milestones": { "done": 0, "total": 2 }, "tasks": null, "habits": null } }),
    );

    let id = created.goal.goal.id;
    let detail = service.get(&id, now()).await.unwrap();
    service
        .update_milestone(
            &id,
            &detail.milestones[0].id,
            UpdateMilestoneBody { completed_at: Some(Some(now())), ..Default::default() },
        )
        .await
        .unwrap();
    assert_eq!(service.get(&id, now()).await.unwrap().goal.goal.progress, 50);
}

#[tokio::test]
async fn derives_auto_progress_from_linked_tasks_alone_ignoring_deleted_ones() {
    let (ctx, service) = setup().await;
    add_task(&ctx.db, "t1", TaskStatus::Done).await;
    add_task(&ctx.db, "t2", TaskStatus::Today).await;
    add_task(&ctx.db, "t3", TaskStatus::Done).await;
    let deleted_at = life_board_api::db::columns::to_millis(now());
    ctx.db
        .call(move |conn| conn.execute("UPDATE tasks SET deleted_at = ?1 WHERE id = 't3'", [deleted_at]))
        .await
        .unwrap();
    let linked = ["t1", "t2", "t3", "missing"].map(String::from).to_vec();
    let created = service.create(CreateGoalBody { linked_task_ids: Some(linked), ..titled("Goal") }).await.unwrap();

    assert_match(
        &to_json(&created.goal),
        &json!({ "progress": 50, "breakdown": { "milestones": null, "tasks": { "done": 1, "total": 2 }, "habits": null } }),
    );
}

#[tokio::test]
async fn derives_auto_progress_from_habits_since_the_start_date() {
    let (ctx, service) = setup().await;
    let at = local(2026, 10, 5, 12, 0);
    add_habit(&ctx.db, "water", 2, local_day(2026, 9, 1)).await;
    log_habit(&ctx.db, "water", "2026-09-30", 2, Some(2)).await;
    log_habit(&ctx.db, "water", "2026-10-01", 2, Some(2)).await;
    log_habit(&ctx.db, "water", "2026-10-02", 3, Some(2)).await;
    log_habit(&ctx.db, "water", "2026-10-03", 1, Some(2)).await;
    let created = service
        .create(CreateGoalBody {
            start_at: Some(Some(local_day(2026, 10, 1))),
            linked_habit_ids: Some(vec!["water".into()]),
            ..titled("Hydrate")
        })
        .await
        .unwrap();

    let summary = service.get(&created.goal.goal.id, at).await.unwrap().goal;
    assert_eq!(summary.breakdown.habits, part(2, 4));
    assert_eq!(summary.goal.progress, 50);
}

#[tokio::test]
async fn combines_milestones_tasks_and_habits_and_shows_0_without_parts() {
    let (ctx, service) = setup().await;
    let at = local(2026, 10, 3, 12, 0);
    add_task(&ctx.db, "t1", TaskStatus::Done).await;
    add_habit(&ctx.db, "read", 1, local_day(2026, 9, 1)).await;
    log_habit(&ctx.db, "read", "2026-10-01", 1, None).await;
    let everything = service
        .create(CreateGoalBody {
            start_at: Some(Some(local_day(2026, 10, 1))),
            linked_task_ids: Some(vec!["t1".into()]),
            linked_habit_ids: Some(vec!["read".into()]),
            milestones: Some(vec![milestone("A"), milestone("B")]),
            ..titled("Everything")
        })
        .await
        .unwrap();
    let empty = service.create(titled("Empty")).await.unwrap();

    let items = service.list(at).await.unwrap();
    // (0/2 + 1/1 + 1/2) / 3
    let find = |id: &str| items.iter().find(|item| item.goal.id == id).unwrap();
    assert_eq!(find(&everything.goal.goal.id).goal.progress, 50);
    assert_match(
        &to_json(find(&empty.goal.goal.id)),
        &json!({ "progress": 0, "breakdown": { "milestones": null, "tasks": null, "habits": null } }),
    );
}

#[tokio::test]
async fn keeps_manual_progress_and_switches_between_modes_both_ways() {
    let (_ctx, service) = setup().await;
    let created =
        service.create(CreateGoalBody { milestones: Some(vec![milestone("A")]), ..titled("Goal") }).await.unwrap();
    let id = created.goal.goal.id;
    let mode =
        |progress_mode, progress| UpdateGoalBody { progress_mode: Some(progress_mode), progress, ..Default::default() };
    assert_eq!(service.update(&id, mode(GoalProgressMode::Manual, Some(70))).await.unwrap().goal.progress, 70);
    assert_eq!(service.update(&id, mode(GoalProgressMode::Auto, None)).await.unwrap().goal.progress, 0);
    assert_eq!(service.update(&id, mode(GoalProgressMode::Manual, None)).await.unwrap().goal.progress, 70);
}

#[tokio::test]
async fn records_today_s_snapshot_only_when_progress_changes() {
    let (ctx, service) = setup().await;
    let created = service
        .create(CreateGoalBody { progress_mode: Some(GoalProgressMode::Manual), ..titled("Goal") })
        .await
        .unwrap();
    let id = created.goal.goal.id;
    let progress = |progress| UpdateGoalBody { progress: Some(progress), ..Default::default() };
    service.list(now()).await.unwrap();
    assert_eq!(snapshots_of(&ctx.db, &id).await.iter().map(|row| row.progress).collect::<Vec<_>>(), [0]);

    service.update(&id, progress(30)).await.unwrap();
    service.update(&id, progress(60)).await.unwrap();
    service.get(&id, now()).await.unwrap();
    let rows: Vec<(String, i64)> =
        snapshots_of(&ctx.db, &id).await.into_iter().map(|row| (row.day, row.progress)).collect();
    assert_eq!(rows, [(to_day_key(now()), 60)]);

    let goal_id = id.clone();
    ctx.db
        .call(move |conn| {
            conn.execute("UPDATE goal_progress_snapshots SET day = '2026-01-01' WHERE goal_id = ?1", [goal_id])
        })
        .await
        .unwrap();
    service.get(&id, now()).await.unwrap();
    assert_eq!(snapshots_of(&ctx.db, &id).await.len(), 1);
    service.update(&id, progress(80)).await.unwrap();
    let mut values: Vec<i64> = snapshots_of(&ctx.db, &id).await.iter().map(|row| row.progress).collect();
    values.sort_unstable();
    assert_eq!(values, [60, 80]);
}

#[tokio::test]
async fn updates_snapshots_on_milestone_writes() {
    let (ctx, service) = setup().await;
    let created =
        service.create(CreateGoalBody { milestones: Some(vec![milestone("A")]), ..titled("Goal") }).await.unwrap();
    let id = created.goal.goal.id;
    let second = service.add_milestone(&id, milestone("B")).await.unwrap();
    service
        .update_milestone(
            &id,
            &second.id,
            UpdateMilestoneBody { completed_at: Some(Some(now())), ..Default::default() },
        )
        .await
        .unwrap();
    assert_eq!(snapshots_of(&ctx.db, &id).await[0].progress, 50);
    service.remove_milestone(&id, &second.id).await.unwrap();
    assert_eq!(snapshots_of(&ctx.db, &id).await[0].progress, 0);
}

#[tokio::test]
async fn returns_the_progress_history_within_a_range_with_the_value_carried_into_it() {
    let (ctx, service) = setup().await;
    let created = service.create(titled("Goal")).await.unwrap();
    let id = created.goal.goal.id;
    ctx.db.call(|conn| conn.execute("DELETE FROM goal_progress_snapshots", [])).await.unwrap();
    let snapshot = |row: &str, day: &str, progress| NewGoalProgressSnapshot {
        id: row.into(),
        goal_id: id.clone(),
        day: day.into(),
        progress,
        ..Default::default()
    };
    insert_snapshots(
        &ctx.db,
        vec![snapshot("s1", "2026-09-20", 10), snapshot("s2", "2026-10-02", 20), snapshot("s3", "2026-10-09", 35)],
    )
    .await
    .unwrap();
    let point = |day: &str, progress| ProgressPoint { day: day.into(), progress };
    let range = |from: Option<&str>, to: Option<&str>| GoalProgressQuery {
        from: from.map(String::from),
        to: to.map(String::from),
    };

    assert_eq!(
        service.progress_history(&id, range(Some("2026-10-01"), Some("2026-10-05"))).await.unwrap(),
        ProgressHistory { items: vec![point("2026-10-02", 20)], starting_progress: Some(10) }
    );
    assert_eq!(
        service.progress_history(&id, range(None, None)).await.unwrap(),
        ProgressHistory {
            items: vec![point("2026-09-20", 10), point("2026-10-02", 20), point("2026-10-09", 35)],
            starting_progress: None,
        }
    );
    assert_eq!(service.progress_history(&id, range(Some("2026-01-01"), None)).await.unwrap().starting_progress, None);
}

#[tokio::test]
async fn removes_snapshots_with_the_goal() {
    let (ctx, service) = setup().await;
    let created = service.create(titled("Goal")).await.unwrap();
    let id = created.goal.goal.id;
    assert_eq!(snapshots_of(&ctx.db, &id).await.len(), 1);
    service.remove(&id).await.unwrap();
    assert_eq!(snapshots_of(&ctx.db, &id).await, []);

    insert_goals(&ctx.db, vec![NewGoal { id: "hard".into(), title: "Hard".into(), ..Default::default() }])
        .await
        .unwrap();
    let yesterday = to_day_key(add_days(now(), -1));
    insert_snapshots(
        &ctx.db,
        vec![NewGoalProgressSnapshot {
            id: "s".into(),
            goal_id: "hard".into(),
            day: yesterday,
            progress: 5,
            ..Default::default()
        }],
    )
    .await
    .unwrap();
    ctx.db.call(|conn| conn.execute("DELETE FROM goals WHERE id = 'hard'", [])).await.unwrap();
    assert_eq!(snapshots_of(&ctx.db, "hard").await, []);
}

#[tokio::test]
async fn appends_updates_and_removes_milestones_within_their_goal_only() {
    let (_ctx, service) = setup().await;
    let created =
        service.create(CreateGoalBody { milestones: Some(vec![milestone("First")]), ..titled("Goal") }).await.unwrap();
    let other = service.create(titled("Other")).await.unwrap();
    let (id, other_id) = (created.goal.goal.id, other.goal.goal.id);

    let second = service.add_milestone(&id, milestone("Second")).await.unwrap();
    assert_eq!(second.order, 1);

    let done = service
        .update_milestone(
            &id,
            &second.id,
            UpdateMilestoneBody { completed_at: Some(Some(now())), ..Default::default() },
        )
        .await
        .unwrap();
    assert!(done.completed_at.is_some());

    assert_not_found(
        service
            .update_milestone(
                &other_id,
                &second.id,
                UpdateMilestoneBody { title: Some("x".into()), ..Default::default() },
            )
            .await,
    );
    assert_not_found(service.remove_milestone(&other_id, &second.id).await);

    service.remove_milestone(&id, &second.id).await.unwrap();
    let titles: Vec<String> = service.get(&id, now()).await.unwrap().milestones.into_iter().map(|m| m.title).collect();
    assert_eq!(titles, ["First"]);
}

#[tokio::test]
async fn throws_notfounderror_for_missing_or_deleted_goals() {
    let (_ctx, service) = setup().await;
    let created = service.create(titled("Goal")).await.unwrap();
    let id = created.goal.goal.id;
    service.remove(&id).await.unwrap();

    assert_not_found(service.get(&id, now()).await);
    assert_not_found(service.update(&id, UpdateGoalBody { title: Some("x".into()), ..Default::default() }).await);
    assert_not_found(service.remove(&id).await);
    assert_not_found(service.add_milestone(&id, milestone("x")).await);
    assert_not_found(service.progress_history(&id, GoalProgressQuery::default()).await);
    assert_eq!(service.list(now()).await.unwrap(), []);
}

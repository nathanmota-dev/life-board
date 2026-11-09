use life_board_api::db::columns::to_iso;
use life_board_api::db::schema::calendar::{self, NewCalendarEvent};
use life_board_api::db::schema::goals::{NewGoal, NewGoalMilestone, insert_goals, insert_milestones};
use life_board_api::db::schema::habits::{NewHabit, NewHabitLog, insert_habits, insert_logs};
use life_board_api::db::schema::tasks::{self, NewTask};
use life_board_api::db::schema::thoughts::{self, NewThought};
use life_board_api::services::stats::{StatsService, WeekStats};

use crate::common::{local, local_day, now, test_db};

#[tokio::test]
async fn counts_this_week_s_activity_from_sunday_to_saturday() {
    let ctx = test_db().await;
    // Saturday Oct 17 2026; the week starts on Sunday Oct 11.
    let at = local(2026, 10, 17, 12, 0);
    let in_week = local_day(2026, 10, 12);
    let last_week = local_day(2026, 10, 9);

    thoughts::insert(
        &ctx.db,
        vec![
            NewThought { id: "th1".into(), created_at: Some(in_week), ..Default::default() },
            NewThought { id: "th2".into(), created_at: Some(last_week), ..Default::default() },
            NewThought { id: "th3".into(), created_at: Some(in_week), deleted_at: Some(in_week), ..Default::default() },
        ],
    )
    .await
    .unwrap();
    tasks::insert(
        &ctx.db,
        vec![
            NewTask { id: "t1".into(), title: "a".into(), completed_at: Some(in_week), ..Default::default() },
            NewTask { id: "t2".into(), title: "b".into(), completed_at: Some(last_week), ..Default::default() },
            NewTask { id: "t3".into(), title: "c".into(), ..Default::default() },
            NewTask {
                id: "t4".into(),
                title: "checklist item".into(),
                parent_task_id: Some("t1".into()),
                completed_at: Some(in_week),
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
            title: "e".into(),
            start_at: in_week,
            end_at: in_week,
            ..Default::default()
        }],
    )
    .await
    .unwrap();
    insert_goals(&ctx.db, vec![NewGoal { id: "g1".into(), title: "g".into(), ..Default::default() }]).await.unwrap();
    insert_milestones(
        &ctx.db,
        vec![NewGoalMilestone {
            id: "m1".into(),
            goal_id: "g1".into(),
            title: "m".into(),
            completed_at: Some(in_week),
            ..Default::default()
        }],
    )
    .await
    .unwrap();
    insert_habits(
        &ctx.db,
        vec![
            NewHabit { id: "h1".into(), name: "Water".into(), target: 2, ..Default::default() },
            NewHabit {
                id: "h2".into(),
                name: "Gone".into(),
                target: 1,
                deleted_at: Some(in_week),
                ..Default::default()
            },
        ],
    )
    .await
    .unwrap();
    let log = |id: &str, habit_id: &str, day: &str, count| NewHabitLog {
        id: id.into(),
        habit_id: habit_id.into(),
        day: day.into(),
        count: Some(count),
        ..Default::default()
    };
    insert_logs(
        &ctx.db,
        vec![
            log("l1", "h1", "2026-10-12", 2),
            log("l2", "h1", "2026-10-13", 1),
            log("l3", "h1", "2026-10-09", 5),
            log("l4", "h2", "2026-10-12", 1),
        ],
    )
    .await
    .unwrap();

    assert_eq!(
        StatsService::new(ctx.db.clone()).this_week(at).await.unwrap(),
        WeekStats {
            week_start: to_iso(local_day(2026, 10, 11)),
            thoughts_created: 1,
            tasks_completed: 1,
            events_count: 1,
            milestones_hit: 1,
            habit_goals_met: 1,
        }
    );
}

#[tokio::test]
async fn defaults_to_the_current_week() {
    let ctx = test_db().await;
    assert_eq!(StatsService::new(ctx.db.clone()).this_week(now()).await.unwrap().thoughts_created, 0);
}

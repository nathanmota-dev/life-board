//! Rust-only: rows read back the way Drizzle maps them (`new Date(value)`,
//! `Number(value) === 1`, `JSON.parse`), and the insert helpers fill the
//! column defaults Drizzle would.

use life_board_api::db::columns::{to_iso, to_json_list};
use life_board_api::db::schema::habits::{NewHabit, NewHabitLog, insert_habits, insert_logs};
use life_board_api::db::schema::mood::{NewMoodEntry, insert};
use life_board_api::db::schema::tasks::Task;
use life_board_api::dto::habits::ListHabitLogsQuery;
use life_board_api::services::habits::{HabitLogEntry, HabitsService};
use life_board_api::services::mood::MoodService;
use life_board_api::services::tasks::TasksService;

use crate::common::{ms, test_db};

#[tokio::test]
async fn reads_values_other_writers_may_have_stored() {
    let ctx = test_db().await;
    ctx.db
        .call(|conn| {
            conn.execute_batch(
                "INSERT INTO tasks (id, title, tags, linked_thought_ids, pinned, created_at, updated_at, due_at) VALUES ('real', 'Real', '[\"a\"]', '[]', '1', 1000.9, 2000, NULL);
                 INSERT INTO tasks (id, title, tags, linked_thought_ids, pinned, created_at, updated_at) VALUES ('two', 'Two', '[]', '[]', 2, 1000, 2000);",
            )
        })
        .await
        .unwrap();
    let service = TasksService::new(ctx.db.clone());

    let real = service.get("real").await.unwrap();
    assert_eq!((real.created_at, real.pinned, real.tags), (ms(1000), true, vec!["a".to_owned()]));
    assert!(!service.get("two").await.unwrap().pinned);

    ctx.db.call(|conn| conn.execute("UPDATE tasks SET tags = 'not json' WHERE id = 'two'", [])).await.unwrap();
    assert_eq!(service.get("two").await.unwrap_err().code(), "internal_error");
    let broken = ctx.db.call(|conn| conn.query_row("SELECT * FROM tasks WHERE id = 'two'", [], Task::from_row)).await;
    assert!(broken.is_err());
}

#[test]
fn writes_json_and_dates_like_javascript() {
    assert_eq!(to_json_list(&[]), "[]");
    assert_eq!(to_json_list(&["ção \"x\"".to_owned()]), r#"["ção \"x\""]"#);
    assert_eq!(to_iso(ms(1_792_195_200_000)), "2026-10-17T00:00:00.000Z");
}

#[tokio::test]
async fn fills_the_column_defaults_of_seeded_rows() {
    let ctx = test_db().await;
    insert_habits(&ctx.db, vec![NewHabit { id: "h".into(), name: "Water".into(), target: 3, ..Default::default() }])
        .await
        .unwrap();
    insert_logs(
        &ctx.db,
        vec![NewHabitLog { id: "l".into(), habit_id: "h".into(), day: "2026-10-01".into(), ..Default::default() }],
    )
    .await
    .unwrap();
    insert(&ctx.db, vec![NewMoodEntry { id: "m".into(), day: "2026-10-01".into(), score: 4, ..Default::default() }])
        .await
        .unwrap();

    let habits = HabitsService::new(ctx.db.clone());
    let habit = &habits.list(ms(0)).await.unwrap()[0].habit;
    assert_eq!((habit.unit.as_str(), habit.step, habit.emoji.as_str()), ("times", 1, "🌱"));
    assert_eq!(
        habits.logs(ListHabitLogsQuery::default()).await.unwrap(),
        [HabitLogEntry { habit_id: "h".into(), day: "2026-10-01".into(), count: 0, target: None }]
    );
    let mood = MoodService::new(ctx.db.clone()).list(10).await.unwrap();
    assert_eq!((mood[0].score, mood[0].note.clone(), mood[0].linked_task_ids.len()), (4, None, 0));
}

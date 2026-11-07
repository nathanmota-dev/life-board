use life_board_api::db::columns::to_iso;
use life_board_api::dto::mood::UpsertMoodBody;
use life_board_api::services::date::to_day_key;
use life_board_api::services::mood::{MoodService, MoodToday};
use serde_json::json;

use crate::common::{TestDb, assert_match, assert_not_found, local, local_day, now, test_db, to_json};

async fn setup() -> (TestDb, MoodService) {
    let ctx = test_db().await;
    let service = MoodService::new(ctx.db.clone());
    (ctx, service)
}

fn score(score: i64) -> UpsertMoodBody {
    UpsertMoodBody { score, ..Default::default() }
}

#[tokio::test]
#[ignore = "pending #51"]
async fn keeps_a_single_entry_per_day_updating_it_on_re_submit() {
    let (_ctx, service) = setup().await;
    let first = service.upsert(UpsertMoodBody { note: Some(Some("meh".into())), ..score(2) }).await.unwrap();
    assert!(first.created);
    assert_match(&to_json(&first.entry), &json!({ "day": to_day_key(now()), "score": 2, "note": "meh" }));

    let second = service.upsert(UpsertMoodBody { linked_task_ids: Some(vec!["t1".into()]), ..score(4) }).await.unwrap();
    assert!(!second.created);
    assert_match(
        &to_json(&second.entry),
        &json!({ "id": first.entry.id, "score": 4, "note": null, "linkedTaskIds": ["t1"] }),
    );

    service.upsert(UpsertMoodBody { day: Some("2026-01-01".into()), ..score(5) }).await.unwrap();
    let days: Vec<String> = service.list(10).await.unwrap().into_iter().map(|entry| entry.day).collect();
    assert_eq!(days, [to_day_key(now()), "2026-01-01".to_owned()]);
    assert_eq!(service.list(1).await.unwrap().len(), 1);
}

#[tokio::test]
#[ignore = "pending #51"]
async fn reports_today_s_entry_and_when_the_next_day_starts() {
    let (_ctx, service) = setup().await;
    let at = local(2026, 10, 17, 15, 30);
    assert_eq!(
        service.today(at).await.unwrap(),
        MoodToday { day: "2026-10-17".into(), entry: None, next_available_at: to_iso(local_day(2026, 10, 18)) }
    );

    service.upsert(UpsertMoodBody { day: Some("2026-10-17".into()), ..score(3) }).await.unwrap();
    assert_eq!(service.today(at).await.unwrap().entry.map(|entry| entry.score), Some(3));
    assert_eq!(service.today(now()).await.unwrap().day, to_day_key(now()));
}

#[tokio::test]
#[ignore = "pending #51"]
async fn deletes_entries() {
    let (_ctx, service) = setup().await;
    let created = service.upsert(score(3)).await.unwrap();
    service.remove(&created.entry.id).await.unwrap();

    assert_eq!(service.list(10).await.unwrap(), []);
    assert_not_found(service.remove(&created.entry.id).await);
}

use life_board_api::db::columns::Timestamp;
use life_board_api::dto::calendar::{CreateEventBody, ListEventsQuery, UpdateEventBody};
use life_board_api::services::calendar::CalendarService;

use crate::common::{TestDb, assert_bad_request, assert_not_found, local, test_db};

async fn setup() -> (TestDb, CalendarService) {
    let ctx = test_db().await;
    let service = CalendarService::new(ctx.db.clone());
    (ctx, service)
}

/// `new Date(2026, 9, day, hour)`.
fn at(day: u32, hour: u32) -> Timestamp {
    local(2026, 10, day, hour, 0)
}

fn event(title: &str, start_at: Timestamp, end_at: Timestamp) -> CreateEventBody {
    CreateEventBody { title: title.into(), start_at, end_at, ..Default::default() }
}

async fn titles(service: &CalendarService, query: ListEventsQuery) -> Vec<String> {
    service.list(query).await.unwrap().into_iter().map(|event| event.title).collect()
}

#[tokio::test]
#[ignore = "pending #51"]
async fn lists_events_by_start_time_within_an_optional_range() {
    let (_ctx, service) = setup().await;
    service.create(event("Late", at(20, 9), at(20, 10))).await.unwrap();
    service.create(CreateEventBody { all_day: Some(true), ..event("Early", at(10, 9), at(10, 10)) }).await.unwrap();

    assert_eq!(titles(&service, ListEventsQuery { limit: 10, ..Default::default() }).await, ["Early", "Late"]);
    assert_eq!(
        titles(&service, ListEventsQuery { limit: 10, from: Some(at(15, 0)), ..Default::default() }).await,
        ["Late"]
    );
    assert_eq!(
        titles(&service, ListEventsQuery { limit: 10, to: Some(at(15, 0)), ..Default::default() }).await,
        ["Early"]
    );
}

#[tokio::test]
#[ignore = "pending #51"]
async fn rejects_events_that_end_before_they_start_on_create_and_update() {
    let (_ctx, service) = setup().await;
    assert_bad_request(service.create(event("Bad", at(10, 10), at(10, 9))).await);

    let created = service.create(event("Ok", at(10, 9), at(10, 10))).await.unwrap();
    assert_bad_request(
        service.update(&created.id, UpdateEventBody { end_at: Some(at(10, 8)), ..Default::default() }).await,
    );
    let moved = service
        .update(
            &created.id,
            UpdateEventBody { title: Some("Moved".into()), start_at: Some(at(10, 8)), ..Default::default() },
        )
        .await
        .unwrap();
    assert_eq!(moved.title, "Moved");
}

#[tokio::test]
#[ignore = "pending #51"]
async fn soft_deletes_events() {
    let (_ctx, service) = setup().await;
    let created = service.create(event("Event", at(10, 9), at(10, 10))).await.unwrap();
    service.remove(&created.id).await.unwrap();

    assert_eq!(service.list(ListEventsQuery { limit: 10, ..Default::default() }).await.unwrap(), []);
    assert_not_found(service.remove(&created.id).await);
    assert_not_found(
        service.update(&created.id, UpdateEventBody { title: Some("x".into()), ..Default::default() }).await,
    );
}

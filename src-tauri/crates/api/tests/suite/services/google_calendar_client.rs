use std::collections::HashMap;

use chrono::{TimeZone, Utc};
use life_board_api::services::google_calendar_client::{
    EventRef, EventWindow, GoogleCalendarApi, GoogleCalendarClient, GoogleCalendarError, GoogleEvent, GoogleEventBody,
    GoogleEventTimeBody, MAX_PAGES, PrimaryCalendar,
};
use serde_json::{Value, json};
use wiremock::matchers::{any, body_json, header, method, path, query_param, query_param_is_missing};
use wiremock::{Mock, MockServer, Request, ResponseTemplate};

const TOKEN: &str = "ya29.synthetic-access-token";
const CALENDAR: &str = "someone@gmail.com";
const CALENDAR_PATH: &str = "/calendars/someone%40gmail.com/events";

fn ok(body: Value) -> ResponseTemplate {
    ResponseTemplate::new(200).set_body_json(body)
}

async fn client_for(server: &MockServer) -> GoogleCalendarClient {
    GoogleCalendarClient::with_base_url(format!("{}/", server.uri()))
}

/// A server that answers every request with `response`.
async fn answering(response: ResponseTemplate) -> (MockServer, GoogleCalendarClient) {
    let server = MockServer::start().await;
    Mock::given(any()).respond_with(response).mount(&server).await;
    let client = client_for(&server).await;
    (server, client)
}

async fn requests(server: &MockServer) -> Vec<Request> {
    server.received_requests().await.unwrap_or_default()
}

fn query(request: &Request) -> HashMap<String, String> {
    request.url.query_pairs().map(|(key, value)| (key.into_owned(), value.into_owned())).collect()
}

fn body() -> GoogleEventBody {
    GoogleEventBody {
        summary: Some("Gym".into()),
        description: None,
        location: Some("Park".into()),
        start: Some(GoogleEventTimeBody { date: None, date_time: Some("2026-10-12T09:00:00-03:00".into()) }),
        end: Some(GoogleEventTimeBody { date: None, date_time: Some("2026-10-12T10:00:00-03:00".into()) }),
        color_id: Some("2".into()),
    }
}

fn sent_body() -> Value {
    json!({
        "summary": "Gym",
        "description": null,
        "location": "Park",
        "start": { "date": null, "dateTime": "2026-10-12T09:00:00-03:00" },
        "end": { "date": null, "dateTime": "2026-10-12T10:00:00-03:00" },
        "colorId": "2",
    })
}

fn event(id: &str) -> EventRef<'_> {
    EventRef { calendar_id: CALENDAR, event_id: id }
}

fn listed(id: &str) -> Value {
    json!({ "id": id, "status": "confirmed", "etag": "\"3\"", "summary": id })
}

#[tokio::test]
async fn reads_the_primary_calendar_with_its_time_zone() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/calendars/primary"))
        .and(header("authorization", format!("Bearer {TOKEN}").as_str()))
        .respond_with(ok(json!({ "id": CALENDAR, "timeZone": "America/Sao_Paulo", "summary": "Me" })))
        .mount(&server)
        .await;
    let client = client_for(&server).await;

    assert_eq!(
        client.get_primary_calendar(TOKEN).await.unwrap(),
        PrimaryCalendar { id: CALENDAR.into(), time_zone: Some("America/Sao_Paulo".into()) }
    );
    let (_server, empty) = answering(ok(json!({ "id": "" }))).await;
    assert_eq!(
        empty.get_primary_calendar(TOKEN).await.unwrap_err().to_string(),
        "Google Calendar returned no primary calendar."
    );
}

#[tokio::test]
async fn lists_every_page_with_the_sync_parameters() {
    let server = MockServer::start().await;
    let page = |items: Vec<Value>, next: Option<&str>| ok(json!({ "items": items, "nextPageToken": next }));
    Mock::given(method("GET"))
        .and(path(CALENDAR_PATH))
        .and(query_param_is_missing("pageToken"))
        .respond_with(page(vec![listed("a"), listed("b")], Some("page-2")))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path(CALENDAR_PATH))
        .and(query_param("pageToken", "page-2"))
        .respond_with(page(vec![listed("c")], Some("page-3")))
        .mount(&server)
        .await;
    Mock::given(method("GET"))
        .and(path(CALENDAR_PATH))
        .and(query_param("pageToken", "page-3"))
        .respond_with(ok(json!({ "items": [listed("d")] })))
        .mount(&server)
        .await;
    let client = client_for(&server).await;
    let from = Utc.with_ymd_and_hms(2026, 10, 1, 3, 0, 0).unwrap();
    let to = Utc.with_ymd_and_hms(2026, 11, 1, 3, 0, 0).unwrap();

    let events = client.list_events(TOKEN, CALENDAR, EventWindow { time_min: from, time_max: to }).await.unwrap();

    let ids: Vec<&str> = events.iter().map(|event| event.id.as_str()).collect();
    assert_eq!(ids, ["a", "b", "c", "d"]);
    let sent = requests(&server).await;
    assert_eq!(sent.len(), 3);
    let first = query(&sent[0]);
    let expected = [
        ("singleEvents", "true"),
        ("showDeleted", "true"),
        ("timeMin", "2026-10-01T03:00:00.000Z"),
        ("timeMax", "2026-11-01T03:00:00.000Z"),
        ("maxResults", "250"),
    ];
    for (key, value) in expected {
        assert_eq!(first.get(key).map(String::as_str), Some(value), "{key}");
        assert_eq!(query(&sent[2]).get(key).map(String::as_str), Some(value), "{key} on the last page");
    }
    assert_eq!(first.len(), expected.len());
}

#[tokio::test]
async fn stops_a_listing_that_never_ends() {
    let (server, client) = answering(ok(json!({ "items": [], "nextPageToken": "again" }))).await;
    let now = Utc::now();
    let error = client.list_events(TOKEN, CALENDAR, EventWindow { time_min: now, time_max: now }).await.unwrap_err();
    assert_eq!(error.to_string(), "Google Calendar sent too many pages.");
    assert_eq!(requests(&server).await.len(), MAX_PAGES);

    let (_server, client) = answering(ok(json!({ "nextPageToken": "" }))).await;
    assert!(
        client.list_events(TOKEN, CALENDAR, EventWindow { time_min: now, time_max: now }).await.unwrap().is_empty()
    );
}

#[tokio::test]
async fn inserts_patches_and_deletes_with_encoded_ids() {
    let server = MockServer::start().await;
    let event_path = format!("{CALENDAR_PATH}/abc_123%40google.com");
    Mock::given(method("POST"))
        .and(path(CALENDAR_PATH))
        .and(body_json(sent_body()))
        .respond_with(ok(listed("new_1")))
        .mount(&server)
        .await;
    Mock::given(method("PATCH"))
        .and(path(event_path.as_str()))
        .and(header("if-match", "\"3\""))
        .and(body_json(sent_body()))
        .respond_with(ok(listed("abc_123@google.com")))
        .mount(&server)
        .await;
    Mock::given(method("DELETE"))
        .and(path(event_path.as_str()))
        .respond_with(ResponseTemplate::new(204))
        .mount(&server)
        .await;
    let client = client_for(&server).await;

    let inserted = client.insert_event(TOKEN, CALENDAR, &body()).await.unwrap();
    assert_eq!((inserted.id.as_str(), inserted.etag.as_deref()), ("new_1", Some("\"3\"")));
    let patched = client.patch_event(TOKEN, event("abc_123@google.com"), "\"3\"", &body()).await.unwrap();
    assert_eq!(patched.summary.as_deref(), Some("abc_123@google.com"));
    client.delete_event(TOKEN, event("abc_123@google.com")).await.unwrap();

    let sent = requests(&server).await;
    let methods: Vec<&str> = sent.iter().map(|request| request.method.as_str()).collect();
    assert_eq!(methods, ["POST", "PATCH", "DELETE"]);
    assert!(sent[0].headers.get("if-match").is_none());
    assert!(sent[2].body.is_empty());
}

#[tokio::test]
async fn keeps_the_token_in_the_authorization_header_only() {
    let (server, client) = answering(ok(json!({ "items": [] }))).await;
    let now = Utc::now();
    client.list_events(TOKEN, CALENDAR, EventWindow { time_min: now, time_max: now }).await.unwrap();
    let (_failing, failing) = answering(ResponseTemplate::new(500).set_body_string(TOKEN)).await;
    let error = failing.insert_event(TOKEN, CALENDAR, &body()).await.unwrap_err();

    let sent = &requests(&server).await[0];
    assert_eq!(sent.headers.get("authorization").unwrap(), &format!("Bearer {TOKEN}"));
    assert!(!sent.url.as_str().contains(TOKEN));
    let others = sent.headers.iter().filter(|(name, _)| name.as_str() != "authorization");
    assert!(others.into_iter().all(|(_, value)| !value.to_str().unwrap_or_default().contains(TOKEN)));
    assert!(!format!("{error} {error:?}").contains(TOKEN), "{error:?}");
}

fn google_error(status: u16, reason: &str) -> ResponseTemplate {
    ResponseTemplate::new(status)
        .set_body_json(json!({ "error": { "code": status, "message": "Synthetic", "errors": [{ "reason": reason }] } }))
}

/// What a patch, which treats `404`/`410` as a gone event, and an insert, which doesn't, fail with.
async fn failures(response: ResponseTemplate) -> (GoogleCalendarError, GoogleCalendarError) {
    let (_server, client) = answering(response).await;
    let patch = client.patch_event(TOKEN, event("e1"), "\"1\"", &body()).await.unwrap_err();
    let insert = client.insert_event(TOKEN, CALENDAR, &body()).await.unwrap_err();
    (patch, insert)
}

#[tokio::test]
async fn maps_each_error_status_to_its_variant() {
    use GoogleCalendarError::{Conflict, Gone, Http, RateLimited, Unauthorized};

    assert_eq!(failures(google_error(401, "authError")).await.0, Unauthorized);
    assert_eq!(failures(google_error(412, "conditionNotMet")).await.0, Conflict);
    assert_eq!(failures(google_error(403, "rateLimitExceeded")).await.0, RateLimited);
    assert_eq!(failures(google_error(403, "userRateLimitExceeded")).await.0, RateLimited);
    assert_eq!(failures(ResponseTemplate::new(429)).await.0, RateLimited);
    let forbidden = Http { status: 403, message: "Google Calendar answered 403: Synthetic".into() };
    assert_eq!(failures(google_error(403, "forbidden")).await.0, forbidden);

    let (patch, insert) = failures(google_error(404, "notFound")).await;
    assert_eq!(patch, Gone);
    assert_eq!(insert, Http { status: 404, message: "Google Calendar answered 404: Synthetic".into() });
    assert_eq!(failures(ResponseTemplate::new(410)).await.0, Gone);
    let (_server, client) = answering(ResponseTemplate::new(410)).await;
    assert_eq!(client.delete_event(TOKEN, event("e1")).await.unwrap_err(), Gone);

    let not_json = ResponseTemplate::new(500).set_body_string("<html>Server Error</html>");
    let message = "Google Calendar answered 500.".to_owned();
    assert_eq!(failures(not_json).await.0, Http { status: 500, message });
    let long = ResponseTemplate::new(400).set_body_json(json!({ "error": { "message": "x".repeat(500) } }));
    let GoogleCalendarError::Http { message, .. } = failures(long).await.0 else { panic!("expected Http") };
    assert_eq!(message.len(), "Google Calendar answered 400: ".len() + 200);
}

#[tokio::test]
async fn reports_invalid_answers_and_network_failures() {
    let (_server, client) = answering(ResponseTemplate::new(200).set_body_string("not json")).await;
    assert_eq!(
        client.insert_event(TOKEN, CALENDAR, &body()).await.unwrap_err(),
        GoogleCalendarError::Http { status: 200, message: "Google Calendar sent an invalid response.".into() }
    );

    let unreachable = GoogleCalendarClient::with_base_url("http://127.0.0.1:9");
    let error = unreachable.get_primary_calendar(TOKEN).await.unwrap_err();
    assert!(matches!(error, GoogleCalendarError::Network(_)), "{error:?}");
    assert!(!error.to_string().contains(TOKEN));

    let broken = GoogleCalendarClient::with_base_url("::");
    let error = broken.delete_event(TOKEN, event("e1")).await.unwrap_err();
    assert!(matches!(&error, GoogleCalendarError::Http { status: 0, message } if message.starts_with("Invalid")));
}

#[test]
fn defaults_to_the_google_calendar_api() {
    assert_eq!(GoogleCalendarClient::new().base_url(), "https://www.googleapis.com/calendar/v3");
    assert_eq!(GoogleCalendarClient::default().base_url(), "https://www.googleapis.com/calendar/v3");
    assert_eq!(GoogleCalendarClient::with_base_url("http://127.0.0.1:9/").base_url(), "http://127.0.0.1:9");
}

#[test]
fn reads_cancelled_events_with_only_an_id() {
    let event: GoogleEvent = serde_json::from_value(json!({ "id": "gone", "status": "cancelled" })).unwrap();
    assert_eq!(event, GoogleEvent { id: "gone".into(), status: Some("cancelled".into()), ..GoogleEvent::default() });
    assert_eq!(serde_json::to_value(&event).unwrap(), json!({ "id": "gone", "status": "cancelled" }));
}

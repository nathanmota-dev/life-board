//! Runs under `TZ=UTC` and `TZ=America/Sao_Paulo` (see `AGENTS.md`): the results
//! must be the same local days and instants in both.

use chrono::{FixedOffset, Local, LocalResult, NaiveDate, NaiveDateTime, NaiveTime, TimeZone, Utc};
use life_board_api::db::schema::calendar::DEFAULT_COLOR;
use life_board_api::services::date::{from_day_key, to_day_key};
use life_board_api::services::google_calendar_client::{
    GOOGLE_EVENT_COLORS, GoogleEvent, GoogleEventBody, GoogleEventFields, GoogleEventTimeBody, color_from_google,
    color_to_google, from_google, to_google,
};
use serde_json::{Value, json};

fn google(value: Value) -> GoogleEvent {
    serde_json::from_value(value).unwrap()
}

/// The event Google would store from `body`, as a listing returns it.
fn stored(id: &str, body: &GoogleEventBody) -> GoogleEvent {
    let mut value = serde_json::to_value(body).unwrap();
    value["id"] = json!(id);
    google(value)
}

fn utc(text: &str) -> chrono::DateTime<Utc> {
    chrono::DateTime::parse_from_rfc3339(text).unwrap().to_utc()
}

fn all_day(start: &str, end: &str) -> GoogleEvent {
    google(json!({ "id": "day", "start": { "date": start }, "end": { "date": end } }))
}

fn date(time: Option<&GoogleEventTimeBody>) -> Option<&str> {
    time.and_then(|time| time.date.as_deref())
}

fn dates(body: &GoogleEventBody) -> (Option<&str>, Option<&str>) {
    (date(body.start.as_ref()), date(body.end.as_ref()))
}

#[test]
fn reads_timed_events_with_any_offset() {
    let event = google(json!({
        "id": "timed",
        "summary": "Gym",
        "start": { "dateTime": "2026-10-12T09:00:00-03:00", "timeZone": "America/Sao_Paulo" },
        "end": { "dateTime": "2026-10-12T13:30:00Z" },
    }));
    let fields = from_google(&event, &Local);

    assert!(!fields.all_day);
    assert_eq!(fields.title.as_deref(), Some("Gym"));
    assert_eq!(fields.start_at, Some(utc("2026-10-12T12:00:00Z")));
    assert_eq!(fields.end_at, Some(utc("2026-10-12T10:30:00-03:00")));
    assert_eq!(from_google(&event, &Utc), fields);
}

#[test]
fn writes_timed_events_with_the_local_offset() {
    let fields = from_google(
        &google(
            json!({ "id": "timed", "start": { "dateTime": "2026-10-12T12:00:00Z" }, "end": { "dateTime": "2026-10-12T13:00:00.500Z" } }),
        ),
        &Local,
    );
    let brt = FixedOffset::west_opt(3 * 3600).unwrap();

    let body = to_google(&fields, &brt);
    let value = serde_json::to_value(&body).unwrap();
    assert_eq!(value["start"], json!({ "date": null, "dateTime": "2026-10-12T09:00:00-03:00" }));
    assert_eq!(value["end"], json!({ "date": null, "dateTime": "2026-10-12T10:00:00-03:00" }));
    assert!(value["start"].get("timeZone").is_none());
    assert_eq!(to_google(&fields, &Utc).start.unwrap().date_time.as_deref(), Some("2026-10-12T12:00:00+00:00"));
    let local = to_google(&fields, &Local);
    assert_eq!(from_google(&stored("timed", &local), &Local).start_at, fields.start_at);
}

#[test]
fn reads_a_one_day_event_as_local_midnight_to_local_midnight() {
    let fields = from_google(&all_day("2026-10-12", "2026-10-13"), &Local);

    // Like `valuesToEventInput`: an all-day event ends at the start of its last day.
    assert!(fields.all_day);
    assert_eq!(fields.start_at, from_day_key("2026-10-12"));
    assert_eq!(fields.end_at, from_day_key("2026-10-12"));
    let body = to_google(&fields, &Local);
    assert_eq!(dates(&body), (Some("2026-10-12"), Some("2026-10-13")));
    assert_eq!(serde_json::to_value(&body).unwrap()["start"], json!({ "date": "2026-10-12", "dateTime": null }));
}

#[test]
fn round_trips_a_three_day_event_with_its_exclusive_end() {
    let fields = from_google(&all_day("2026-10-12", "2026-10-15"), &Local);

    assert_eq!(fields.start_at, from_day_key("2026-10-12"));
    assert_eq!(fields.end_at, from_day_key("2026-10-14"));
    assert_eq!(fields.end_at.map(to_day_key).as_deref(), Some("2026-10-14"));
    let body = to_google(&fields, &Local);
    assert_eq!(dates(&body), (Some("2026-10-12"), Some("2026-10-15")));
    let back = from_google(&stored("day", &body), &Local);
    assert_eq!((back.start_at, back.end_at, back.all_day), (fields.start_at, fields.end_at, true));
}

#[test]
fn keeps_one_local_day_when_daylight_saving_changed_elsewhere() {
    let event = google(json!({
        "id": "dst",
        "start": { "date": "2026-03-08", "timeZone": "America/New_York" },
        "end": { "date": "2026-03-09", "timeZone": "America/New_York" },
    }));
    let fields = from_google(&event, &Local);

    let (start, end) = (fields.start_at.unwrap(), fields.end_at.unwrap());
    assert_eq!((to_day_key(start), to_day_key(end)), ("2026-03-08".into(), "2026-03-08".into()));
    assert_eq!(dates(&to_google(&fields, &Local)), (Some("2026-03-08"), Some("2026-03-09")));
}

/// `America/Sao_Paulo` in 2018: clocks jumped from 00:00 to 01:00 on November 4.
#[derive(Debug, Clone, Copy)]
struct SaoPaulo2018;

const SWITCH: i64 = 1_541_300_400; // 2018-11-04T03:00:00Z

fn offset(hours: i32) -> FixedOffset {
    FixedOffset::west_opt(hours * 3600).unwrap()
}

impl TimeZone for SaoPaulo2018 {
    type Offset = FixedOffset;

    fn from_offset(_: &FixedOffset) -> Self {
        Self
    }

    fn offset_from_local_date(&self, local: &NaiveDate) -> LocalResult<FixedOffset> {
        self.offset_from_local_datetime(&local.and_time(NaiveTime::MIN))
    }

    fn offset_from_local_datetime(&self, local: &NaiveDateTime) -> LocalResult<FixedOffset> {
        let wall = local.and_utc().timestamp();
        match (wall + 3 * 3600 < SWITCH, wall + 2 * 3600 >= SWITCH) {
            (true, true) => LocalResult::Ambiguous(offset(3), offset(2)),
            (true, false) => LocalResult::Single(offset(3)),
            (false, true) => LocalResult::Single(offset(2)),
            (false, false) => LocalResult::None,
        }
    }

    fn offset_from_utc_date(&self, utc: &NaiveDate) -> FixedOffset {
        self.offset_from_utc_datetime(&utc.and_time(NaiveTime::MIN))
    }

    fn offset_from_utc_datetime(&self, utc: &NaiveDateTime) -> FixedOffset {
        if utc.and_utc().timestamp() < SWITCH { offset(3) } else { offset(2) }
    }
}

#[test]
fn starts_a_day_without_a_midnight_at_its_first_hour() {
    let fields = from_google(&all_day("2018-11-04", "2018-11-05"), &SaoPaulo2018);
    assert_eq!(fields.start_at, Some(utc("2018-11-04T01:00:00-02:00")));
    assert_eq!(fields.end_at, fields.start_at);
    assert_eq!(dates(&to_google(&fields, &SaoPaulo2018)), (Some("2018-11-04"), Some("2018-11-05")));

    let across = from_google(&all_day("2018-11-03", "2018-11-06"), &SaoPaulo2018);
    assert_eq!(across.start_at, Some(utc("2018-11-03T00:00:00-03:00")));
    assert_eq!(across.end_at, Some(utc("2018-11-05T00:00:00-02:00")));
    assert_eq!(dates(&to_google(&across, &SaoPaulo2018)), (Some("2018-11-03"), Some("2018-11-06")));
    let timed = GoogleEventFields { all_day: false, ..across };
    let start = to_google(&timed, &SaoPaulo2018).start.unwrap().date_time;
    assert_eq!(start.as_deref(), Some("2018-11-03T00:00:00-03:00"));
}

#[test]
fn reads_a_cancelled_event_with_only_an_id_and_a_status() {
    let fields = from_google(&google(json!({ "id": "gone", "status": "cancelled" })), &Local);

    assert_eq!(
        fields,
        GoogleEventFields {
            id: "gone".into(),
            color: DEFAULT_COLOR.into(),
            cancelled: true,
            ..GoogleEventFields::default()
        }
    );
    let body = to_google(&fields, &Local);
    assert_eq!((body.start, body.end, body.summary), (None, None, None));
    let value = serde_json::to_value(to_google(&fields, &Local)).unwrap();
    assert!(value.get("start").is_none() && value["summary"].is_null());
}

#[test]
fn keeps_the_recurring_id_and_the_sync_metadata() {
    let event = google(json!({
        "id": "series_20261012T120000Z",
        "status": "confirmed",
        "etag": "\"3181161784712000\"",
        "updated": "2026-10-01T12:00:00.000Z",
        "summary": "Standup",
        "description": "Notes",
        "location": "Office",
        "colorId": "11",
        "recurringEventId": "series",
        "htmlLink": "https://www.google.com/calendar/event?eid=abc",
        "start": { "dateTime": "2026-10-12T09:00:00-03:00" },
        "end": { "dateTime": "2026-10-12T09:15:00-03:00" },
        "attendees": [{ "email": "other@example.com" }],
        "reminders": { "useDefault": true },
    }));
    let fields = from_google(&event, &Local);

    assert_eq!(fields.recurring_event_id.as_deref(), Some("series"));
    assert_eq!(fields.etag.as_deref(), Some("\"3181161784712000\""));
    assert_eq!(fields.updated, Some(utc("2026-10-01T12:00:00Z")));
    assert_eq!(fields.html_link.as_deref(), Some("https://www.google.com/calendar/event?eid=abc"));
    assert_eq!((fields.description.as_deref(), fields.location.as_deref()), (Some("Notes"), Some("Office")));
    assert_eq!(fields.color, "#d50000");
    assert!(!fields.cancelled);

    let value = serde_json::to_value(to_google(&fields, &Local)).unwrap();
    let keys: Vec<&str> = value.as_object().unwrap().keys().map(String::as_str).collect();
    assert_eq!(keys, ["colorId", "description", "end", "location", "start", "summary"]);
    assert_eq!(value["colorId"], "11");
}

#[test]
fn keeps_a_missing_or_empty_title_as_none() {
    for summary in [json!(null), json!(""), json!("   ")] {
        let event = google(json!({ "id": "x", "summary": summary, "description": "", "location": " " }));
        let fields = from_google(&event, &Local);
        assert_eq!((fields.title, fields.description, fields.location), (None, None, None), "{summary}");
    }
}

#[test]
fn never_ends_before_it_starts() {
    let backwards = from_google(&all_day("2026-10-12", "2026-10-10"), &Local);
    assert_eq!(backwards.end_at, backwards.start_at);
    let no_end = from_google(&google(json!({ "id": "x", "start": { "date": "2026-10-12" } })), &Local);
    assert_eq!(no_end.end_at, from_day_key("2026-10-12"));
    let open = from_google(&google(json!({ "id": "x", "start": { "dateTime": "2026-10-12T09:00:00Z" } })), &Local);
    assert_eq!(open.end_at, open.start_at);
    let broken = from_google(&google(json!({ "id": "x", "start": { "date": "12/10/2026" } })), &Local);
    assert_eq!((broken.start_at, broken.all_day), (None, false));

    let reversed = GoogleEventFields { end_at: from_day_key("2026-10-01"), ..backwards };
    assert_eq!(dates(&to_google(&reversed, &Local)), (Some("2026-10-12"), Some("2026-10-13")));
}

#[test]
fn maps_every_google_color_and_back() {
    for (id, hex) in GOOGLE_EVENT_COLORS {
        assert_eq!(color_from_google(Some(id)), hex);
        assert_eq!(color_to_google(hex).as_deref(), Some(id), "{hex}");
    }
    assert_eq!(color_from_google(None), DEFAULT_COLOR);
    assert_eq!(color_from_google(Some("99")), DEFAULT_COLOR);
}

#[test]
fn maps_each_life_board_color_to_the_nearest_google_color() {
    // `EVENT_COLOR_HEX` in `web/src/lib/calendar.ts`, plus the API's default.
    let nearest = [
        ("#FF892B", "5"), // orange → Banana
        ("#8B5CF6", "1"), // purple → Lavender
        ("#3B82F6", "7"), // blue → Peacock
        ("#10B981", "2"), // green → Sage
        ("#F43F5E", "4"), // red → Flamingo
        ("#64748B", "8"), // gray → Graphite
        ("#F59E0B", "5"), // yellow → Banana
        (DEFAULT_COLOR, "7"),
    ];
    for (hex, id) in nearest {
        assert_eq!(color_to_google(hex).as_deref(), Some(id), "{hex}");
    }
    for invalid in ["", "#fff", "3b82f6", "#3b82fg", "#+12345"] {
        assert_eq!(color_to_google(invalid), None, "{invalid}");
    }
}

//! Rust-only: the DTO rules that Zod applied in Node (they run today; the
//! controller tests that cover them over HTTP wait for the services).

use chrono::{TimeZone, Utc};
use life_board_api::db::schema::file_boards::FileKind;
use life_board_api::db::schema::tasks::TaskStatus;
use life_board_api::dto::Dto;
use life_board_api::dto::calendar::CreateEventBody;
use life_board_api::dto::common::parse_js_date;
use life_board_api::dto::file_boards::UploadItemFields;
use life_board_api::dto::github::{ListIssuesQuery, ListPrsQuery};
use life_board_api::dto::goals::MilestoneParams;
use life_board_api::dto::habits::{CreateHabitBody, LogHabitBody};
use life_board_api::dto::links::ResolveLinksBody;
use life_board_api::dto::settings::UpdateFilesSettingsBody;
use life_board_api::dto::tasks::{CreateTaskBody, ListTasksQuery, ReorderTasksBody, TaskOrder, UpdateTaskBody};
use life_board_api::dto::thoughts::ListThoughtsQuery;
use life_board_api::error::Issue;
use serde_json::{Value, json};

fn paths<T: std::fmt::Debug>(result: Result<T, Vec<Issue>>) -> Vec<String> {
    result.expect_err("expected issues").into_iter().map(|issue| issue.path).collect()
}

fn utc(year: i32, month: u32, day: u32, hour: u32, minute: u32) -> chrono::DateTime<Utc> {
    Utc.with_ymd_and_hms(year, month, day, hour, minute, 0).unwrap()
}

#[test]
fn tells_missing_from_null_fields() {
    let body = CreateTaskBody::parse(&json!({ "title": "x", "description": null, "dueAt": "2026-10-20" })).unwrap();
    assert_eq!(body.description, Some(None));
    assert_eq!(body.due_at, Some(Some(utc(2026, 10, 20, 0, 0))));
    assert_eq!(body.status, None);

    let patch = UpdateTaskBody::parse(&json!({ "status": "done", "color": null })).unwrap();
    assert_eq!((patch.status, patch.color, patch.focus_day), (Some(TaskStatus::Done), Some(None), None));
    assert_eq!(paths(UpdateTaskBody::parse(&json!({ "title": null }))), ["/title"]);
}

#[test]
fn reports_every_issue_as_a_json_pointer() {
    let issues =
        paths(CreateTaskBody::parse(&json!({ "items": ["ok", " "], "focusDay": "19/10/2026", "tags": ["a", 1] })));
    assert_eq!(issues, ["/title", "/tags/1", "/focusDay", "/items/1"]);
    assert_eq!(paths(CreateTaskBody::parse(&Value::Null)), ["/"]);
    assert_eq!(paths(ReorderTasksBody::parse(&json!([]))), ["/"]);
    assert_eq!(paths(ReorderTasksBody::parse(&json!([{ "id": "", "order": 1 }]))), ["/0/id", "/0/pinned"]);
    assert_eq!(
        ReorderTasksBody::parse(&json!([{ "id": "a", "order": -1, "pinned": true }])).unwrap(),
        ReorderTasksBody(vec![TaskOrder { id: "a".into(), order: -1, pinned: true }])
    );
}

#[test]
fn trims_strings_and_counts_lengths_in_code_points() {
    let body = CreateHabitBody::parse(&json!({ "name": "  Water ", "target": 1, "emoji": "💧".repeat(32) })).unwrap();
    assert_eq!(body.name, "Water");
    assert_eq!(
        paths(CreateHabitBody::parse(&json!({ "name": "Water", "target": 1, "emoji": "💧".repeat(33) }))),
        ["/emoji"]
    );
    assert_eq!(paths(CreateHabitBody::parse(&json!({ "name": " ", "target": 1 }))), ["/name"]);
}

#[test]
fn rejects_fractions_zero_deltas_and_out_of_range_numbers() {
    assert_eq!(LogHabitBody::parse(&json!({ "delta": 2 })).unwrap().delta, 2);
    assert_eq!(paths(LogHabitBody::parse(&json!({ "delta": 0 }))), ["/delta"]);
    assert_eq!(paths(LogHabitBody::parse(&json!({ "delta": 0.5 }))), ["/delta"]);
    assert_eq!(paths(LogHabitBody::parse(&json!({ "delta": "1" }))), ["/delta"]);
    assert_eq!(paths(CreateHabitBody::parse(&json!({ "name": "Gym", "target": 10_001 }))), ["/target"]);
}

#[test]
fn coerces_query_strings_with_defaults() {
    assert_eq!(ListTasksQuery::parse(&json!({})).unwrap(), ListTasksQuery::default());
    let query = ListTasksQuery::parse(&json!({ "limit": "10", "pinned": "false", "archived": "true" })).unwrap();
    assert_eq!((query.limit, query.pinned, query.archived), (10, Some(false), Some(true)));
    assert_eq!(paths(ListTasksQuery::parse(&json!({ "limit": "1000" }))), ["/limit"]);
    assert_eq!(
        paths(ListTasksQuery::parse(&json!({ "limit": "abc", "pinned": "yes", "include": "everything" }))),
        ["/limit", "/include", "/pinned"]
    );
    assert_eq!(ListThoughtsQuery::parse(&json!({ "pinned": "YES" })).unwrap().pinned, Some(true));
    assert_eq!(paths(ListThoughtsQuery::parse(&json!({ "cursor": "abc", "pinned": "maybe" }))), ["/cursor", "/pinned"]);
    assert_eq!(
        ListThoughtsQuery::parse(&json!({ "cursor": "1:1000:01JABC_x" })).unwrap().cursor.as_deref(),
        Some("1:1000:01JABC_x")
    );
}

#[test]
fn keeps_issue_kinds_a_subset_of_pr_kinds() {
    assert!(ListPrsQuery::parse(&json!({ "kind": "review_requested" })).is_ok());
    assert_eq!(paths(ListIssuesQuery::parse(&json!({ "kind": "review_requested" }))), ["/kind"]);
    assert_eq!(ListIssuesQuery::parse(&json!({})).unwrap().limit, 100);
}

#[test]
fn requires_a_nullable_base_dir() {
    assert_eq!(paths(UpdateFilesSettingsBody::parse(&json!({}))), ["/baseDir"]);
    assert_eq!(UpdateFilesSettingsBody::parse(&json!({ "baseDir": null })).unwrap().base_dir, None);
    assert_eq!(
        UpdateFilesSettingsBody::parse(&json!({ "baseDir": " /data " })).unwrap().base_dir.as_deref(),
        Some("/data")
    );
    assert_eq!(paths(UpdateFilesSettingsBody::parse(&json!({ "baseDir": " " }))), ["/baseDir"]);
}

#[test]
fn parses_dates_like_javascript() {
    assert_eq!(parse_js_date("2026-10-20"), Some(utc(2026, 10, 20, 0, 0)));
    assert_eq!(parse_js_date("2026-10-20T14:00:00Z"), Some(utc(2026, 10, 20, 14, 0)));
    assert_eq!(parse_js_date("2026-10-20T14:00Z"), Some(utc(2026, 10, 20, 14, 0)));
    assert_eq!(parse_js_date("2026-10-20T16:30:00.000+02:30"), Some(utc(2026, 10, 20, 14, 0)));
    assert_eq!(parse_js_date("not a date"), None);
    assert_eq!(parse_js_date("2026-13-01"), None);
    let event = CreateEventBody::parse(&json!({ "title": "x", "startAt": 0, "endAt": 1_000 })).unwrap();
    assert_eq!((event.start_at.timestamp_millis(), event.end_at.timestamp_millis()), (0, 1_000));
}

#[test]
fn coerces_multipart_fields_and_fills_link_defaults() {
    let fields =
        UploadItemFields::parse(&json!({ "kind": "receipt", "amountCents": "1990", "currency": "BRL" })).unwrap();
    assert_eq!((fields.kind, fields.amount_cents), (Some(FileKind::Receipt), Some(1990)));
    assert_eq!(
        paths(UploadItemFields::parse(&json!({ "kind": "spaceship", "currency": "R$" }))),
        ["/kind", "/currency"]
    );
    assert_eq!(ResolveLinksBody::parse(&json!({ "taskIds": ["t1"], "unknown": true })).unwrap().task_ids, ["t1"]);
    assert!(ResolveLinksBody::parse(&json!({})).unwrap().goal_ids.is_empty());
}

#[test]
fn reads_the_goal_of_milestone_routes_from_the_id_segment() {
    let params = MilestoneParams::parse(&json!({ "id": "g1", "milestoneId": "m1" })).unwrap();
    assert_eq!((params.goal_id.as_str(), params.milestone_id.as_str()), ("g1", "m1"));
}

use rusqlite::Connection;
use rusqlite::types::Value;
use serde::Serialize;

use crate::db::Db;
use crate::db::columns::{string_enum, to_iso};
use crate::db::schema::calendar::CalendarEvent;
use crate::db::schema::goals::Goal;
use crate::db::schema::tasks::{Task, TaskStatus};
use crate::db::schema::thoughts::Thought;
use crate::dto::links::{BacklinkKind, BacklinkTarget, ResolveLinksBody};
use crate::error::ApiResult;
use crate::services::query::{json_array_contains, placeholders, query_all};

/// `{ moduleId, entity }`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "moduleId", content = "entity", rename_all = "lowercase")]
pub enum ResolvedLink {
    Tasks(Task),
    Thoughts(Thought),
    Calendar(CalendarEvent),
    Goals(Goal),
}

string_enum! {
    pub enum BacklinkSource { Tasks = "tasks", Thoughts = "thoughts", Calendar = "calendar", Goals = "goals" }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Backlink {
    pub source: BacklinkSource,
    pub source_id: String,
    pub label: String,
    /// Missing (not `null`) when there is nothing to add.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub meta: Option<String>,
}

/// `POST /links/resolve` body.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ResolvedLinks {
    pub links: Vec<ResolvedLink>,
}

/// `GET /links/backlinks/:kind/:id` body.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Backlinks {
    pub backlinks: Vec<Backlink>,
}

#[derive(Clone)]
pub struct LinksService {
    db: Db,
}

impl LinksService {
    pub fn new(db: Db) -> Self {
        Self { db }
    }

    /// Tasks, thoughts, events and goals with those ids, skipping deleted ones.
    pub async fn resolve(&self, input: ResolveLinksBody) -> ApiResult<Vec<ResolvedLink>> {
        Ok(self
            .db
            .call(move |conn| {
                let mut links = Vec::new();
                if !input.task_ids.is_empty() {
                    links.extend(
                        by_ids(conn, "tasks", &input.task_ids, Task::from_row)?.into_iter().map(ResolvedLink::Tasks),
                    );
                }
                if !input.thought_ids.is_empty() {
                    links.extend(
                        by_ids(conn, "thoughts", &input.thought_ids, Thought::from_row)?
                            .into_iter()
                            .map(ResolvedLink::Thoughts),
                    );
                }
                if !input.calendar_ids.is_empty() {
                    links.extend(
                        by_ids(conn, "calendar_events", &input.calendar_ids, CalendarEvent::from_row)?
                            .into_iter()
                            .map(ResolvedLink::Calendar),
                    );
                }
                if !input.goal_ids.is_empty() {
                    links.extend(
                        by_ids(conn, "goals", &input.goal_ids, Goal::from_row)?.into_iter().map(ResolvedLink::Goals),
                    );
                }
                Ok(links)
            })
            .await?)
    }

    /// Everything that links TO the target task or thought.
    pub async fn backlinks(&self, target: BacklinkTarget) -> ApiResult<Vec<Backlink>> {
        Ok(self
            .db
            .call(move |conn| {
                let mut backlinks = Vec::new();
                let id = target.id.as_str();
                if target.kind == BacklinkKind::Thought {
                    for task in linking(conn, "tasks", "linked_thought_ids", id, Task::from_row)? {
                        let meta = if task.status == TaskStatus::Done { "done" } else { task.priority.as_str() };
                        backlinks.push(Backlink {
                            source: BacklinkSource::Tasks,
                            source_id: task.id,
                            label: task.title,
                            meta: Some(meta.to_owned()),
                        });
                    }
                } else {
                    for thought in linking(conn, "thoughts", "linked_task_ids", id, Thought::from_row)? {
                        let label = match thought.title.filter(|title| !title.is_empty()) {
                            Some(title) => title,
                            None => {
                                let text = js_slice(&strip_html(&thought.body), 80);
                                if text.is_empty() { "(untitled thought)".to_owned() } else { text }
                            }
                        };
                        backlinks.push(Backlink {
                            source: BacklinkSource::Thoughts,
                            source_id: thought.id,
                            label,
                            meta: None,
                        });
                    }
                }

                let column =
                    if target.kind == BacklinkKind::Thought { "linked_thought_ids" } else { "linked_task_ids" };
                for event in linking(conn, "calendar_events", column, id, CalendarEvent::from_row)? {
                    backlinks.push(Backlink {
                        source: BacklinkSource::Calendar,
                        source_id: event.id,
                        label: event.title,
                        meta: Some(to_iso(event.start_at)),
                    });
                }
                for goal in linking(conn, "goals", column, id, Goal::from_row)? {
                    backlinks.push(Backlink {
                        source: BacklinkSource::Goals,
                        source_id: goal.id,
                        label: goal.title,
                        meta: Some(goal.status.as_str().to_owned()),
                    });
                }
                Ok(backlinks)
            })
            .await?)
    }
}

/// Rows of `table` with one of `ids`, not deleted.
fn by_ids<T>(
    conn: &Connection,
    table: &str,
    ids: &[String],
    map: impl FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<T>,
) -> rusqlite::Result<Vec<T>> {
    let params: Vec<Value> = ids.iter().map(|id| Value::Text(id.clone())).collect();
    let sql = format!("SELECT * FROM {table} WHERE id IN ({}) AND deleted_at IS NULL", placeholders(params.len()));
    query_all(conn, &sql, &params, map)
}

/// Rows of `table` whose `column` list holds `id`, not deleted.
fn linking<T>(
    conn: &Connection,
    table: &str,
    column: &str,
    id: &str,
    map: impl FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<T>,
) -> rusqlite::Result<Vec<T>> {
    let contains = json_array_contains(column, id);
    let sql = format!("SELECT * FROM {table} WHERE ({}) AND deleted_at IS NULL", contains.sql);
    query_all(conn, &sql, &contains.params, map)
}

/// `text.slice(0, max)`: the first `max` UTF-16 code units (never splitting a character).
fn js_slice(text: &str, max: usize) -> String {
    let mut units = 0;
    text.chars()
        .take_while(|char| {
            units += char.len_utf16();
            units <= max
        })
        .collect()
}

/// `\s` in a JavaScript regular expression.
fn is_js_space(char: char) -> bool {
    char.is_whitespace() || char == '\u{feff}'
}

/// `stripHtml`: tags become spaces, whitespace collapses.
pub fn strip_html(value: &str) -> String {
    // `/<[^>]+>/g`: a `<` followed by at least one non-`>` and a `>`.
    let mut text = String::with_capacity(value.len());
    let mut rest = value;
    while let Some(start) = rest.find('<') {
        text.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        match after.find('>') {
            Some(end) if end > 0 => {
                text.push(' ');
                rest = &after[end + 1..];
            }
            _ => {
                text.push('<');
                rest = after;
            }
        }
    }
    text.push_str(rest);
    text.split(is_js_space).filter(|part| !part.is_empty()).collect::<Vec<_>>().join(" ")
}

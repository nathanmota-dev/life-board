use serde::Serialize;

use crate::db::Db;
use crate::db::columns::string_enum;
use crate::db::schema::calendar::CalendarEvent;
use crate::db::schema::goals::Goal;
use crate::db::schema::tasks::Task;
use crate::db::schema::thoughts::Thought;
use crate::dto::links::{BacklinkTarget, ResolveLinksBody};
use crate::error::ApiResult;

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
        pending!(51, self.db, input)
    }

    /// Everything that links TO the target task or thought.
    pub async fn backlinks(&self, target: BacklinkTarget) -> ApiResult<Vec<Backlink>> {
        pending!(51, self.db, target)
    }
}

/// `stripHtml`: tags become spaces, whitespace collapses.
pub fn strip_html(value: &str) -> String {
    pending!(51, value)
}

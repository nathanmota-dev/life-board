use crate::db::Db;
use crate::db::schema::projects::{Project, ProjectStatusChange};
use crate::dto::Items;
use crate::dto::projects::{CreateProjectBody, ListProjectsQuery, MoveProjectBody, UpdateProjectBody};
use crate::error::ApiResult;

/// Done projects leave the board this long after reaching Done.
pub const ARCHIVE_AFTER_MS: i64 = 14 * 24 * 60 * 60 * 1000;

#[derive(Clone)]
pub struct ProjectsService {
    db: Db,
}

impl ProjectsService {
    pub fn new(db: Db) -> Self {
        Self { db }
    }

    /// The board (archiving stale Done projects first), or the archived projects, newest first.
    pub async fn list(&self, query: ListProjectsQuery) -> ApiResult<Items<Project>> {
        pending!(52, self.db, query)
    }

    /// New projects go to the top of their column.
    pub async fn create(&self, input: CreateProjectBody) -> ApiResult<Project> {
        pending!(52, self.db, input)
    }

    /// Any project that isn't deleted, archived ones included.
    pub async fn get(&self, id: &str) -> ApiResult<Project> {
        pending!(52, self.db, id)
    }

    /// Status changes, newest first.
    pub async fn history(&self, id: &str) -> ApiResult<Items<ProjectStatusChange>> {
        pending!(52, self.db, id)
    }

    /// A status change moves the project to the top of its new column.
    pub async fn update(&self, id: &str, input: UpdateProjectBody) -> ApiResult<Project> {
        pending!(52, self.db, id, input)
    }

    /// `move`: drops the project at `order` in the `status` column, keeping both columns gapless.
    pub async fn r#move(&self, id: &str, input: MoveProjectBody) -> ApiResult<Items<Project>> {
        pending!(52, self.db, id, input)
    }

    /// `400 project_not_done` unless it is Done.
    pub async fn archive(&self, id: &str) -> ApiResult<Project> {
        pending!(52, self.db, id)
    }

    /// Undoes a delete, or brings an archived project back to the top of Done.
    pub async fn restore(&self, id: &str) -> ApiResult<Project> {
        pending!(52, self.db, id)
    }

    /// Soft delete.
    pub async fn remove(&self, id: &str) -> ApiResult<()> {
        pending!(52, self.db, id)
    }
}

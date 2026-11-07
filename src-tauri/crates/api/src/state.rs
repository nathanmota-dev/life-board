use std::path::PathBuf;
use std::sync::Arc;

use crate::db::Db;
use crate::error::ApiResult;
use crate::plugins::auth::Authenticator;
use crate::services::calendar::CalendarService;
use crate::services::crypto::CryptoService;
use crate::services::file_boards::FileBoardsService;
use crate::services::file_storage::{Disk, FileStorageService};
use crate::services::files_settings::FilesSettingsService;
use crate::services::github::{GithubService, SyncLogger};
use crate::services::github_client::GithubApi;
use crate::services::goals::GoalsService;
use crate::services::habits::HabitsService;
use crate::services::links::LinksService;
use crate::services::mood::MoodService;
use crate::services::projects::ProjectsService;
use crate::services::stats::StatsService;
use crate::services::tasks::TasksService;
use crate::services::thoughts::ThoughtsService;

/// `AppOptions`: what `buildApp` receives. `None` picks the production default.
pub struct AppOptions {
    pub db: Db,
    /// Uploads default to `<data_dir>/uploads`.
    pub data_dir: PathBuf,
    pub crypto: CryptoService,
    /// Default: `GithubClient::new()`.
    pub github_client: Option<Arc<dyn GithubApi>>,
    /// Default: `AllowAll`.
    pub authenticator: Option<Arc<dyn Authenticator>>,
    /// Default: `RealDisk`.
    pub disk: Option<Arc<dyn Disk>>,
    /// Default: `TracingLogger`.
    pub logger: Option<Arc<dyn SyncLogger>>,
}

impl AppOptions {
    pub fn new(db: Db, data_dir: impl Into<PathBuf>, crypto: CryptoService) -> Self {
        Self {
            db,
            data_dir: data_dir.into(),
            crypto,
            github_client: None,
            authenticator: None,
            disk: None,
            logger: None,
        }
    }
}

/// Everything the handlers share (`app.services` and the decorations of `buildApp`).
#[derive(Clone)]
pub struct AppState {
    pub db: Db,
    pub crypto: CryptoService,
    /// Shared with `file_boards` and `files_settings`, so a folder change applies to the next upload.
    pub storage: FileStorageService,
    pub authenticator: Arc<dyn Authenticator>,
    pub tasks: TasksService,
    pub thoughts: ThoughtsService,
    pub links: LinksService,
    pub goals: GoalsService,
    pub calendar: CalendarService,
    pub mood: MoodService,
    pub habits: HabitsService,
    pub projects: ProjectsService,
    pub stats: StatsService,
    pub github: GithubService,
    pub file_boards: FileBoardsService,
    pub files_settings: FilesSettingsService,
}

impl AppState {
    /// Builds the services, then runs `files_settings.load()` and `file_boards.purge_deleted()`.
    pub async fn new(options: AppOptions) -> ApiResult<Self> {
        pending!(
            51,
            options.db,
            options.data_dir,
            options.crypto,
            options.github_client,
            options.authenticator,
            options.disk,
            options.logger
        )
    }
}

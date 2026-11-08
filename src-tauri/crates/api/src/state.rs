use std::path::PathBuf;
use std::sync::Arc;

use crate::db::Db;
use crate::error::ApiResult;
use crate::plugins::auth::{AllowAll, Authenticator};
use crate::services::calendar::CalendarService;
use crate::services::crypto::CryptoService;
use crate::services::file_boards::FileBoardsService;
use crate::services::file_storage::{Disk, FileStorageService, RealDisk};
use crate::services::files_settings::FilesSettingsService;
use crate::services::github::{GithubService, SyncLogger, TracingLogger};
use crate::services::github_client::{GithubApi, GithubClient};
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
        let AppOptions { db, data_dir, crypto, github_client, authenticator, disk, logger } = options;
        let disk = disk.unwrap_or_else(|| Arc::new(RealDisk));
        let storage = FileStorageService::with_disk(data_dir.join("uploads"), disk);
        let github = GithubService::new(
            db.clone(),
            github_client.unwrap_or_else(|| Arc::new(GithubClient::new())),
            crypto.clone(),
            logger.unwrap_or_else(|| Arc::new(TracingLogger)),
        );
        let state = Self {
            tasks: TasksService::new(db.clone()),
            thoughts: ThoughtsService::new(db.clone()),
            links: LinksService::new(db.clone()),
            goals: GoalsService::new(db.clone()),
            calendar: CalendarService::new(db.clone()),
            mood: MoodService::new(db.clone()),
            habits: HabitsService::new(db.clone()),
            projects: ProjectsService::new(db.clone()),
            stats: StatsService::new(db.clone()),
            github,
            file_boards: FileBoardsService::new(db.clone(), storage.clone()),
            files_settings: FilesSettingsService::new(db.clone(), storage.clone(), storage.root()),
            authenticator: authenticator.unwrap_or_else(|| Arc::new(AllowAll)),
            storage,
            crypto,
            db,
        };
        state.files_settings.load().await?;
        state.file_boards.purge_deleted().await?;
        Ok(state)
    }
}

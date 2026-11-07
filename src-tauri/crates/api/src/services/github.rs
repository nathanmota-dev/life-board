use std::sync::Arc;

use serde::Serialize;

use crate::db::Db;
use crate::db::columns::{Timestamp, js_date_opt};
use crate::db::schema::github::{GithubIssue, GithubPr};
use crate::dto::github::{ConnectGithubBody, ListIssuesQuery, ListPrsQuery, RecentReposQuery};
use crate::error::ApiResult;
use crate::services::crypto::CryptoService;
use crate::services::github_client::{GithubApi, RepoRef};

pub const SETTINGS_ID: &str = "default";
pub const MAX_SYNCED_PRS: usize = 60;
pub const MAX_SYNCED_ISSUES: usize = 60;

/// Where sync warnings go (`app.log` in Node). [`TracingLogger`] writes them to stderr.
pub trait SyncLogger: Send + Sync + 'static {
    fn warn(&self, message: &str);
}

#[derive(Debug, Clone, Copy, Default)]
pub struct TracingLogger;

impl SyncLogger for TracingLogger {
    fn warn(&self, message: &str) {
        tracing::warn!("{message}");
    }
}

/// `GET /github/status`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubStatus {
    pub connected: bool,
    pub login: Option<String>,
    #[serde(with = "js_date_opt")]
    pub last_sync_at: Option<Timestamp>,
    pub last_sync_error: Option<String>,
}

/// `POST /github/connect`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct GithubConnected {
    pub connected: bool,
    pub login: String,
}

/// `POST /github/sync`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SyncResult {
    pub ok: bool,
    pub count: i64,
    pub issues: i64,
    pub login: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ContributionDay {
    pub date: String,
    pub count: i64,
    /// 0–4, from GitHub's quartile names.
    pub level: i64,
}

/// `GET /github/contributions`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Contributions {
    pub login: String,
    pub total: i64,
    pub days: Vec<ContributionDay>,
}

/// One item of `GET /github/repos/recent`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecentRepo {
    pub full_name: String,
    pub url: String,
    pub description: Option<String>,
    pub private: bool,
    pub last_contributed_at: String,
    pub stars: i64,
    pub language: Option<String>,
    pub language_color: Option<String>,
}

/// `repoFromUrl`: `{ owner, name }` from an API repo URL.
pub fn repo_from_url(url: &str) -> Option<RepoRef> {
    pending!(53, url)
}

#[derive(Clone)]
pub struct GithubService {
    db: Db,
    client: Arc<dyn GithubApi>,
    crypto: CryptoService,
    logger: Arc<dyn SyncLogger>,
}

impl GithubService {
    pub fn new(db: Db, client: Arc<dyn GithubApi>, crypto: CryptoService, logger: Arc<dyn SyncLogger>) -> Self {
        Self { db, client, crypto, logger }
    }

    /// Also read by the `startServer` tests (#51).
    pub async fn status(&self) -> ApiResult<GithubStatus> {
        pending!(51, self.db)
    }

    /// Checks the token with GitHub (`400 invalid_token`), then stores it sealed.
    pub async fn connect(&self, input: ConnectGithubBody) -> ApiResult<GithubConnected> {
        pending!(53, self.db, self.client, self.crypto, input)
    }

    /// Deletes the settings row and the cached PRs and issues.
    pub async fn disconnect(&self) -> ApiResult<()> {
        pending!(53, self.db)
    }

    /// `400 not_connected`; `502 sync_failed` after recording `lastSyncError`.
    pub async fn sync(&self) -> ApiResult<SyncResult> {
        pending!(53, self.db, self.client, self.crypto, self.logger)
    }

    /// `400 not_connected`; `502 github_unavailable`.
    pub async fn contributions(&self) -> ApiResult<Contributions> {
        pending!(53, self.db, self.client, self.crypto)
    }

    /// `400 not_connected`; `502 github_unavailable`.
    pub async fn recent_repos(&self, query: RecentReposQuery) -> ApiResult<Vec<RecentRepo>> {
        pending!(53, self.db, self.client, self.crypto, query)
    }

    /// Most recently updated first.
    pub async fn list_prs(&self, query: ListPrsQuery) -> ApiResult<Vec<GithubPr>> {
        pending!(53, self.db, query)
    }

    /// Most recently updated first.
    pub async fn list_issues(&self, query: ListIssuesQuery) -> ApiResult<Vec<GithubIssue>> {
        pending!(53, self.db, query)
    }
}

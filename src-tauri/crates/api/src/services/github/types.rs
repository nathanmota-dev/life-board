use crate::db::columns::{Timestamp, js_date_opt};
use serde::Serialize;

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

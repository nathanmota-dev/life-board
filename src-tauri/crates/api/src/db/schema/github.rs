use serde::Serialize;

use crate::db::columns::{Timestamp, js_date, js_date_opt, string_enum};
use crate::db::{Db, DbError};

string_enum! {
    /// `GITHUB_KINDS`.
    pub enum GithubKind {
        Authored = "authored",
        ReviewRequested = "review_requested",
        Mentioned = "mentioned",
        Assigned = "assigned",
        InMyRepos = "in_my_repos",
    }
}

string_enum! {
    /// `GITHUB_ISSUE_KINDS`: issues have no review requests.
    pub enum GithubIssueKind { Authored = "authored", Mentioned = "mentioned", Assigned = "assigned", InMyRepos = "in_my_repos" }
}

/// Single row (id = "default"). The PAT is stored encrypted with AES-256-GCM.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubSettings {
    pub id: String,
    pub token_ciphertext: String,
    pub token_iv: String,
    pub token_tag: String,
    pub login: String,
    pub org_filter: Option<String>,
    #[serde(with = "js_date_opt")]
    pub last_sync_at: Option<Timestamp>,
    pub last_sync_error: Option<String>,
    #[serde(with = "js_date")]
    pub created_at: Timestamp,
    #[serde(with = "js_date")]
    pub updated_at: Timestamp,
}

/// Id is `${owner}/${repo}#${number}`, so re-syncs upsert the same row.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubPr {
    pub id: String,
    pub number: i64,
    pub title: String,
    pub state: String,
    pub draft: bool,
    pub repo_owner: String,
    pub repo_name: String,
    pub author_login: String,
    pub author_avatar_url: Option<String>,
    pub url: String,
    pub base_branch: Option<String>,
    pub head_branch: Option<String>,
    pub kind: GithubKind,
    pub triggered_by_login: Option<String>,
    pub additions: i64,
    pub deletions: i64,
    pub changed_files: i64,
    #[serde(with = "js_date")]
    pub created_at: Timestamp,
    #[serde(with = "js_date")]
    pub updated_at: Timestamp,
    #[serde(with = "js_date")]
    pub synced_at: Timestamp,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubIssue {
    pub id: String,
    pub number: i64,
    pub title: String,
    pub state: String,
    pub repo_owner: String,
    pub repo_name: String,
    pub author_login: String,
    pub author_avatar_url: Option<String>,
    pub url: String,
    pub kind: GithubIssueKind,
    pub labels: Vec<String>,
    pub comments: i64,
    #[serde(with = "js_date")]
    pub created_at: Timestamp,
    #[serde(with = "js_date")]
    pub updated_at: Timestamp,
    #[serde(with = "js_date")]
    pub synced_at: Timestamp,
}

#[derive(Debug, Clone, Default)]
pub struct NewGithubSettings {
    pub id: String,
    pub token_ciphertext: String,
    pub token_iv: String,
    pub token_tag: String,
    pub login: String,
    pub org_filter: Option<String>,
    pub last_sync_at: Option<Timestamp>,
    pub last_sync_error: Option<String>,
    pub created_at: Option<Timestamp>,
    pub updated_at: Option<Timestamp>,
}

/// `NewGithubPr`. Defaults: `draft` false, diff stats 0, `synced_at` now.
#[derive(Debug, Clone, Default)]
pub struct NewGithubPr {
    pub id: String,
    pub number: i64,
    pub title: String,
    pub state: String,
    pub draft: Option<bool>,
    pub repo_owner: String,
    pub repo_name: String,
    pub author_login: String,
    pub author_avatar_url: Option<String>,
    pub url: String,
    pub base_branch: Option<String>,
    pub head_branch: Option<String>,
    pub kind: GithubKind,
    pub triggered_by_login: Option<String>,
    pub additions: Option<i64>,
    pub deletions: Option<i64>,
    pub changed_files: Option<i64>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    pub synced_at: Option<Timestamp>,
}

/// `NewGithubIssue`. Defaults: no labels, 0 comments, `synced_at` now.
#[derive(Debug, Clone, Default)]
pub struct NewGithubIssue {
    pub id: String,
    pub number: i64,
    pub title: String,
    pub state: String,
    pub repo_owner: String,
    pub repo_name: String,
    pub author_login: String,
    pub author_avatar_url: Option<String>,
    pub url: String,
    pub kind: GithubIssueKind,
    pub labels: Option<Vec<String>>,
    pub comments: Option<i64>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
    pub synced_at: Option<Timestamp>,
}

impl GithubSettings {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        pending!(53, row)
    }
}

impl GithubPr {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        pending!(53, row)
    }
}

impl GithubIssue {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        pending!(53, row)
    }
}

/// Also used by `startServer` tests and `resetSecrets` (#51).
pub async fn insert_settings(db: &Db, rows: Vec<NewGithubSettings>) -> Result<(), DbError> {
    db.call(move |conn| {
        let tx = conn.transaction()?;
        let now = chrono::Utc::now();
        for row in rows {
            tx.execute(
                "INSERT INTO github_settings (id, token_ciphertext, token_iv, token_tag, login, org_filter, last_sync_at, last_sync_error, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                rusqlite::params![
                    row.id,
                    row.token_ciphertext,
                    row.token_iv,
                    row.token_tag,
                    row.login,
                    row.org_filter,
                    row.last_sync_at.map(crate::db::columns::to_millis),
                    row.last_sync_error,
                    crate::db::columns::to_millis(row.created_at.unwrap_or(now)),
                    crate::db::columns::to_millis(row.updated_at.unwrap_or(now)),
                ],
            )?;
        }
        tx.commit()
    })
    .await
}

pub async fn insert_prs(db: &Db, rows: Vec<NewGithubPr>) -> Result<(), DbError> {
    pending!(53, db, rows)
}

pub async fn insert_issues(db: &Db, rows: Vec<NewGithubIssue>) -> Result<(), DbError> {
    pending!(53, db, rows)
}

use chrono::Utc;
use rusqlite::params;
use serde::Serialize;

use crate::db::columns::{
    Timestamp, get_bool, get_json_list, get_timestamp, get_timestamp_opt, js_date, js_date_opt, string_enum, to_bool,
    to_json_list, to_millis,
};
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
        Ok(Self {
            id: row.get("id")?,
            token_ciphertext: row.get("token_ciphertext")?,
            token_iv: row.get("token_iv")?,
            token_tag: row.get("token_tag")?,
            login: row.get("login")?,
            org_filter: row.get("org_filter")?,
            last_sync_at: get_timestamp_opt(row, "last_sync_at")?,
            last_sync_error: row.get("last_sync_error")?,
            created_at: get_timestamp(row, "created_at")?,
            updated_at: get_timestamp(row, "updated_at")?,
        })
    }
}

impl GithubPr {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            number: row.get("number")?,
            title: row.get("title")?,
            state: row.get("state")?,
            draft: get_bool(row, "draft")?,
            repo_owner: row.get("repo_owner")?,
            repo_name: row.get("repo_name")?,
            author_login: row.get("author_login")?,
            author_avatar_url: row.get("author_avatar_url")?,
            url: row.get("url")?,
            base_branch: row.get("base_branch")?,
            head_branch: row.get("head_branch")?,
            kind: row.get("kind")?,
            triggered_by_login: row.get("triggered_by_login")?,
            additions: row.get("additions")?,
            deletions: row.get("deletions")?,
            changed_files: row.get("changed_files")?,
            created_at: get_timestamp(row, "created_at")?,
            updated_at: get_timestamp(row, "updated_at")?,
            synced_at: get_timestamp(row, "synced_at")?,
        })
    }
}

impl GithubIssue {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        Ok(Self {
            id: row.get("id")?,
            number: row.get("number")?,
            title: row.get("title")?,
            state: row.get("state")?,
            repo_owner: row.get("repo_owner")?,
            repo_name: row.get("repo_name")?,
            author_login: row.get("author_login")?,
            author_avatar_url: row.get("author_avatar_url")?,
            url: row.get("url")?,
            kind: row.get("kind")?,
            labels: get_json_list(row, "labels")?,
            comments: row.get("comments")?,
            created_at: get_timestamp(row, "created_at")?,
            updated_at: get_timestamp(row, "updated_at")?,
            synced_at: get_timestamp(row, "synced_at")?,
        })
    }
}

/// Every column but `id`, so a re-sync replaces the row (`onConflictDoUpdate`).
const UPSERT_PR: &str = "ON CONFLICT(id) DO UPDATE SET number = excluded.number, title = excluded.title, state = excluded.state, draft = excluded.draft, repo_owner = excluded.repo_owner, repo_name = excluded.repo_name, author_login = excluded.author_login, author_avatar_url = excluded.author_avatar_url, url = excluded.url, base_branch = excluded.base_branch, head_branch = excluded.head_branch, kind = excluded.kind, triggered_by_login = excluded.triggered_by_login, additions = excluded.additions, deletions = excluded.deletions, changed_files = excluded.changed_files, created_at = excluded.created_at, updated_at = excluded.updated_at, synced_at = excluded.synced_at";

const UPSERT_ISSUE: &str = "ON CONFLICT(id) DO UPDATE SET number = excluded.number, title = excluded.title, state = excluded.state, repo_owner = excluded.repo_owner, repo_name = excluded.repo_name, author_login = excluded.author_login, author_avatar_url = excluded.author_avatar_url, url = excluded.url, kind = excluded.kind, labels = excluded.labels, comments = excluded.comments, created_at = excluded.created_at, updated_at = excluded.updated_at, synced_at = excluded.synced_at";

fn write_pr(conn: &rusqlite::Connection, row: NewGithubPr, on_conflict: &str) -> rusqlite::Result<()> {
    conn.execute(
        &format!(
            "INSERT INTO github_prs (id, number, title, state, draft, repo_owner, repo_name, author_login, author_avatar_url, url, base_branch, head_branch, kind, triggered_by_login, additions, deletions, changed_files, created_at, updated_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) {on_conflict}"
        ),
        params![
            row.id,
            row.number,
            row.title,
            row.state,
            to_bool(row.draft.unwrap_or(false)),
            row.repo_owner,
            row.repo_name,
            row.author_login,
            row.author_avatar_url,
            row.url,
            row.base_branch,
            row.head_branch,
            row.kind,
            row.triggered_by_login,
            row.additions.unwrap_or(0),
            row.deletions.unwrap_or(0),
            row.changed_files.unwrap_or(0),
            to_millis(row.created_at),
            to_millis(row.updated_at),
            to_millis(row.synced_at.unwrap_or_else(Utc::now)),
        ],
    )?;
    Ok(())
}

fn write_issue(conn: &rusqlite::Connection, row: NewGithubIssue, on_conflict: &str) -> rusqlite::Result<()> {
    conn.execute(
        &format!(
            "INSERT INTO github_issues (id, number, title, state, repo_owner, repo_name, author_login, author_avatar_url, url, kind, labels, comments, created_at, updated_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) {on_conflict}"
        ),
        params![
            row.id,
            row.number,
            row.title,
            row.state,
            row.repo_owner,
            row.repo_name,
            row.author_login,
            row.author_avatar_url,
            row.url,
            row.kind,
            to_json_list(&row.labels.unwrap_or_default()),
            row.comments.unwrap_or(0),
            to_millis(row.created_at),
            to_millis(row.updated_at),
            to_millis(row.synced_at.unwrap_or_else(Utc::now)),
        ],
    )?;
    Ok(())
}

/// Inserts the PR, or replaces the row with its id.
pub fn upsert_pr(conn: &rusqlite::Connection, row: NewGithubPr) -> rusqlite::Result<()> {
    write_pr(conn, row, UPSERT_PR)
}

/// Inserts the issue, or replaces the row with its id.
pub fn upsert_issue(conn: &rusqlite::Connection, row: NewGithubIssue) -> rusqlite::Result<()> {
    write_issue(conn, row, UPSERT_ISSUE)
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
    db.call(move |conn| {
        let tx = conn.transaction()?;
        for row in rows {
            write_pr(&tx, row, "")?;
        }
        tx.commit()
    })
    .await
}

pub async fn insert_issues(db: &Db, rows: Vec<NewGithubIssue>) -> Result<(), DbError> {
    db.call(move |conn| {
        let tx = conn.transaction()?;
        for row in rows {
            write_issue(&tx, row, "")?;
        }
        tx.commit()
    })
    .await
}

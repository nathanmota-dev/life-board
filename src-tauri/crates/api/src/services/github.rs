use std::sync::Arc;

use axum::http::StatusCode;
use chrono::Utc;
use rusqlite::OptionalExtension;
use rusqlite::types::Value;
use serde::Serialize;

use crate::db::Db;
use crate::db::columns::{Timestamp, js_date_opt, to_millis};
use crate::db::schema::github::{
    GithubIssue, GithubIssueKind, GithubKind, GithubPr, GithubSettings, NewGithubIssue, NewGithubPr, upsert_issue,
    upsert_pr,
};
use crate::dto::github::{ConnectGithubBody, ListIssuesQuery, ListPrsQuery, RecentReposQuery};
use crate::error::{ApiError, ApiResult};
use crate::services::crypto::{CryptoError, CryptoService, SealedSecret};
use crate::services::github_client::{CONTRIBUTION_LEVELS, GithubApi, GithubUser, RawPull, RawSearchItem, RepoRef};
use crate::services::query::{enum_opt, placeholders, query_all};

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

/// What fails a sync: its text becomes `lastSyncError`.
type SyncError = Box<dyn std::error::Error + Send + Sync>;

const SEARCHES: [(GithubKind, &str); 4] = [
    (GithubKind::Authored, "author"),
    (GithubKind::ReviewRequested, "review-requested"),
    (GithubKind::Mentioned, "mentions"),
    (GithubKind::Assigned, "assignee"),
];

// `user:` matches issues in repos the user owns, like the PRs' "in my repos".
const ISSUE_SEARCHES: [(GithubIssueKind, &str); 4] = [
    (GithubIssueKind::Authored, "author"),
    (GithubIssueKind::Mentioned, "mentions"),
    (GithubIssueKind::Assigned, "assignee"),
    (GithubIssueKind::InMyRepos, "user"),
];

/// When a PR matches several categories, keep the one most specific to the user.
fn priority(kind: GithubKind) -> u8 {
    match kind {
        GithubKind::Authored => 5,
        GithubKind::Assigned => 4,
        GithubKind::ReviewRequested => 3,
        GithubKind::Mentioned => 2,
        GithubKind::InMyRepos => 1,
    }
}

fn issue_priority(kind: GithubIssueKind) -> u8 {
    match kind {
        GithubIssueKind::Authored => 5,
        GithubIssueKind::Assigned => 4,
        GithubIssueKind::Mentioned => 2,
        GithubIssueKind::InMyRepos => 1,
    }
}

/// A PR as a search hit or a pull payload. `pull` is set for the latter, the
/// one that carries branches and diff stats.
struct Hit {
    number: i64,
    title: String,
    state: String,
    draft: bool,
    user: Option<GithubUser>,
    html_url: String,
    created_at: String,
    updated_at: String,
    search_merged_at: Option<String>,
    pull: Option<RawPull>,
}

impl From<RawSearchItem> for Hit {
    fn from(item: RawSearchItem) -> Self {
        Self {
            number: item.number,
            title: item.title,
            state: item.state,
            draft: item.draft.unwrap_or(false),
            user: item.user,
            html_url: item.html_url,
            created_at: item.created_at,
            updated_at: item.updated_at,
            search_merged_at: item.pull_request.and_then(|pull| pull.merged_at),
            pull: None,
        }
    }
}

impl From<RawPull> for Hit {
    fn from(pull: RawPull) -> Self {
        Self {
            number: pull.number,
            title: pull.title.clone(),
            state: pull.state.clone(),
            draft: pull.draft,
            user: pull.user.clone(),
            html_url: pull.html_url.clone(),
            created_at: pull.created_at.clone(),
            updated_at: pull.updated_at.clone(),
            search_merged_at: None,
            pull: Some(pull),
        }
    }
}

struct Bucket {
    id: String,
    kind: GithubKind,
    triggered_by_login: Option<String>,
    hit: Hit,
    repo: RepoRef,
}

struct IssueBucket {
    id: String,
    kind: GithubIssueKind,
    item: RawSearchItem,
    repo: RepoRef,
}

fn row_id(repo: &RepoRef, number: i64) -> String {
    format!("{}/{}#{number}", repo.owner, repo.name)
}

fn in_org(repo: &RepoRef, org_filter: Option<&str>) -> bool {
    org_filter.is_none_or(|org| org.is_empty() || repo.owner.to_lowercase() == org.to_lowercase())
}

/// Adds a PR, keeping its first position when it was already there.
fn add_to_buckets(buckets: &mut Vec<Bucket>, incoming: Bucket) {
    let Some(existing) = buckets.iter_mut().find(|bucket| bucket.id == incoming.id) else {
        buckets.push(incoming);
        return;
    };
    let Bucket { kind, triggered_by_login, hit, repo, .. } = incoming;
    if priority(kind) > priority(existing.kind) {
        existing.kind = kind;
        existing.triggered_by_login = triggered_by_login;
        existing.repo = repo;
    }
    // Prefer the full pull payload over a search hit: it carries merged_at and diff stats.
    if hit.pull.is_some() {
        existing.hit = hit;
    }
}

fn parse_date(text: &str) -> Result<Timestamp, SyncError> {
    Ok(chrono::DateTime::parse_from_rfc3339(text).map_err(|_| format!("Invalid date: {text:?}"))?.to_utc())
}

/// Newest first; a date that can't be parsed fails later, when its row is built.
fn newest_first<T>(rows: &mut [T], updated_at: impl Fn(&T) -> &str) {
    rows.sort_by_cached_key(|row| std::cmp::Reverse(parse_date(updated_at(row)).map_or(0, to_millis)));
}

fn to_i64(value: usize) -> i64 {
    i64::try_from(value).unwrap_or(i64::MAX)
}

fn delete_other_rows(conn: &rusqlite::Connection, table: &str, ids: &[String]) -> rusqlite::Result<()> {
    conn.execute(
        &format!("DELETE FROM {table} WHERE id NOT IN ({})", placeholders(ids.len())),
        rusqlite::params_from_iter(ids),
    )?;
    Ok(())
}

fn to_issue_row(bucket: IssueBucket) -> Result<NewGithubIssue, SyncError> {
    let IssueBucket { id, kind, item, repo } = bucket;
    let (author_login, author_avatar_url) = author(item.user);
    Ok(NewGithubIssue {
        id,
        number: item.number,
        title: item.title,
        state: item.state,
        repo_owner: repo.owner,
        repo_name: repo.name,
        author_login,
        author_avatar_url,
        url: item.html_url,
        kind,
        labels: Some(item.labels.unwrap_or_default().into_iter().map(|label| label.name).collect()),
        comments: Some(item.comments.unwrap_or(0)),
        created_at: parse_date(&item.created_at)?,
        updated_at: parse_date(&item.updated_at)?,
        synced_at: None,
    })
}

fn author(user: Option<GithubUser>) -> (String, Option<String>) {
    user.map_or_else(|| (String::new(), None), |user| (user.login, user.avatar_url))
}

/// `repoFromUrl`: `{ owner, name }` from an API repo URL.
pub fn repo_from_url(url: &str) -> Option<RepoRef> {
    const MARKER: &str = "/repos/";
    url.match_indices(MARKER).find_map(|(index, _)| {
        let mut segments = url[index + MARKER.len()..].splitn(3, '/');
        let owner = segments.next().filter(|owner| !owner.is_empty())?;
        let name = segments.next().filter(|name| !name.is_empty())?;
        Some(RepoRef { owner: owner.to_owned(), name: name.to_owned() })
    })
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
        Ok(match self.find_settings().await? {
            Some(settings) => GithubStatus {
                connected: true,
                login: Some(settings.login),
                last_sync_at: settings.last_sync_at,
                last_sync_error: settings.last_sync_error,
            },
            None => GithubStatus { connected: false, login: None, last_sync_at: None, last_sync_error: None },
        })
    }

    /// Checks the token with GitHub (`400 invalid_token`), then stores it sealed.
    pub async fn connect(&self, input: ConnectGithubBody) -> ApiResult<GithubConnected> {
        let ConnectGithubBody { token, org_filter } = input;
        // Check the token before storing it, so a typo fails fast.
        let login = self
            .client
            .get_login(&token)
            .await
            .map_err(|error| ApiError::bad_request("invalid_token", error.message))?;
        let sealed = self.crypto.seal(&token).map_err(ApiError::internal)?;

        let stored_login = login.clone();
        self.db
            .call(move |conn| {
                let now = to_millis(Utc::now());
                conn.execute(
                    "INSERT INTO github_settings (id, login, org_filter, token_ciphertext, token_iv, token_tag, last_sync_error, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?7) ON CONFLICT(id) DO UPDATE SET login = excluded.login, org_filter = excluded.org_filter, token_ciphertext = excluded.token_ciphertext, token_iv = excluded.token_iv, token_tag = excluded.token_tag, last_sync_error = NULL, updated_at = excluded.updated_at",
                    rusqlite::params![
                        SETTINGS_ID,
                        stored_login,
                        org_filter.flatten(),
                        sealed.ciphertext,
                        sealed.iv,
                        sealed.tag,
                        now
                    ],
                )
            })
            .await?;
        Ok(GithubConnected { connected: true, login })
    }

    /// Deletes the settings row and the cached PRs and issues.
    pub async fn disconnect(&self) -> ApiResult<()> {
        self.db
            .call(|conn| {
                let tx = conn.transaction()?;
                tx.execute("DELETE FROM github_settings", [])?;
                tx.execute("DELETE FROM github_prs", [])?;
                tx.execute("DELETE FROM github_issues", [])?;
                tx.commit()
            })
            .await?;
        Ok(())
    }

    /// `400 not_connected`; `502 sync_failed` after recording `lastSyncError`.
    pub async fn sync(&self) -> ApiResult<SyncResult> {
        let settings = self.require_settings().await?;
        match self.run_sync(&settings).await {
            Ok((count, issues)) => Ok(SyncResult { ok: true, count, issues, login: settings.login }),
            Err(error) => {
                // Keep the reason so the UI can show why the last sync failed.
                let message = error.to_string();
                let recorded = message.clone();
                self.db
                    .call(move |conn| {
                        conn.execute(
                            "UPDATE github_settings SET last_sync_error = ?, updated_at = ? WHERE id = ?",
                            rusqlite::params![recorded, to_millis(Utc::now()), SETTINGS_ID],
                        )
                    })
                    .await?;
                Err(ApiError::http(StatusCode::BAD_GATEWAY, "sync_failed", message))
            }
        }
    }

    /// `400 not_connected`; `502 github_unavailable`.
    pub async fn contributions(&self) -> ApiResult<Contributions> {
        let settings = self.require_settings().await?;
        let token = self.open_token(&settings).map_err(unavailable)?;
        let calendar = self.client.get_contributions(&token, &settings.login).await.map_err(unavailable)?;
        let days = calendar
            .weeks
            .into_iter()
            .flat_map(|week| week.contribution_days)
            .map(|day| ContributionDay {
                level: CONTRIBUTION_LEVELS.iter().position(|level| *level == day.contribution_level).map_or(0, to_i64),
                date: day.date,
                count: day.contribution_count,
            })
            .collect();
        Ok(Contributions { login: settings.login, total: calendar.total_contributions, days })
    }

    /// `400 not_connected`; `502 github_unavailable`.
    pub async fn recent_repos(&self, query: RecentReposQuery) -> ApiResult<Vec<RecentRepo>> {
        let settings = self.require_settings().await?;
        let token = self.open_token(&settings).map_err(unavailable)?;
        let first = usize::try_from(query.limit).unwrap_or(0);
        let repos = self.client.get_contributed_repos(&token, &settings.login, first).await.map_err(unavailable)?;
        Ok(repos
            .into_iter()
            .map(|entry| {
                let repo = entry.repository;
                let (language, language_color) =
                    repo.primary_language.map_or((None, None), |language| (Some(language.name), language.color));
                RecentRepo {
                    full_name: repo.name_with_owner,
                    url: repo.url,
                    description: repo.description,
                    private: repo.is_private,
                    last_contributed_at: entry.last_contributed_at,
                    stars: repo.stargazer_count,
                    language,
                    language_color,
                }
            })
            .collect())
    }

    /// Most recently updated first.
    pub async fn list_prs(&self, query: ListPrsQuery) -> ApiResult<Vec<GithubPr>> {
        self.list_rows("github_prs", enum_opt(query.kind), query.limit, GithubPr::from_row).await
    }

    /// Most recently updated first.
    pub async fn list_issues(&self, query: ListIssuesQuery) -> ApiResult<Vec<GithubIssue>> {
        self.list_rows("github_issues", enum_opt(query.kind), query.limit, GithubIssue::from_row).await
    }

    async fn list_rows<T: Send + 'static>(
        &self,
        table: &'static str,
        kind: Value,
        limit: i64,
        map: fn(&rusqlite::Row<'_>) -> rusqlite::Result<T>,
    ) -> ApiResult<Vec<T>> {
        let sql =
            format!("SELECT * FROM {table} WHERE (?1 IS NULL OR kind = ?1) ORDER BY updated_at DESC, id ASC LIMIT ?2");
        Ok(self.db.call(move |conn| query_all(conn, &sql, &[kind, Value::Integer(limit)], map)).await?)
    }

    fn open_token(&self, settings: &GithubSettings) -> Result<String, CryptoError> {
        self.crypto.open(&SealedSecret {
            ciphertext: settings.token_ciphertext.clone(),
            iv: settings.token_iv.clone(),
            tag: settings.token_tag.clone(),
        })
    }

    async fn find_settings(&self) -> ApiResult<Option<GithubSettings>> {
        Ok(self
            .db
            .call(|conn| {
                conn.query_row("SELECT * FROM github_settings WHERE id = ?", [SETTINGS_ID], GithubSettings::from_row)
                    .optional()
            })
            .await?)
    }

    async fn require_settings(&self) -> ApiResult<GithubSettings> {
        self.find_settings().await?.ok_or_else(|| ApiError::bad_request("not_connected", "GitHub is not connected."))
    }

    /// The fallible part of a sync: `(PRs stored, issues stored)`.
    async fn run_sync(&self, settings: &GithubSettings) -> Result<(i64, i64), SyncError> {
        let token = self.open_token(settings)?;
        let org_filter = settings.org_filter.as_deref();
        let buckets = self.collect_pulls(&token, &settings.login, org_filter).await?;
        let count = self.store(&token, buckets).await?;
        let issues = self.sync_issues(&token, &settings.login, org_filter).await?;
        self.db
            .call(|conn| {
                let now = to_millis(Utc::now());
                conn.execute(
                    "UPDATE github_settings SET last_sync_at = ?1, last_sync_error = NULL, updated_at = ?1 WHERE id = ?2",
                    rusqlite::params![now, SETTINGS_ID],
                )
            })
            .await?;
        Ok((count, issues))
    }

    /// Union of open PRs that involve the user, one per `owner/repo#number`.
    async fn collect_pulls(
        &self,
        token: &str,
        login: &str,
        org_filter: Option<&str>,
    ) -> Result<Vec<Bucket>, SyncError> {
        let mut buckets = Vec::new();

        for (kind, qualifier) in SEARCHES {
            let query = format!("is:pr {qualifier}:{login} is:open sort:updated-desc");
            match self.client.search_issues(token, &query).await {
                Ok(items) => {
                    for item in items {
                        let Some(repo) = repo_from_url(&item.repository_url) else { continue };
                        let triggered_by_login = item.user.as_ref().map(|user| user.login.clone());
                        let id = row_id(&repo, item.number);
                        add_to_buckets(&mut buckets, Bucket { id, kind, triggered_by_login, hit: item.into(), repo });
                    }
                }
                // One failing category (bad query, secondary rate limit) shouldn't stop the sync.
                Err(error) => self.logger.warn(&format!("[github] search failed ({kind}): {error}")),
            }
        }

        // Open PRs in the 50 repos the user pushed to most recently.
        for repo in self.client.list_owned_repos(token, login, 50).await? {
            match self.client.list_open_pulls(token, &repo).await {
                Ok(pulls) => {
                    for pull in pulls {
                        let bucket = Bucket {
                            id: row_id(&repo, pull.number),
                            kind: GithubKind::InMyRepos,
                            triggered_by_login: pull.user.as_ref().map(|user| user.login.clone()),
                            hit: pull.into(),
                            repo: repo.clone(),
                        };
                        add_to_buckets(&mut buckets, bucket);
                    }
                }
                Err(error) => self.logger.warn(&format!("[github] skipping {}/{}: {error}", repo.owner, repo.name)),
            }
        }

        buckets.retain(|bucket| in_org(&bucket.repo, org_filter));
        Ok(buckets)
    }

    /// Upserts the most recently updated PRs and drops cached ones that no longer match.
    async fn store(&self, token: &str, mut buckets: Vec<Bucket>) -> Result<i64, SyncError> {
        newest_first(&mut buckets, |bucket| &bucket.hit.updated_at);
        buckets.truncate(MAX_SYNCED_PRS);

        // An empty result almost always means a token or permission problem;
        // keep the last known cache instead of wiping it.
        if buckets.is_empty() {
            return Ok(0);
        }

        let mut rows = Vec::with_capacity(buckets.len());
        for bucket in buckets {
            rows.push(self.to_row(token, bucket).await?);
        }

        let count = to_i64(rows.len());
        self.db
            .call(move |conn| {
                let tx = conn.transaction()?;
                let ids: Vec<String> = rows.iter().map(|row| row.id.clone()).collect();
                delete_other_rows(&tx, "github_prs", &ids)?;
                for row in rows {
                    upsert_pr(&tx, row)?;
                }
                tx.commit()
            })
            .await?;
        Ok(count)
    }

    async fn to_row(&self, token: &str, bucket: Bucket) -> Result<NewGithubPr, SyncError> {
        let Bucket { id, kind, triggered_by_login, hit, repo } = bucket;
        let pull = match hit.pull {
            Some(pull) => Some(pull),
            // Search hits don't carry branches or diff stats; fetch the PR once.
            None => self.client.get_pull(token, &repo, hit.number).await.ok(),
        };
        let merged_at = pull.as_ref().map_or(hit.search_merged_at, |pull| pull.merged_at.clone());
        let (author_login, author_avatar_url) = author(hit.user);

        Ok(NewGithubPr {
            id,
            number: hit.number,
            title: hit.title,
            state: if merged_at.is_some() { "merged".to_owned() } else { hit.state },
            draft: Some(hit.draft),
            repo_owner: repo.owner,
            repo_name: repo.name,
            author_login,
            author_avatar_url,
            url: hit.html_url,
            base_branch: pull.as_ref().map(|pull| pull.base.name.clone()),
            head_branch: pull.as_ref().map(|pull| pull.head.name.clone()),
            kind,
            triggered_by_login,
            additions: Some(pull.as_ref().and_then(|pull| pull.additions).unwrap_or(0)),
            deletions: Some(pull.as_ref().and_then(|pull| pull.deletions).unwrap_or(0)),
            changed_files: Some(pull.as_ref().and_then(|pull| pull.changed_files).unwrap_or(0)),
            created_at: parse_date(&hit.created_at)?,
            updated_at: parse_date(&hit.updated_at)?,
            synced_at: None,
        })
    }

    /// Replaces the cached open issues that involve the user, unless every search failed.
    async fn sync_issues(&self, token: &str, login: &str, org_filter: Option<&str>) -> Result<i64, SyncError> {
        let mut buckets: Vec<IssueBucket> = Vec::new();
        let mut failures = 0;

        for (kind, qualifier) in ISSUE_SEARCHES {
            let query = format!("is:issue {qualifier}:{login} is:open sort:updated-desc");
            match self.client.search_issues(token, &query).await {
                Ok(items) => {
                    for item in items {
                        let Some(repo) = repo_from_url(&item.repository_url).filter(|repo| in_org(repo, org_filter))
                        else {
                            continue;
                        };
                        let incoming = IssueBucket { id: row_id(&repo, item.number), kind, item, repo };
                        match buckets.iter_mut().find(|bucket| bucket.id == incoming.id) {
                            None => buckets.push(incoming),
                            Some(existing) if issue_priority(kind) > issue_priority(existing.kind) => {
                                *existing = incoming;
                            }
                            Some(_) => {}
                        }
                    }
                }
                Err(error) => {
                    failures += 1;
                    self.logger.warn(&format!("[github] issue search failed ({kind}): {error}"));
                }
            }
        }
        // With no answer at all from GitHub, keep the last known cache.
        if failures == ISSUE_SEARCHES.len() {
            return Ok(0);
        }

        newest_first(&mut buckets, |bucket| &bucket.item.updated_at);
        buckets.truncate(MAX_SYNCED_ISSUES);
        let rows = buckets.into_iter().map(to_issue_row).collect::<Result<Vec<_>, _>>()?;

        let count = to_i64(rows.len());
        self.db
            .call(move |conn| {
                let tx = conn.transaction()?;
                let ids: Vec<String> = rows.iter().map(|row| row.id.clone()).collect();
                delete_other_rows(&tx, "github_issues", &ids)?;
                for row in rows {
                    upsert_issue(&tx, row)?;
                }
                tx.commit()
            })
            .await?;
        Ok(count)
    }
}

fn unavailable(error: impl std::fmt::Display) -> ApiError {
    ApiError::http(StatusCode::BAD_GATEWAY, "github_unavailable", error.to_string())
}

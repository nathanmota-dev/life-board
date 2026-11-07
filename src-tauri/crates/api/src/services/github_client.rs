//! Thin wrapper over the GitHub REST and GraphQL APIs; all HTTP lives here so it
//! can be replaced (a fake [`GithubApi`]) or pointed at `wiremock` (a base URL).

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

pub const GITHUB_API: &str = "https://api.github.com";

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct GithubUser {
    pub login: String,
    pub avatar_url: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct PullRequestRef {
    pub merged_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct Label {
    pub name: String,
}

/// `RawSearchItem`: one hit of `/search/issues`.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct RawSearchItem {
    pub number: i64,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub state: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub draft: Option<bool>,
    #[serde(default)]
    pub html_url: String,
    #[serde(default)]
    pub user: Option<GithubUser>,
    #[serde(default)]
    pub repository_url: String,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pull_request: Option<PullRequestRef>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub labels: Option<Vec<Label>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub comments: Option<i64>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct BranchRef {
    #[serde(rename = "ref")]
    pub name: String,
}

/// `RawPull`: one pull of `/repos/:owner/:repo/pulls`.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct RawPull {
    pub number: i64,
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub draft: bool,
    #[serde(default)]
    pub html_url: String,
    #[serde(default)]
    pub user: Option<GithubUser>,
    #[serde(default)]
    pub base: BranchRef,
    #[serde(default)]
    pub head: BranchRef,
    #[serde(default)]
    pub created_at: String,
    #[serde(default)]
    pub updated_at: String,
    #[serde(default)]
    pub merged_at: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub additions: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deletions: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub changed_files: Option<i64>,
}

/// `RepoRef`.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Default, Serialize, Deserialize)]
pub struct RepoRef {
    pub owner: String,
    pub name: String,
}

/// Index = the numeric level returned by `/github/contributions`.
pub const CONTRIBUTION_LEVELS: [&str; 5] =
    ["NONE", "FIRST_QUARTILE", "SECOND_QUARTILE", "THIRD_QUARTILE", "FOURTH_QUARTILE"];

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawContributionDay {
    pub date: String,
    pub contribution_count: i64,
    pub contribution_level: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawContributionWeek {
    pub contribution_days: Vec<RawContributionDay>,
}

/// `RawContributionCalendar`.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawContributionCalendar {
    pub total_contributions: i64,
    pub weeks: Vec<RawContributionWeek>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct RawLanguage {
    pub name: String,
    pub color: Option<String>,
}

/// `RawContributedRepo`.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawContributedRepo {
    pub name_with_owner: String,
    pub url: String,
    pub description: Option<String>,
    pub is_private: bool,
    pub stargazer_count: i64,
    pub primary_language: Option<RawLanguage>,
}

/// `RawRepoContribution`: a repo plus the date of the user's own latest contribution to it.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RawRepoContribution {
    pub repository: RawContributedRepo,
    pub last_contributed_at: String,
}

pub const CONTRIBUTIONS_QUERY: &str = "query ($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount contributionLevel } }
      }
    }
  }
}";

/// The `*ContributionsByRepository` fields and their `orderBy` (commits require a field).
pub const CONTRIBUTION_ORDERS: [(&str, &str); 4] = [
    ("commitContributionsByRepository", "{ field: OCCURRED_AT, direction: DESC }"),
    ("pullRequestContributionsByRepository", "{ direction: DESC }"),
    ("pullRequestReviewContributionsByRepository", "{ direction: DESC }"),
    ("issueContributionsByRepository", "{ direction: DESC }"),
];

/// `CONTRIBUTED_REPOS_QUERY`: the user's own contributions from the last year, newest first per repo.
pub fn contributed_repos_query() -> String {
    pending!(53)
}

/// `GithubApiError`: the HTTP status (200 for an answer without the expected data) and a message.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("{message}")]
pub struct GithubApiError {
    pub status: u16,
    pub message: String,
}

impl GithubApiError {
    pub fn new(status: u16, message: impl Into<String>) -> Self {
        Self { status, message: message.into() }
    }
}

pub type GithubResult<T> = Result<T, GithubApiError>;

/// The calls `GithubService` makes, so tests can plug in a fake (`createTestApp({ githubClient })`).
#[async_trait]
pub trait GithubApi: Send + Sync + 'static {
    async fn get_login(&self, token: &str) -> GithubResult<String>;
    async fn search_issues(&self, token: &str, query: &str) -> GithubResult<Vec<RawSearchItem>>;
    /// Repos owned by `login`, most recently pushed first, capped at `max` (and 5 pages).
    async fn list_owned_repos(&self, token: &str, login: &str, max: usize) -> GithubResult<Vec<RepoRef>>;
    async fn list_open_pulls(&self, token: &str, repo: &RepoRef) -> GithubResult<Vec<RawPull>>;
    async fn get_pull(&self, token: &str, repo: &RepoRef, number: i64) -> GithubResult<RawPull>;
    /// The last year of the contributions graph shown on the user's GitHub profile.
    async fn get_contributions(&self, token: &str, login: &str) -> GithubResult<RawContributionCalendar>;
    /// Repos `login` contributed to in the last year, latest contribution first.
    async fn get_contributed_repos(
        &self,
        token: &str,
        login: &str,
        first: usize,
    ) -> GithubResult<Vec<RawRepoContribution>>;
}

/// The real client (`reqwest` with rustls).
#[derive(Debug, Clone)]
pub struct GithubClient {
    http: reqwest::Client,
    base_url: String,
}

impl GithubClient {
    /// Talks to `https://api.github.com`.
    pub fn new() -> Self {
        Self::with_base_url(GITHUB_API)
    }

    /// Talks to another server, such as a `wiremock` instance.
    pub fn with_base_url(base_url: impl Into<String>) -> Self {
        Self { http: reqwest::Client::new(), base_url: base_url.into() }
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }
}

impl Default for GithubClient {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl GithubApi for GithubClient {
    async fn get_login(&self, token: &str) -> GithubResult<String> {
        pending!(53, self.http, token)
    }

    async fn search_issues(&self, token: &str, query: &str) -> GithubResult<Vec<RawSearchItem>> {
        pending!(53, self.http, token, query)
    }

    async fn list_owned_repos(&self, token: &str, login: &str, max: usize) -> GithubResult<Vec<RepoRef>> {
        pending!(53, self.http, token, login, max)
    }

    async fn list_open_pulls(&self, token: &str, repo: &RepoRef) -> GithubResult<Vec<RawPull>> {
        pending!(53, self.http, token, repo)
    }

    async fn get_pull(&self, token: &str, repo: &RepoRef, number: i64) -> GithubResult<RawPull> {
        pending!(53, self.http, token, repo, number)
    }

    async fn get_contributions(&self, token: &str, login: &str) -> GithubResult<RawContributionCalendar> {
        pending!(53, self.http, token, login)
    }

    async fn get_contributed_repos(
        &self,
        token: &str,
        login: &str,
        first: usize,
    ) -> GithubResult<Vec<RawRepoContribution>> {
        pending!(53, self.http, token, login, first)
    }
}

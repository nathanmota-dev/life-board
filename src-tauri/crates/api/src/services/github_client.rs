//! Thin wrapper over the GitHub REST and GraphQL APIs; all HTTP lives here so it
//! can be replaced (a fake [`GithubApi`]) or pointed at `wiremock` (a base URL).

use async_trait::async_trait;
use reqwest::header::{ACCEPT, USER_AGENT};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

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
    let kinds = CONTRIBUTION_ORDERS
        .iter()
        .map(|(kind, order)| {
            format!(
                "      {kind}(maxRepositories: 100) {{
        repository {{ nameWithOwner url description isPrivate stargazerCount primaryLanguage {{ name color }} }}
        contributions(first: 1, orderBy: {order}) {{ nodes {{ occurredAt }} }}
      }}"
            )
        })
        .collect::<Vec<_>>()
        .join("\n");
    format!(
        "query ($login: String!) {{
  user(login: $login) {{
    contributionsCollection {{
{kinds}
    }}
  }}
}}"
    )
}

#[derive(Deserialize)]
struct Viewer {
    login: Option<String>,
}

#[derive(Deserialize)]
struct SearchResult {
    items: Vec<RawSearchItem>,
}

#[derive(Deserialize)]
struct OwnedRepo {
    name: String,
    owner: GithubUser,
}

#[derive(Deserialize)]
struct GraphqlError {
    message: Option<String>,
}

#[derive(Deserialize)]
struct GraphqlResponse<T> {
    data: Option<GraphqlData<T>>,
    errors: Option<Vec<GraphqlError>>,
}

#[derive(Deserialize)]
struct GraphqlData<T> {
    user: Option<GraphqlUser<T>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GraphqlUser<T> {
    contributions_collection: T,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CalendarCollection {
    contribution_calendar: Option<RawContributionCalendar>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Occurrence {
    occurred_at: String,
}

#[derive(Deserialize)]
struct Occurrences {
    nodes: Vec<Occurrence>,
}

#[derive(Deserialize)]
struct ContributionsByRepo {
    repository: RawContributedRepo,
    contributions: Occurrences,
}

/// One list per entry of [`CONTRIBUTION_ORDERS`].
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReposCollection {
    commit_contributions_by_repository: Option<Vec<ContributionsByRepo>>,
    pull_request_contributions_by_repository: Option<Vec<ContributionsByRepo>>,
    pull_request_review_contributions_by_repository: Option<Vec<ContributionsByRepo>>,
    issue_contributions_by_repository: Option<Vec<ContributionsByRepo>>,
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
        #[cfg(feature = "e2e")]
        if let Ok(base_url) = std::env::var("LIFE_BOARD_E2E_GITHUB_URL") {
            return Self::with_base_url(base_url);
        }
        Self::with_base_url(GITHUB_API)
    }

    /// Talks to another server, such as a `wiremock` instance.
    pub fn with_base_url(base_url: impl Into<String>) -> Self {
        Self { http: reqwest::Client::new(), base_url: base_url.into() }
    }

    pub fn base_url(&self) -> &str {
        &self.base_url
    }

    /// GET `path`, or POST `body` to it. The token only ever goes in the
    /// `Authorization` header, which `bearer_auth` marks as sensitive.
    async fn request<T: DeserializeOwned>(&self, path: &str, token: &str, body: Option<Value>) -> GithubResult<T> {
        let url = format!("{}{path}", self.base_url);
        let builder = match body {
            Some(body) => self.http.post(url).json(&body),
            None => self.http.get(url),
        };
        let response = builder
            .bearer_auth(token)
            .header(ACCEPT, "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .header(USER_AGENT, "life-board")
            .send()
            .await
            .map_err(|error| GithubApiError::new(0, format!("GitHub request failed: {}", error.without_url())))?;

        let status = response.status();
        if !status.is_success() {
            let body = response.text().await.unwrap_or_default();
            return Err(GithubApiError::new(
                status.as_u16(),
                format!(
                    "GitHub {} {}: {}",
                    status.as_u16(),
                    status.canonical_reason().unwrap_or_default(),
                    first_utf16_units(&body, MAX_ERROR_BODY)
                ),
            ));
        }
        response.json().await.map_err(|error| {
            GithubApiError::new(status.as_u16(), format!("GitHub sent an invalid response: {}", error.without_url()))
        })
    }

    /// Posts a query about `login` and picks a value out of its `contributionsCollection`.
    async fn graphql<T: DeserializeOwned, U>(
        &self,
        token: &str,
        (query, login): (&str, &str),
        pick: fn(T) -> Option<U>,
        missing: &str,
    ) -> GithubResult<U> {
        let body = json!({ "query": query, "variables": { "login": login } });
        let response: GraphqlResponse<T> = self.request("/graphql", token, Some(body)).await?;
        let GraphqlResponse { data, errors } = response;
        data.and_then(|data| data.user).and_then(|user| pick(user.contributions_collection)).ok_or_else(|| {
            let message = errors.and_then(|errors| errors.into_iter().next()).and_then(|error| error.message);
            GithubApiError::new(200, message.unwrap_or_else(|| missing.to_owned()))
        })
    }
}

/// How much of a failed response goes into the error message.
const MAX_ERROR_BODY: usize = 200;

/// `text.slice(0, max)`, without splitting a surrogate pair.
fn first_utf16_units(text: &str, max: usize) -> &str {
    let mut units = 0;
    for (index, character) in text.char_indices() {
        units += character.len_utf16();
        if units > max {
            return &text[..index];
        }
    }
    text
}

/// `encodeURIComponent`.
fn encode_uri_component(text: &str) -> String {
    let mut encoded = String::with_capacity(text.len());
    for byte in text.bytes() {
        if byte.is_ascii_alphanumeric() || b"-_.!~*'()".contains(&byte) {
            encoded.push(char::from(byte));
        } else {
            encoded.push_str(&format!("%{byte:02X}"));
        }
    }
    encoded
}

impl Default for GithubClient {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl GithubApi for GithubClient {
    async fn get_login(&self, token: &str) -> GithubResult<String> {
        let viewer: Viewer = self.request("/user", token, None).await?;
        viewer
            .login
            .filter(|login| !login.is_empty())
            .ok_or_else(|| GithubApiError::new(200, "GitHub /user returned no login."))
    }

    async fn search_issues(&self, token: &str, query: &str) -> GithubResult<Vec<RawSearchItem>> {
        let path = format!("/search/issues?q={}&per_page=30", encode_uri_component(query));
        let result: SearchResult = self.request(&path, token, None).await?;
        Ok(result.items)
    }

    async fn list_owned_repos(&self, token: &str, login: &str, max: usize) -> GithubResult<Vec<RepoRef>> {
        let mut repos = Vec::new();
        for page in 1..=5 {
            if repos.len() >= max {
                break;
            }
            let path = format!("/users/{login}/repos?per_page=50&page={page}&sort=pushed&type=owner");
            let batch: Vec<OwnedRepo> = self.request(&path, token, None).await?;
            let last_page = batch.len() < 50;
            repos.extend(batch.into_iter().map(|repo| RepoRef { owner: repo.owner.login, name: repo.name }));
            if last_page {
                break;
            }
        }
        repos.truncate(max);
        Ok(repos)
    }

    async fn list_open_pulls(&self, token: &str, repo: &RepoRef) -> GithubResult<Vec<RawPull>> {
        let path =
            format!("/repos/{}/{}/pulls?state=open&per_page=50&sort=updated&direction=desc", repo.owner, repo.name);
        self.request(&path, token, None).await
    }

    async fn get_pull(&self, token: &str, repo: &RepoRef, number: i64) -> GithubResult<RawPull> {
        self.request(&format!("/repos/{}/{}/pulls/{number}", repo.owner, repo.name), token, None).await
    }

    async fn get_contributions(&self, token: &str, login: &str) -> GithubResult<RawContributionCalendar> {
        let pick = |collection: CalendarCollection| collection.contribution_calendar;
        self.graphql(token, (CONTRIBUTIONS_QUERY, login), pick, "GitHub returned no contributions.").await
    }

    async fn get_contributed_repos(
        &self,
        token: &str,
        login: &str,
        first: usize,
    ) -> GithubResult<Vec<RawRepoContribution>> {
        let query = contributed_repos_query();
        let collection: ReposCollection =
            self.graphql(token, (&query, login), Some, "GitHub returned no repositories.").await?;

        let kinds = [
            collection.commit_contributions_by_repository,
            collection.pull_request_contributions_by_repository,
            collection.pull_request_review_contributions_by_repository,
            collection.issue_contributions_by_repository,
        ];
        let mut latest: Vec<RawRepoContribution> = Vec::new();
        for ContributionsByRepo { repository, contributions } in kinds.into_iter().flatten().flatten() {
            let Some(occurrence) = contributions.nodes.into_iter().next() else { continue };
            let incoming = RawRepoContribution { repository, last_contributed_at: occurrence.occurred_at };
            let known =
                latest.iter_mut().find(|entry| entry.repository.name_with_owner == incoming.repository.name_with_owner);
            match known {
                None => latest.push(incoming),
                Some(entry) if incoming.last_contributed_at > entry.last_contributed_at => *entry = incoming,
                Some(_) => {}
            }
        }
        latest.sort_by(|a, b| b.last_contributed_at.cmp(&a.last_contributed_at));
        latest.truncate(first);
        Ok(latest)
    }
}

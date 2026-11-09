use serde::{Deserialize, Serialize};

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

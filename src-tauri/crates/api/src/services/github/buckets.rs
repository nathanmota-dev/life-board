use crate::db::columns::{Timestamp, to_millis};
use crate::db::schema::github::{GithubIssueKind, GithubKind, NewGithubIssue};
use crate::services::github_client::{GithubUser, RawPull, RawSearchItem, RepoRef};
use crate::services::query::placeholders;

/// What fails a sync: its text becomes `lastSyncError`.
pub(super) type SyncError = Box<dyn std::error::Error + Send + Sync>;

pub(super) const SEARCHES: [(GithubKind, &str); 4] = [
    (GithubKind::Authored, "author"),
    (GithubKind::ReviewRequested, "review-requested"),
    (GithubKind::Mentioned, "mentions"),
    (GithubKind::Assigned, "assignee"),
];

// `user:` matches issues in repos the user owns, like the PRs' "in my repos".
pub(super) const ISSUE_SEARCHES: [(GithubIssueKind, &str); 4] = [
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

pub(super) fn issue_priority(kind: GithubIssueKind) -> u8 {
    match kind {
        GithubIssueKind::Authored => 5,
        GithubIssueKind::Assigned => 4,
        GithubIssueKind::Mentioned => 2,
        GithubIssueKind::InMyRepos => 1,
    }
}

/// A PR as a search hit or a pull payload. `pull` is set for the latter, the
/// one that carries branches and diff stats.
pub(super) struct Hit {
    pub(super) number: i64,
    pub(super) title: String,
    pub(super) state: String,
    pub(super) draft: bool,
    pub(super) user: Option<GithubUser>,
    pub(super) html_url: String,
    pub(super) created_at: String,
    pub(super) updated_at: String,
    pub(super) search_merged_at: Option<String>,
    pub(super) pull: Option<RawPull>,
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

pub(super) struct Bucket {
    pub(super) id: String,
    pub(super) kind: GithubKind,
    pub(super) triggered_by_login: Option<String>,
    pub(super) hit: Hit,
    pub(super) repo: RepoRef,
}

pub(super) struct IssueBucket {
    pub(super) id: String,
    pub(super) kind: GithubIssueKind,
    pub(super) item: RawSearchItem,
    pub(super) repo: RepoRef,
}

pub(super) fn row_id(repo: &RepoRef, number: i64) -> String {
    format!("{}/{}#{number}", repo.owner, repo.name)
}

pub(super) fn in_org(repo: &RepoRef, org_filter: Option<&str>) -> bool {
    org_filter.is_none_or(|org| org.is_empty() || repo.owner.to_lowercase() == org.to_lowercase())
}

/// Adds a PR, keeping its first position when it was already there.
pub(super) fn add_to_buckets(buckets: &mut Vec<Bucket>, incoming: Bucket) {
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

pub(super) fn parse_date(text: &str) -> Result<Timestamp, SyncError> {
    Ok(chrono::DateTime::parse_from_rfc3339(text).map_err(|_| format!("Invalid date: {text:?}"))?.to_utc())
}

/// Newest first; a date that can't be parsed fails later, when its row is built.
pub(super) fn newest_first<T>(rows: &mut [T], updated_at: impl Fn(&T) -> &str) {
    rows.sort_by_cached_key(|row| std::cmp::Reverse(parse_date(updated_at(row)).map_or(0, to_millis)));
}

pub(super) fn to_i64(value: usize) -> i64 {
    i64::try_from(value).unwrap_or(i64::MAX)
}

pub(super) fn delete_other_rows(conn: &rusqlite::Connection, table: &str, ids: &[String]) -> rusqlite::Result<()> {
    conn.execute(
        &format!("DELETE FROM {table} WHERE id NOT IN ({})", placeholders(ids.len())),
        rusqlite::params_from_iter(ids),
    )?;
    Ok(())
}

pub(super) fn to_issue_row(bucket: IssueBucket) -> Result<NewGithubIssue, SyncError> {
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

pub(super) fn author(user: Option<GithubUser>) -> (String, Option<String>) {
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

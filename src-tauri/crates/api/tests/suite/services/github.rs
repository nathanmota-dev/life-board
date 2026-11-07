use std::sync::{Arc, Mutex};

use life_board_api::ApiError;
use life_board_api::db::schema::github::GithubIssueKind;
use life_board_api::db::schema::github::{GithubKind, NewGithubPr, insert_prs};
use life_board_api::dto::github::{ConnectGithubBody, ListIssuesQuery, ListPrsQuery, RecentReposQuery};
use life_board_api::services::github::{
    ContributionDay, Contributions, GithubConnected, GithubService, GithubStatus, RecentRepo, SyncResult, repo_from_url,
};
use life_board_api::services::github_client::{Label, PullRequestRef, RawPull, RawSearchItem, RepoRef};
use serde_json::json;

use crate::common::{
    FakeGithub, RecordingLogger, TestDb, assert_bad_request, assert_code, assert_error, assert_match, crypto,
    github_error, now, pull, search_item, test_db, to_json,
};

const TOKEN: &str = "ghp_0123456789abcdefghij";

struct Ctx {
    db: TestDb,
    logger: Arc<RecordingLogger>,
}

async fn setup() -> Ctx {
    Ctx { db: test_db().await, logger: Arc::new(RecordingLogger::default()) }
}

impl Ctx {
    fn service(&self, client: &Arc<FakeGithub>) -> GithubService {
        GithubService::new(self.db.db.clone(), client.clone(), crypto(3), self.logger.clone())
    }

    /// `connected(client, orgFilter)`.
    async fn connected(&self, client: &Arc<FakeGithub>, org_filter: Option<&str>) -> GithubService {
        let service = self.service(client);
        let org_filter = org_filter.map(|org| Some(org.to_owned()));
        service.connect(ConnectGithubBody { token: TOKEN.into(), org_filter }).await.unwrap();
        service
    }
}

fn prs(limit: i64) -> ListPrsQuery {
    ListPrsQuery { kind: None, limit }
}

fn issues(limit: i64) -> ListIssuesQuery {
    ListIssuesQuery { kind: None, limit }
}

fn repo(owner: &str, name: &str) -> RepoRef {
    RepoRef { owner: owner.into(), name: name.into() }
}

async fn count_rows(ctx: &Ctx, table: &'static str) -> i64 {
    ctx.db
        .db
        .call(move |conn| conn.query_row(&format!("SELECT count(*) FROM {table}"), [], |row| row.get(0)))
        .await
        .unwrap()
}

#[test]
#[ignore = "pending #53"]
fn parses_api_repo_urls() {
    assert_eq!(repo_from_url("https://api.github.com/repos/me/app"), Some(repo("me", "app")));
    assert_eq!(repo_from_url("https://example.com"), None);
}

#[tokio::test]
#[ignore = "pending #53"]
async fn connects_with_an_encrypted_token_and_reports_status() {
    let ctx = setup().await;
    let service = ctx.service(&FakeGithub::new());
    assert_eq!(
        service.status().await.unwrap(),
        GithubStatus { connected: false, login: None, last_sync_at: None, last_sync_error: None }
    );

    assert_eq!(
        service.connect(ConnectGithubBody { token: TOKEN.into(), org_filter: None }).await.unwrap(),
        GithubConnected { connected: true, login: "me".into() }
    );
    // Reconnecting replaces the single settings row.
    service.connect(ConnectGithubBody { token: TOKEN.into(), org_filter: Some(Some("acme".into())) }).await.unwrap();

    let rows: Vec<(String, Option<String>)> = ctx
        .db
        .db
        .call(|conn| {
            let mut statement = conn.prepare("SELECT token_ciphertext, org_filter FROM github_settings")?;
            statement.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?.collect()
        })
        .await
        .unwrap();
    assert_eq!(rows.len(), 1);
    assert!(!rows[0].0.contains("ghp_"));
    assert_eq!(rows[0].1.as_deref(), Some("acme"));
    assert_match(&to_json(&service.status().await.unwrap()), &json!({ "connected": true, "login": "me" }));
}

#[tokio::test]
#[ignore = "pending #53"]
async fn rejects_tokens_github_doesn_t_accept() {
    let ctx = setup().await;
    let client = FakeGithub::new();
    client.on_get_login(|_| Err(github_error("Bad credentials")));
    let result = ctx.service(&client).connect(ConnectGithubBody { token: "x".repeat(20), org_filter: None }).await;
    assert_code(result, "invalid_token");
}

#[tokio::test]
#[ignore = "pending #53"]
async fn requires_a_connection_before_syncing() {
    let ctx = setup().await;
    assert_bad_request(ctx.service(&FakeGithub::new()).sync().await);
}

#[tokio::test]
#[ignore = "pending #53"]
async fn syncs_prs_keeping_the_strongest_kind_and_the_richest_payload() {
    let ctx = setup().await;
    let client = FakeGithub::new();
    client.on_search_issues(|query| {
        if query.starts_with("is:issue") {
            return Ok(Vec::new());
        }
        if query.contains("author:me") {
            let merged = PullRequestRef { merged_at: Some("2026-10-12T00:00:00Z".into()) };
            return Ok(vec![RawSearchItem {
                pull_request: Some(merged),
                ..search_item("me", 1, "2026-10-12T00:00:00Z")
            }]);
        }
        if query.contains("mentions:me") {
            return Ok(vec![
                search_item("me", 1, "2026-10-12T00:00:00Z"),
                RawSearchItem { draft: Some(true), user: None, ..search_item("other", 5, "2026-10-11T00:00:00Z") },
            ]);
        }
        if query.contains("assignee:me") {
            return Err(github_error("rate limited"));
        }
        Ok(vec![RawSearchItem { repository_url: "not-a-repo".into(), ..search_item("x", 9, "2026-10-01T00:00:00Z") }])
    });
    client.on_list_owned_repos(|| Ok(vec![repo("me", "app"), repo("me", "private")]));
    client.on_list_open_pulls(|repo| {
        if repo.name == "private" {
            return Err(github_error("404"));
        }
        Ok(vec![pull(1), RawPull { updated_at: "2026-10-09T00:00:00Z".into(), ..pull(2) }])
    });
    client.on_get_pull(|_| Err(github_error("gone")));
    let service = ctx.connected(&client, None).await;

    assert_eq!(service.sync().await.unwrap(), SyncResult { ok: true, count: 3, issues: 0, login: "me".into() });

    let listed = service.list_prs(prs(10)).await.unwrap();
    let kinds: Vec<(&str, GithubKind)> = listed.iter().map(|pr| (pr.id.as_str(), pr.kind)).collect();
    assert_eq!(
        kinds,
        [
            ("other/app#5", GithubKind::Mentioned),
            ("me/app#1", GithubKind::Authored),
            ("me/app#2", GithubKind::InMyRepos)
        ]
    );
    // PR #1 kept "authored" but took branches and diff stats from the full pull payload.
    assert_match(&to_json(&listed[1]), &json!({ "headBranch": "feature-1", "additions": 10, "state": "open" }));
    // Search-only PR whose detail fetch failed: no branches, defaults for stats.
    assert_match(
        &to_json(&listed[0]),
        &json!({ "draft": true, "authorLogin": "", "headBranch": null, "additions": 0 }),
    );
    assert_eq!(service.list_prs(ListPrsQuery { kind: Some(GithubKind::Authored), limit: 10 }).await.unwrap().len(), 1);
    assert_eq!(ctx.logger.warnings().len(), 2);
    assert!(service.status().await.unwrap().last_sync_at.is_some());
}

#[tokio::test]
#[ignore = "pending #53"]
async fn marks_merged_search_hits_and_fills_details_from_the_pr_endpoint() {
    let ctx = setup().await;
    let client = FakeGithub::new();
    client.on_search_issues(|query| {
        Ok(if query.starts_with("is:pr author:me") {
            vec![search_item("me", 3, "2026-10-12T00:00:00Z")]
        } else {
            Vec::new()
        })
    });
    client.on_get_pull(|_| {
        Ok(RawPull {
            merged_at: Some("2026-10-12T00:00:00Z".into()),
            additions: None,
            deletions: None,
            changed_files: None,
            ..pull(3)
        })
    });
    let service = ctx.connected(&client, None).await;
    service.sync().await.unwrap();

    let listed = service.list_prs(prs(10)).await.unwrap();
    assert_match(&to_json(&listed[0]), &json!({ "state": "merged", "baseBranch": "main", "additions": 0 }));
}

#[tokio::test]
#[ignore = "pending #53"]
async fn drops_stale_prs_applies_the_org_filter_and_keeps_the_cache_on_empty_results() {
    let ctx = setup().await;
    let results = Arc::new(Mutex::new(vec![
        search_item("acme", 1, "2026-10-12T00:00:00Z"),
        search_item("me", 2, "2026-10-12T00:00:00Z"),
    ]));
    let client = FakeGithub::new();
    let shared = Arc::clone(&results);
    client.on_search_issues(move |query| {
        Ok(if query.starts_with("is:pr author:me") { shared.lock().unwrap().clone() } else { Vec::new() })
    });
    let service = ctx.connected(&client, Some("ACME")).await;
    insert_prs(
        &ctx.db.db,
        vec![NewGithubPr {
            id: "acme/old#99".into(),
            number: 99,
            title: "Stale".into(),
            state: "open".into(),
            repo_owner: "acme".into(),
            repo_name: "old".into(),
            author_login: "me".into(),
            url: "u".into(),
            kind: GithubKind::Authored,
            created_at: now(),
            updated_at: now(),
            ..Default::default()
        }],
    )
    .await
    .unwrap();

    service.sync().await.unwrap();
    let ids: Vec<String> = service.list_prs(prs(10)).await.unwrap().into_iter().map(|pr| pr.id).collect();
    assert_eq!(ids, ["acme/app#1"]);

    results.lock().unwrap().clear();
    assert_eq!(service.sync().await.unwrap().count, 0);
    assert_eq!(service.list_prs(prs(10)).await.unwrap().len(), 1);
}

#[tokio::test]
#[ignore = "pending #53"]
async fn syncs_issues_keeping_the_strongest_kind_and_the_org_filter() {
    let ctx = setup().await;
    let client = FakeGithub::new();
    client.on_search_issues(|query| {
        if !query.starts_with("is:issue") {
            return Ok(Vec::new());
        }
        if query.contains("author:me") {
            let labelled = RawSearchItem {
                labels: Some(vec![Label { name: "bug".into() }]),
                comments: Some(4),
                ..search_item("acme", 1, "2026-10-12T00:00:00Z")
            };
            return Ok(vec![labelled]);
        }
        if query.contains("user:me") {
            return Ok(vec![
                search_item("acme", 1, "2026-10-12T00:00:00Z"),
                RawSearchItem { user: None, ..search_item("acme", 2, "2026-10-10T00:00:00Z") },
            ]);
        }
        if query.contains("assignee:me") {
            return Err(github_error("rate limited"));
        }
        Ok(vec![
            search_item("other", 3, "2026-10-11T00:00:00Z"),
            RawSearchItem { repository_url: "bad".into(), ..search_item("x", 4, "2026-10-11T00:00:00Z") },
        ])
    });
    let service = ctx.connected(&client, Some("acme")).await;

    assert_match(&to_json(&service.sync().await.unwrap()), &json!({ "count": 0, "issues": 2 }));
    let listed = service.list_issues(issues(10)).await.unwrap();
    let kinds: Vec<(&str, GithubIssueKind)> = listed.iter().map(|issue| (issue.id.as_str(), issue.kind)).collect();
    assert_eq!(kinds, [("acme/app#1", GithubIssueKind::Authored), ("acme/app#2", GithubIssueKind::InMyRepos)]);
    assert_match(
        &to_json(&listed[0]),
        &json!({ "labels": ["bug"], "comments": 4, "state": "open", "authorLogin": "author" }),
    );
    assert_match(
        &to_json(&listed[1]),
        &json!({ "labels": [], "comments": 0, "authorLogin": "", "authorAvatarUrl": null }),
    );
    assert_eq!(
        service.list_issues(ListIssuesQuery { kind: Some(GithubIssueKind::InMyRepos), limit: 10 }).await.unwrap().len(),
        1
    );
    assert!(ctx.logger.warnings().iter().any(|warning| warning.contains("issue search failed (assigned)")));
}

#[tokio::test]
#[ignore = "pending #53"]
async fn clears_closed_issues_but_keeps_the_cache_when_every_issue_search_fails() {
    let ctx = setup().await;
    let mode = Arc::new(Mutex::new("found"));
    let client = FakeGithub::new();
    let current = Arc::clone(&mode);
    client.on_search_issues(move |query| {
        if !query.starts_with("is:issue") {
            return Ok(Vec::new());
        }
        let mode = *current.lock().unwrap();
        if mode == "down" {
            return Err(github_error("GitHub 503"));
        }
        Ok(if mode == "found" && query.contains("author:me") {
            vec![search_item("me", 1, "2026-10-12T00:00:00Z")]
        } else {
            Vec::new()
        })
    });
    let service = ctx.connected(&client, None).await;
    service.sync().await.unwrap();
    assert_eq!(service.list_issues(issues(10)).await.unwrap().len(), 1);

    *mode.lock().unwrap() = "down";
    assert_eq!(service.sync().await.unwrap().issues, 0);
    assert_eq!(count_rows(&ctx, "github_issues").await, 1);

    *mode.lock().unwrap() = "none";
    service.sync().await.unwrap();
    assert_eq!(service.list_issues(issues(10)).await.unwrap(), []);
}

#[tokio::test]
#[ignore = "pending #53"]
async fn records_the_error_when_a_sync_fails() {
    let ctx = setup().await;
    let client = FakeGithub::new();
    client.on_list_owned_repos(|| Err(github_error("GitHub 401")));
    let service = ctx.connected(&client, None).await;

    assert_error(service.sync().await, 502, "sync_failed");
    assert!(matches!(service.sync().await, Err(ApiError::Http { .. })));
    assert_eq!(service.status().await.unwrap().last_sync_error.as_deref(), Some("GitHub 401"));
}

#[tokio::test]
#[ignore = "pending #53"]
async fn returns_the_contributions_calendar_with_numeric_levels() {
    let ctx = setup().await;
    let client = FakeGithub::new();
    assert_code(ctx.service(&client).contributions().await, "not_connected");

    let service = ctx.connected(&client, None).await;
    let day = |date: &str, count, level| ContributionDay { date: date.into(), count, level };
    assert_eq!(
        service.contributions().await.unwrap(),
        Contributions { login: "me".into(), total: 5, days: vec![day("2026-10-11", 0, 0), day("2026-10-12", 5, 4)] }
    );
    assert!(client.calls().contains(&format!("get_contributions({TOKEN}, me)")));
}

#[tokio::test]
#[ignore = "pending #53"]
async fn reports_github_failures_when_loading_contributions() {
    let ctx = setup().await;
    let client = FakeGithub::new();
    client.on_get_contributions(|| Err(github_error("GitHub 502")));
    let service = ctx.connected(&client, None).await;
    assert_error(service.contributions().await, 502, "github_unavailable");
}

#[tokio::test]
#[ignore = "pending #53"]
async fn lists_the_repositories_recently_contributed_to() {
    let ctx = setup().await;
    let client = FakeGithub::new();
    assert_code(ctx.service(&client).recent_repos(RecentReposQuery { limit: 4 }).await, "not_connected");

    let service = ctx.connected(&client, None).await;
    assert_eq!(
        service.recent_repos(RecentReposQuery { limit: 4 }).await.unwrap(),
        [
            RecentRepo {
                full_name: "me/app".into(),
                url: "https://github.com/me/app".into(),
                description: Some("My app".into()),
                private: true,
                last_contributed_at: "2026-10-12T00:00:00Z".into(),
                stars: 3,
                language: Some("TypeScript".into()),
                language_color: Some("#3178c6".into()),
            },
            RecentRepo {
                full_name: "org/lib".into(),
                url: "https://github.com/org/lib".into(),
                description: None,
                private: false,
                last_contributed_at: "2026-09-01T00:00:00Z".into(),
                stars: 0,
                language: None,
                language_color: None,
            },
        ]
    );
    assert!(client.calls().contains(&format!("get_contributed_repos({TOKEN}, me, 4)")));
}

#[tokio::test]
#[ignore = "pending #53"]
async fn reports_github_failures_when_loading_recent_repositories() {
    let ctx = setup().await;
    let client = FakeGithub::new();
    client.on_get_contributed_repos(|| Err(github_error("GitHub 502")));
    let service = ctx.connected(&client, None).await;
    assert_error(service.recent_repos(RecentReposQuery { limit: 4 }).await, 502, "github_unavailable");
}

#[tokio::test]
#[ignore = "pending #53"]
async fn disconnects_and_clears_the_cache() {
    let ctx = setup().await;
    let client = FakeGithub::new();
    client.on_search_issues(|_| Ok(vec![search_item("me", 1, "2026-10-12T00:00:00Z")]));
    let service = ctx.connected(&client, None).await;
    service.sync().await.unwrap();
    assert_eq!(service.list_issues(issues(10)).await.unwrap().len(), 1);

    service.disconnect().await.unwrap();

    assert!(!service.status().await.unwrap().connected);
    assert_eq!(service.list_prs(prs(10)).await.unwrap(), []);
    assert_eq!(service.list_issues(issues(10)).await.unwrap(), []);
}

#[tokio::test]
#[ignore = "pending #53"]
async fn wipes_the_encrypted_token_from_the_database_file_on_disconnect() {
    let ctx = setup().await;
    let client = FakeGithub::new();
    client.on_search_issues(|_| Ok(vec![search_item("me", 1, "2026-10-12T00:00:00Z")]));
    let service = ctx.connected(&client, None).await;
    service.sync().await.unwrap();
    let ciphertext: String = ctx
        .db
        .db
        .call(|conn| conn.query_row("SELECT token_ciphertext FROM github_settings", [], |row| row.get(0)))
        .await
        .unwrap();
    let contains = |haystack: &[u8]| haystack.windows(ciphertext.len()).any(|window| window == ciphertext.as_bytes());
    assert!(contains(&std::fs::read(ctx.db.file()).unwrap()));

    service.disconnect().await.unwrap();

    assert!(!contains(&std::fs::read(ctx.db.file()).unwrap()));
}

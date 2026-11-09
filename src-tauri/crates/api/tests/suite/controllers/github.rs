use std::sync::Arc;

use life_board_api::services::github_client::GithubClient;
use serde_json::{Value, json};
use wiremock::matchers::{method, path, path_regex};
use wiremock::{Mock, MockServer, Request, ResponseTemplate};

use crate::common::{TestApp, assert_match};

fn query_starts_with(prefix: &'static str) -> impl Fn(&Request) -> bool {
    move |request: &Request| request.url.query_pairs().any(|(key, value)| key == "q" && value.starts_with(prefix))
}

/// The `fetchMock` of the Node test, answered by path.
async fn github() -> MockServer {
    let server = MockServer::start().await;
    let json = |body: Value| ResponseTemplate::new(200).set_body_json(body);
    Mock::given(path("/user")).respond_with(json(json!({ "login": "me" }))).mount(&server).await;
    Mock::given(path("/graphql"))
        .respond_with(json(json!({
            "data": {
                "user": {
                    "contributionsCollection": {
                        "contributionCalendar": { "totalContributions": 0, "weeks": [] },
                        "commitContributionsByRepository": [],
                        "pullRequestContributionsByRepository": [],
                        "pullRequestReviewContributionsByRepository": [],
                        "issueContributionsByRepository": []
                    }
                }
            }
        })))
        .mount(&server)
        .await;
    Mock::given(path("/search/issues"))
        .and(query_starts_with("is:issue author"))
        .respond_with(json(json!({
            "items": [{
                "number": 7,
                "title": "Broken",
                "state": "open",
                "html_url": "https://github.com/me/app/issues/7",
                "user": { "login": "me", "avatar_url": null },
                "repository_url": "https://api.github.com/repos/me/app",
                "created_at": "2026-10-01T00:00:00Z",
                "updated_at": "2026-10-03T00:00:00Z",
                "labels": [{ "name": "bug" }],
                "comments": 2
            }]
        })))
        .with_priority(1)
        .mount(&server)
        .await;
    Mock::given(path("/search/issues")).respond_with(json(json!({ "items": [] }))).mount(&server).await;
    Mock::given(path_regex(r"^/users/[^/]+/repos$"))
        .respond_with(json(json!([{ "name": "app", "owner": { "login": "me" } }])))
        .mount(&server)
        .await;
    Mock::given(path_regex(r"^/repos/"))
        .respond_with(json(json!([{
            "number": 1,
            "title": "Fix",
            "state": "open",
            "draft": false,
            "html_url": "https://github.com/me/app/pull/1",
            "user": { "login": "friend", "avatar_url": null },
            "base": { "ref": "main" },
            "head": { "ref": "fix" },
            "created_at": "2026-10-01T00:00:00Z",
            "updated_at": "2026-10-02T00:00:00Z",
            "merged_at": null
        }])))
        .with_priority(10)
        .mount(&server)
        .await;
    server
}

async fn app_with(server: &MockServer) -> TestApp {
    let uri = server.uri();
    TestApp::with(|options| options.github_client = Some(Arc::new(GithubClient::with_base_url(uri)))).await
}

#[tokio::test]
async fn connects_syncs_lists_and_disconnects() {
    let server = github().await;
    let ctx = app_with(&server).await;
    let connect = ctx.post("/api/github/connect", json!({ "token": "ghp_0123456789abcdefghij" })).await;
    assert_eq!(connect.json(), json!({ "connected": true, "login": "me" }));

    assert_eq!(
        ctx.post_empty("/api/github/sync").await.json(),
        json!({ "ok": true, "count": 1, "issues": 1, "login": "me" })
    );

    let prs = ctx.get("/api/github/prs?kind=in_my_repos").await.json();
    assert_match(&prs["items"], &json!([{ "id": "me/app#1", "headBranch": "fix" }]));

    let issues = ctx.get("/api/github/issues?kind=authored").await.json();
    assert_match(&issues["items"], &json!([{ "id": "me/app#7", "labels": ["bug"], "comments": 2 }]));
    assert_eq!(ctx.get("/api/github/issues?kind=review_requested").await.status(), 400);

    assert_eq!(ctx.get("/api/github/contributions").await.json(), json!({ "login": "me", "total": 0, "days": [] }));
    assert_eq!(ctx.get("/api/github/repos/recent?limit=4").await.json(), json!({ "items": [] }));
    assert_eq!(ctx.get("/api/github/repos/recent?limit=50").await.status(), 400);
    assert_eq!(ctx.get("/api/github/status").await.json()["connected"], true);
    assert_eq!(ctx.delete("/api/github/disconnect").await.json(), json!({ "ok": true }));
    assert_eq!(ctx.get("/api/github/status").await.json()["connected"], false);
}

#[tokio::test]
async fn maps_failures_to_http_errors() {
    let server = github().await;
    let ctx = app_with(&server).await;
    assert_eq!(ctx.post_empty("/api/github/sync").await.json()["error"], "not_connected");
    assert_eq!(ctx.post("/api/github/connect", json!({ "token": "short" })).await.status(), 400);

    Mock::given(path("/user"))
        .respond_with(ResponseTemplate::new(401).set_body_json(json!({ "message": "Bad credentials" })))
        .up_to_n_times(1)
        .with_priority(1)
        .mount(&server)
        .await;
    let invalid = ctx.post("/api/github/connect", json!({ "token": "ghp_0123456789abcdefghij" })).await;
    assert_eq!(invalid.json()["error"], "invalid_token");

    ctx.post("/api/github/connect", json!({ "token": "ghp_0123456789abcdefghij" })).await;
    server.reset().await;
    Mock::given(method("GET")).respond_with(ResponseTemplate::new(500).set_body_json(json!({}))).mount(&server).await;
    Mock::given(method("POST")).respond_with(ResponseTemplate::new(500).set_body_json(json!({}))).mount(&server).await;
    let failed = ctx.post_empty("/api/github/sync").await;
    assert_eq!(failed.status(), 502);
    assert_eq!(failed.json()["error"], "sync_failed");
}

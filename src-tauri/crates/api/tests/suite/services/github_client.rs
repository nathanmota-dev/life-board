use life_board_api::services::github_client::{GITHUB_API, GithubApi, GithubClient, RawContributionCalendar, RepoRef};
use serde_json::{Value, json};
use wiremock::matchers::{header, method, path};
use wiremock::{Mock, MockServer, Request, ResponseTemplate};

fn ok(body: Value) -> ResponseTemplate {
    ResponseTemplate::new(200).set_body_json(body)
}

/// A server that answers every request with `body` (`new GithubClient(async () => json(body))`).
async fn answering(response: ResponseTemplate) -> (MockServer, GithubClient) {
    let server = MockServer::start().await;
    Mock::given(wiremock::matchers::any()).respond_with(response).mount(&server).await;
    let client = GithubClient::with_base_url(server.uri());
    (server, client)
}

async fn requests(server: &MockServer) -> Vec<Request> {
    server.received_requests().await.unwrap_or_default()
}

#[tokio::test]
async fn sends_the_token_and_api_headers() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/user"))
        .and(header("authorization", "Bearer ghp_token"))
        .and(header("accept", "application/vnd.github+json"))
        .respond_with(ok(json!({ "login": "octocat" })))
        .mount(&server)
        .await;
    let client = GithubClient::with_base_url(server.uri());

    assert_eq!(client.get_login("ghp_token").await.unwrap(), "octocat");
    let sent = requests(&server).await;
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0].url.path(), "/user");
}

#[tokio::test]
async fn raises_githubapierror_for_failed_requests_and_missing_logins() {
    let (_server, client) =
        answering(ResponseTemplate::new(401).set_body_json(json!({ "message": "Bad credentials" }))).await;
    let failed = client.get_login("x").await.unwrap_err();
    assert!(failed.message.starts_with("GitHub 401 Unauthorized: "), "{failed}");
    assert!(failed.message.contains("Bad credentials"), "{failed}");

    let (_server, client) = answering(ok(json!({}))).await;
    assert!(client.get_login("x").await.is_err());
}

#[tokio::test]
async fn encodes_search_queries() {
    let (server, client) = answering(ok(json!({ "items": [{ "number": 1 }] }))).await;
    let items = client.search_issues("t", "is:pr author:me").await.unwrap();

    assert_eq!(items.iter().map(|item| item.number).collect::<Vec<_>>(), [1]);
    let sent = requests(&server).await;
    assert!(sent[0].url.as_str().contains("q=is%3Apr%20author%3Ame&per_page=30"), "{}", sent[0].url);
}

#[tokio::test]
async fn pages_through_owned_repos_up_to_the_limit() {
    let page = |start: usize, size: usize| -> Value {
        (start..start + size).map(|i| json!({ "name": format!("repo-{i}"), "owner": { "login": "me" } })).collect()
    };
    let server = MockServer::start().await;
    Mock::given(path("/users/me/repos"))
        .respond_with(move |request: &Request| {
            let first = request.url.query_pairs().any(|(key, value)| key == "page" && value == "1");
            ok(if first { page(0, 50) } else { page(50, 10) })
        })
        .mount(&server)
        .await;
    let client = GithubClient::with_base_url(server.uri());

    assert_eq!(client.list_owned_repos("t", "me", 100).await.unwrap().len(), 60);
    assert_eq!(requests(&server).await.len(), 2);
    assert_eq!(client.list_owned_repos("t", "me", 20).await.unwrap().len(), 20);
}

#[tokio::test]
async fn fetches_pull_lists_and_details_for_a_repo() {
    let server = MockServer::start().await;
    Mock::given(path("/repos/me/app/pulls/7")).respond_with(ok(json!({ "number": 7 }))).mount(&server).await;
    Mock::given(path("/repos/me/app/pulls")).respond_with(ok(json!([]))).mount(&server).await;
    let client = GithubClient::with_base_url(server.uri());
    let repo = RepoRef { owner: "me".into(), name: "app".into() };

    assert_eq!(client.list_open_pulls("t", &repo).await.unwrap(), []);
    assert_eq!(client.get_pull("t", &repo, 7).await.unwrap().number, 7);
}

#[tokio::test]
async fn posts_the_contributions_query_to_graphql() {
    let calendar = json!({ "totalContributions": 3, "weeks": [] });
    let (server, client) = answering(ok(
        json!({ "data": { "user": { "contributionsCollection": { "contributionCalendar": calendar } } } }),
    ))
    .await;

    assert_eq!(
        client.get_contributions("t", "me").await.unwrap(),
        RawContributionCalendar { total_contributions: 3, weeks: Vec::new() }
    );
    let sent = requests(&server).await;
    assert_eq!(sent[0].url.path(), "/graphql");
    assert_eq!(sent[0].method.as_str(), "POST");
    let body: Value = serde_json::from_slice(&sent[0].body).unwrap();
    assert_eq!(body["variables"], json!({ "login": "me" }));
}

#[tokio::test]
async fn raises_when_graphql_returns_no_calendar() {
    let (_server, client) = answering(ok(json!({ "errors": [{ "message": "Could not resolve to a User" }] }))).await;
    assert!(client.get_contributions("t", "me").await.unwrap_err().message.contains("Could not resolve to a User"));
    let (_server, client) = answering(ok(json!({ "data": { "user": null } }))).await;
    assert!(
        client.get_contributions("t", "me").await.unwrap_err().message.contains("GitHub returned no contributions.")
    );
}

#[tokio::test]
async fn ranks_repositories_by_the_user_s_own_latest_contribution() {
    let repo = |name: &str| json!({ "nameWithOwner": name, "url": format!("https://github.com/{name}"), "description": null, "isPrivate": false, "stargazerCount": 0, "primaryLanguage": null });
    let by_repo = |name: &str, occurred_at: Option<&str>| {
        let nodes: Vec<Value> = occurred_at.map(|at| json!({ "occurredAt": at })).into_iter().collect();
        json!({ "repository": repo(name), "contributions": { "nodes": nodes } })
    };
    let (server, client) = answering(ok(json!({
        "data": {
            "user": {
                "contributionsCollection": {
                    "commitContributionsByRepository": [by_repo("me/old", Some("2026-01-01T00:00:00Z")), by_repo("org/busy", Some("2026-05-01T00:00:00Z"))],
                    "pullRequestContributionsByRepository": [by_repo("org/busy", Some("2026-10-10T00:00:00Z")), by_repo("me/empty", None)],
                    "pullRequestReviewContributionsByRepository": [by_repo("org/reviewed", Some("2026-09-01T00:00:00Z"))],
                    "issueContributionsByRepository": [by_repo("org/busy", Some("2026-02-01T00:00:00Z"))]
                }
            }
        }
    })))
    .await;

    let repos = client.get_contributed_repos("t", "me", 2).await.unwrap();
    let ranked: Vec<(&str, &str)> = repos
        .iter()
        .map(|entry| (entry.repository.name_with_owner.as_str(), entry.last_contributed_at.as_str()))
        .collect();
    assert_eq!(ranked, [("org/busy", "2026-10-10T00:00:00Z"), ("org/reviewed", "2026-09-01T00:00:00Z")]);
    let body: Value = serde_json::from_slice(&requests(&server).await[0].body).unwrap();
    assert_eq!(body["variables"], json!({ "login": "me" }));
    let query = body["query"].as_str().unwrap();
    assert!(query.contains("commitContributionsByRepository(maxRepositories: 100)"), "{query}");
    assert!(query.contains("orderBy: { field: OCCURRED_AT, direction: DESC }"), "{query}");
}

#[tokio::test]
async fn raises_when_graphql_returns_no_repositories() {
    let (_server, client) = answering(ok(json!({ "errors": [{ "message": "Bad query" }] }))).await;
    assert!(client.get_contributed_repos("t", "me", 4).await.unwrap_err().message.contains("Bad query"));
    let (_server, client) = answering(ok(json!({ "data": { "user": null } }))).await;
    assert!(
        client
            .get_contributed_repos("t", "me", 4)
            .await
            .unwrap_err()
            .message
            .contains("GitHub returned no repositories.")
    );
}

// In Node the default is the global `fetch`; here it is `reqwest` against the
// real API, checked without the network.
#[tokio::test]
async fn uses_the_global_fetch_by_default() {
    assert_eq!(GithubClient::new().base_url(), GITHUB_API);
    assert_eq!(GithubClient::default().base_url(), "https://api.github.com");
}

#[tokio::test]
async fn reports_network_failures_without_the_token_or_the_url() {
    // A port nothing listens on; a dropped MockServer goes back to wiremock's pool and keeps answering.
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let uri = format!("http://{}", listener.local_addr().unwrap());
    drop(listener);
    let client = GithubClient::with_base_url(uri.clone());

    let failed = client.get_login("ghp_token").await.unwrap_err();
    assert_eq!(failed.status, 0);
    assert!(failed.message.starts_with("GitHub request failed: "), "{failed}");
    assert!(!failed.message.contains("ghp_token"), "{failed}");
    assert!(!failed.message.contains(&uri), "{failed}");
}

#[tokio::test]
async fn reports_answers_that_are_not_the_expected_json() {
    let (_server, client) = answering(ResponseTemplate::new(200).set_body_string("<html>")).await;
    let failed = client.get_login("t").await.unwrap_err();
    assert_eq!(failed.status, 200);
    assert!(failed.message.starts_with("GitHub sent an invalid response: "), "{failed}");
}

#[tokio::test]
async fn keeps_the_status_and_the_first_200_utf16_units_of_a_failed_response() {
    let (_server, client) = answering(ResponseTemplate::new(403).set_body_string("🌱".repeat(150))).await;
    let failed = client.search_issues("t", "q").await.unwrap_err();
    assert_eq!(failed.status, 403);
    assert_eq!(failed.message, format!("GitHub 403 Forbidden: {}", "🌱".repeat(100)));

    let (_server, client) = answering(ResponseTemplate::new(404).set_body_string("Not Found")).await;
    assert_eq!(client.list_owned_repos("t", "me", 1).await.unwrap_err().status, 404);
}

#[tokio::test]
async fn encodes_search_queries_like_encodeuricomponent() {
    let (server, client) = answering(ok(json!({ "items": [] }))).await;
    client.search_issues("t", "a-b_c.d~e/é&").await.unwrap();
    let sent = requests(&server).await;
    assert!(sent[0].url.as_str().contains("q=a-b_c.d~e%2F%C3%A9%26&per_page=30"), "{}", sent[0].url);
}

#[tokio::test]
async fn stops_listing_owned_repos_after_five_pages() {
    let full: Value = (0..50).map(|i| json!({ "name": format!("repo-{i}"), "owner": { "login": "me" } })).collect();
    let (server, client) = answering(ok(full)).await;

    assert_eq!(client.list_owned_repos("t", "me", 1000).await.unwrap().len(), 250);
    assert_eq!(requests(&server).await.len(), 5);
}

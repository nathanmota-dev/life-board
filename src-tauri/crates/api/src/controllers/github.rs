use axum::Json;
use axum::extract::State;

use super::RouteTable;
use crate::db::schema::github::{GithubIssue, GithubPr};
use crate::dto::github::{ConnectGithubBody, ListIssuesQuery, ListPrsQuery, RecentReposQuery};
use crate::dto::{Items, OK_RESPONSE, OkResponse};
use crate::error::ApiResult;
use crate::extract::{ValidatedJson, ValidatedQuery};
use crate::services::github::{Contributions, GithubConnected, GithubStatus, RecentRepo, SyncResult};
use crate::state::AppState;

pub fn routes(table: RouteTable) -> RouteTable {
    table
        .get("/github/status", status)
        .post("/github/connect", connect)
        .delete("/github/disconnect", disconnect)
        .post("/github/sync", sync)
        .get("/github/contributions", contributions)
        .get("/github/repos/recent", recent_repos)
        .get("/github/prs", list_prs)
        .get("/github/issues", list_issues)
}

async fn status(State(state): State<AppState>) -> ApiResult<Json<GithubStatus>> {
    Ok(Json(state.github.status().await?))
}

async fn connect(
    State(state): State<AppState>,
    ValidatedJson(body): ValidatedJson<ConnectGithubBody>,
) -> ApiResult<Json<GithubConnected>> {
    Ok(Json(state.github.connect(body).await?))
}

async fn disconnect(State(state): State<AppState>) -> ApiResult<Json<OkResponse>> {
    state.github.disconnect().await?;
    Ok(Json(OK_RESPONSE))
}

async fn sync(State(state): State<AppState>) -> ApiResult<Json<SyncResult>> {
    Ok(Json(state.github.sync().await?))
}

async fn contributions(State(state): State<AppState>) -> ApiResult<Json<Contributions>> {
    Ok(Json(state.github.contributions().await?))
}

async fn recent_repos(
    State(state): State<AppState>,
    ValidatedQuery(query): ValidatedQuery<RecentReposQuery>,
) -> ApiResult<Json<Items<RecentRepo>>> {
    Ok(Json(Items { items: state.github.recent_repos(query).await? }))
}

async fn list_prs(
    State(state): State<AppState>,
    ValidatedQuery(query): ValidatedQuery<ListPrsQuery>,
) -> ApiResult<Json<Items<GithubPr>>> {
    Ok(Json(Items { items: state.github.list_prs(query).await? }))
}

async fn list_issues(
    State(state): State<AppState>,
    ValidatedQuery(query): ValidatedQuery<ListIssuesQuery>,
) -> ApiResult<Json<Items<GithubIssue>>> {
    Ok(Json(Items { items: state.github.list_issues(query).await? }))
}

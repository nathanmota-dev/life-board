use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;

use super::RouteTable;
use crate::db::schema::projects::{Project, ProjectStatusChange};
use crate::dto::projects::{CreateProjectBody, ListProjectsQuery, MoveProjectBody, UpdateProjectBody};
use crate::dto::{IdParams, Items, OK_RESPONSE, OkResponse};
use crate::error::ApiResult;
use crate::extract::{ValidatedJson, ValidatedPath, ValidatedQuery};
use crate::state::AppState;

pub fn routes(table: RouteTable) -> RouteTable {
    table
        .get("/projects", list)
        .post("/projects", create)
        .get("/projects/{id}", get)
        .get("/projects/{id}/history", history)
        .patch("/projects/{id}", update)
        .patch("/projects/{id}/move", move_project)
        .post("/projects/{id}/archive", archive)
        .post("/projects/{id}/restore", restore)
        .delete("/projects/{id}", remove)
}

async fn list(
    State(state): State<AppState>,
    ValidatedQuery(query): ValidatedQuery<ListProjectsQuery>,
) -> ApiResult<Json<Items<Project>>> {
    Ok(Json(state.projects.list(query).await?))
}

async fn create(
    State(state): State<AppState>,
    ValidatedJson(body): ValidatedJson<CreateProjectBody>,
) -> ApiResult<(StatusCode, Json<Project>)> {
    Ok((StatusCode::CREATED, Json(state.projects.create(body).await?)))
}

async fn get(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
) -> ApiResult<Json<Project>> {
    Ok(Json(state.projects.get(&params.id).await?))
}

async fn history(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
) -> ApiResult<Json<Items<ProjectStatusChange>>> {
    Ok(Json(state.projects.history(&params.id).await?))
}

async fn update(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
    ValidatedJson(body): ValidatedJson<UpdateProjectBody>,
) -> ApiResult<Json<Project>> {
    Ok(Json(state.projects.update(&params.id, body).await?))
}

async fn move_project(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
    ValidatedJson(body): ValidatedJson<MoveProjectBody>,
) -> ApiResult<Json<Items<Project>>> {
    Ok(Json(state.projects.r#move(&params.id, body).await?))
}

async fn archive(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
) -> ApiResult<Json<Project>> {
    Ok(Json(state.projects.archive(&params.id).await?))
}

async fn restore(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
) -> ApiResult<Json<Project>> {
    Ok(Json(state.projects.restore(&params.id).await?))
}

async fn remove(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
) -> ApiResult<Json<OkResponse>> {
    state.projects.remove(&params.id).await?;
    Ok(Json(OK_RESPONSE))
}

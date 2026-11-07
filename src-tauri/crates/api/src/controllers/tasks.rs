use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use serde::Serialize;

use super::RouteTable;
use crate::db::schema::tasks::Task;
use crate::dto::tasks::{CreateTaskBody, ListTasksQuery, ReorderTasksBody, UpdateTaskBody};
use crate::dto::{IdParams, OK_RESPONSE, OkResponse};
use crate::error::ApiResult;
use crate::extract::{ValidatedJson, ValidatedPath, ValidatedQuery};
use crate::services::tasks::{TaskList, TaskWithChildren};
use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct TaskItems {
    pub items: TaskList,
}

pub fn routes(table: RouteTable) -> RouteTable {
    table
        .get("/tasks", list)
        .post("/tasks", create)
        .patch("/tasks/order", reorder)
        .get("/tasks/{id}", get)
        .patch("/tasks/{id}", update)
        .delete("/tasks/{id}", remove)
        .post("/tasks/{id}/restore", restore)
}

async fn list(
    State(state): State<AppState>,
    ValidatedQuery(query): ValidatedQuery<ListTasksQuery>,
) -> ApiResult<Json<TaskItems>> {
    Ok(Json(TaskItems { items: state.tasks.list(query).await? }))
}

async fn create(
    State(state): State<AppState>,
    ValidatedJson(body): ValidatedJson<CreateTaskBody>,
) -> ApiResult<(StatusCode, Json<TaskWithChildren>)> {
    Ok((StatusCode::CREATED, Json(state.tasks.create(body).await?)))
}

async fn reorder(
    State(state): State<AppState>,
    ValidatedJson(body): ValidatedJson<ReorderTasksBody>,
) -> ApiResult<Json<OkResponse>> {
    state.tasks.reorder(body).await?;
    Ok(Json(OK_RESPONSE))
}

async fn get(State(state): State<AppState>, ValidatedPath(params): ValidatedPath<IdParams>) -> ApiResult<Json<Task>> {
    Ok(Json(state.tasks.get(&params.id).await?))
}

async fn update(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
    ValidatedJson(body): ValidatedJson<UpdateTaskBody>,
) -> ApiResult<Json<Task>> {
    Ok(Json(state.tasks.update(&params.id, body).await?))
}

async fn remove(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
) -> ApiResult<Json<OkResponse>> {
    state.tasks.remove(&params.id).await?;
    Ok(Json(OK_RESPONSE))
}

async fn restore(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
) -> ApiResult<Json<Task>> {
    Ok(Json(state.tasks.restore(&params.id).await?))
}

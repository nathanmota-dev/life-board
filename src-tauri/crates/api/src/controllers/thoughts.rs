use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;

use super::RouteTable;
use crate::db::schema::thoughts::Thought;
use crate::dto::thoughts::{CreateThoughtBody, ListThoughtsQuery, UpdateThoughtBody};
use crate::dto::{IdParams, OK_RESPONSE, OkResponse};
use crate::error::ApiResult;
use crate::extract::{ValidatedJson, ValidatedPath, ValidatedQuery};
use crate::services::thoughts::ThoughtPage;
use crate::state::AppState;

pub fn routes(table: RouteTable) -> RouteTable {
    table
        .get("/thoughts", list)
        .post("/thoughts", create)
        .get("/thoughts/{id}", get)
        .patch("/thoughts/{id}", update)
        .delete("/thoughts/{id}", remove)
}

async fn list(
    State(state): State<AppState>,
    ValidatedQuery(query): ValidatedQuery<ListThoughtsQuery>,
) -> ApiResult<Json<ThoughtPage>> {
    Ok(Json(state.thoughts.list(query).await?))
}

async fn create(
    State(state): State<AppState>,
    ValidatedJson(body): ValidatedJson<CreateThoughtBody>,
) -> ApiResult<(StatusCode, Json<Thought>)> {
    Ok((StatusCode::CREATED, Json(state.thoughts.create(body).await?)))
}

async fn get(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
) -> ApiResult<Json<Thought>> {
    Ok(Json(state.thoughts.get(&params.id).await?))
}

async fn update(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
    ValidatedJson(body): ValidatedJson<UpdateThoughtBody>,
) -> ApiResult<Json<Thought>> {
    Ok(Json(state.thoughts.update(&params.id, body).await?))
}

async fn remove(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
) -> ApiResult<Json<OkResponse>> {
    state.thoughts.remove(&params.id).await?;
    Ok(Json(OK_RESPONSE))
}

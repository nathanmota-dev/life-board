use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use chrono::Utc;

use super::RouteTable;
use crate::db::schema::mood::MoodEntry;
use crate::dto::mood::{ListMoodQuery, UpsertMoodBody};
use crate::dto::{IdParams, Items, OK_RESPONSE, OkResponse};
use crate::error::ApiResult;
use crate::extract::{ValidatedJson, ValidatedPath, ValidatedQuery};
use crate::services::mood::MoodToday;
use crate::state::AppState;

pub fn routes(table: RouteTable) -> RouteTable {
    table
        .get("/mood/today", today)
        .get("/mood/entries", list)
        .post("/mood/entries", upsert)
        .delete("/mood/entries/{id}", remove)
}

async fn today(State(state): State<AppState>) -> ApiResult<Json<MoodToday>> {
    Ok(Json(state.mood.today(Utc::now()).await?))
}

async fn list(
    State(state): State<AppState>,
    ValidatedQuery(query): ValidatedQuery<ListMoodQuery>,
) -> ApiResult<Json<Items<MoodEntry>>> {
    Ok(Json(Items { items: state.mood.list(query.limit).await? }))
}

/// `201` when the day's entry was created, `200` when it was updated.
async fn upsert(
    State(state): State<AppState>,
    ValidatedJson(body): ValidatedJson<UpsertMoodBody>,
) -> ApiResult<(StatusCode, Json<MoodEntry>)> {
    let result = state.mood.upsert(body).await?;
    let status = if result.created { StatusCode::CREATED } else { StatusCode::OK };
    Ok((status, Json(result.entry)))
}

async fn remove(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
) -> ApiResult<Json<OkResponse>> {
    state.mood.remove(&params.id).await?;
    Ok(Json(OK_RESPONSE))
}

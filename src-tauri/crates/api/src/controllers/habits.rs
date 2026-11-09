use crate::clock;
use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;

use super::RouteTable;
use crate::db::schema::habits::Habit;
use crate::dto::habits::{
    CreateHabitBody, HabitLogParams, ListHabitLogsQuery, LogHabitBody, SetHabitLogBody, UpdateHabitBody,
};
use crate::dto::{IdParams, Items, OK_RESPONSE, OkResponse};
use crate::error::ApiResult;
use crate::extract::{ValidatedJson, ValidatedPath, ValidatedQuery};
use crate::services::habits::{HabitDayCount, HabitLogEntry, HabitSummary};
use crate::state::AppState;

pub fn routes(table: RouteTable) -> RouteTable {
    table
        .get("/habits", list)
        .post("/habits", create)
        .patch("/habits/{id}", update)
        .delete("/habits/{id}", remove)
        .get("/habits/logs", logs)
        .post("/habits/{id}/logs", log)
        .put("/habits/{id}/logs/{day}", set_log)
}

async fn list(State(state): State<AppState>) -> ApiResult<Json<Items<HabitSummary>>> {
    Ok(Json(Items { items: state.habits.list(clock::now()).await? }))
}

async fn create(
    State(state): State<AppState>,
    ValidatedJson(body): ValidatedJson<CreateHabitBody>,
) -> ApiResult<(StatusCode, Json<Habit>)> {
    Ok((StatusCode::CREATED, Json(state.habits.create(body).await?)))
}

async fn update(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
    ValidatedJson(body): ValidatedJson<UpdateHabitBody>,
) -> ApiResult<Json<Habit>> {
    Ok(Json(state.habits.update(&params.id, body).await?))
}

async fn remove(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
) -> ApiResult<Json<OkResponse>> {
    state.habits.remove(&params.id).await?;
    Ok(Json(OK_RESPONSE))
}

async fn logs(
    State(state): State<AppState>,
    ValidatedQuery(query): ValidatedQuery<ListHabitLogsQuery>,
) -> ApiResult<Json<Items<HabitLogEntry>>> {
    Ok(Json(Items { items: state.habits.logs(query).await? }))
}

async fn log(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
    ValidatedJson(body): ValidatedJson<LogHabitBody>,
) -> ApiResult<Json<HabitDayCount>> {
    Ok(Json(state.habits.log(&params.id, body).await?))
}

async fn set_log(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<HabitLogParams>,
    ValidatedJson(body): ValidatedJson<SetHabitLogBody>,
) -> ApiResult<Json<HabitDayCount>> {
    Ok(Json(state.habits.set_log(&params.id, &params.day, body).await?))
}

use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;

use super::RouteTable;
use crate::db::schema::calendar::CalendarEvent;
use crate::dto::calendar::{CreateEventBody, ListEventsQuery, UpdateEventBody};
use crate::dto::{IdParams, Items, OK_RESPONSE, OkResponse};
use crate::error::ApiResult;
use crate::extract::{ValidatedJson, ValidatedPath, ValidatedQuery};
use crate::state::AppState;

pub fn routes(table: RouteTable) -> RouteTable {
    table
        .get("/calendar/events", list)
        .post("/calendar/events", create)
        .patch("/calendar/events/{id}", update)
        .delete("/calendar/events/{id}", remove)
}

async fn list(
    State(state): State<AppState>,
    ValidatedQuery(query): ValidatedQuery<ListEventsQuery>,
) -> ApiResult<Json<Items<CalendarEvent>>> {
    Ok(Json(Items { items: state.calendar.list(query).await? }))
}

async fn create(
    State(state): State<AppState>,
    ValidatedJson(body): ValidatedJson<CreateEventBody>,
) -> ApiResult<(StatusCode, Json<CalendarEvent>)> {
    Ok((StatusCode::CREATED, Json(state.calendar.create(body).await?)))
}

async fn update(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
    ValidatedJson(body): ValidatedJson<UpdateEventBody>,
) -> ApiResult<Json<CalendarEvent>> {
    Ok(Json(state.calendar.update(&params.id, body).await?))
}

async fn remove(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
) -> ApiResult<Json<OkResponse>> {
    state.calendar.remove(&params.id).await?;
    Ok(Json(OK_RESPONSE))
}

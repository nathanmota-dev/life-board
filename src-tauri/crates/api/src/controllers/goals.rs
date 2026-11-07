use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;
use chrono::Utc;

use super::RouteTable;
use crate::db::schema::goals::GoalMilestone;
use crate::dto::goals::{
    CreateGoalBody, CreateMilestoneBody, GoalProgressQuery, MilestoneParams, UpdateGoalBody, UpdateMilestoneBody,
};
use crate::dto::{IdParams, Items, OK_RESPONSE, OkResponse};
use crate::error::ApiResult;
use crate::extract::{ValidatedJson, ValidatedPath, ValidatedQuery};
use crate::services::goals::{CreatedGoal, GoalDetail, GoalSummary, ProgressHistory};
use crate::state::AppState;

pub fn routes(table: RouteTable) -> RouteTable {
    table
        .get("/goals", list)
        .post("/goals", create)
        .get("/goals/{id}", get)
        .patch("/goals/{id}", update)
        .delete("/goals/{id}", remove)
        .get("/goals/{id}/progress", progress)
        .post("/goals/{id}/milestones", add_milestone)
        .patch("/goals/{id}/milestones/{milestoneId}", update_milestone)
        .delete("/goals/{id}/milestones/{milestoneId}", remove_milestone)
}

async fn list(State(state): State<AppState>) -> ApiResult<Json<Items<GoalSummary>>> {
    Ok(Json(Items { items: state.goals.list(Utc::now()).await? }))
}

async fn create(
    State(state): State<AppState>,
    ValidatedJson(body): ValidatedJson<CreateGoalBody>,
) -> ApiResult<(StatusCode, Json<CreatedGoal>)> {
    Ok((StatusCode::CREATED, Json(state.goals.create(body).await?)))
}

async fn get(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
) -> ApiResult<Json<GoalDetail>> {
    Ok(Json(state.goals.get(&params.id, Utc::now()).await?))
}

async fn update(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
    ValidatedJson(body): ValidatedJson<UpdateGoalBody>,
) -> ApiResult<Json<GoalSummary>> {
    Ok(Json(state.goals.update(&params.id, body).await?))
}

async fn remove(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
) -> ApiResult<Json<OkResponse>> {
    state.goals.remove(&params.id).await?;
    Ok(Json(OK_RESPONSE))
}

async fn progress(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
    ValidatedQuery(query): ValidatedQuery<GoalProgressQuery>,
) -> ApiResult<Json<ProgressHistory>> {
    Ok(Json(state.goals.progress_history(&params.id, query).await?))
}

async fn add_milestone(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
    ValidatedJson(body): ValidatedJson<CreateMilestoneBody>,
) -> ApiResult<(StatusCode, Json<GoalMilestone>)> {
    Ok((StatusCode::CREATED, Json(state.goals.add_milestone(&params.id, body).await?)))
}

async fn update_milestone(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<MilestoneParams>,
    ValidatedJson(body): ValidatedJson<UpdateMilestoneBody>,
) -> ApiResult<Json<GoalMilestone>> {
    Ok(Json(state.goals.update_milestone(&params.goal_id, &params.milestone_id, body).await?))
}

async fn remove_milestone(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<MilestoneParams>,
) -> ApiResult<Json<OkResponse>> {
    state.goals.remove_milestone(&params.goal_id, &params.milestone_id).await?;
    Ok(Json(OK_RESPONSE))
}

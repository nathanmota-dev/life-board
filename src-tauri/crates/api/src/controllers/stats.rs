use axum::Json;
use axum::extract::State;
use chrono::Utc;

use super::RouteTable;
use crate::error::ApiResult;
use crate::services::stats::WeekStats;
use crate::state::AppState;

pub fn routes(table: RouteTable) -> RouteTable {
    table.get("/stats/this-week", this_week)
}

async fn this_week(State(state): State<AppState>) -> ApiResult<Json<WeekStats>> {
    Ok(Json(state.stats.this_week(Utc::now()).await?))
}

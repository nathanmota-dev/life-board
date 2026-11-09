use axum::Json;
use axum::extract::State;

use super::RouteTable;
use crate::dto::links::{BacklinkTarget, ResolveLinksBody};
use crate::error::ApiResult;
use crate::extract::{ValidatedJson, ValidatedPath};
use crate::services::links::{Backlinks, ResolvedLinks};
use crate::state::AppState;

pub fn routes(table: RouteTable) -> RouteTable {
    table.post("/links/resolve", resolve).get("/links/backlinks/{kind}/{id}", backlinks)
}

async fn resolve(
    State(state): State<AppState>,
    ValidatedJson(body): ValidatedJson<ResolveLinksBody>,
) -> ApiResult<Json<ResolvedLinks>> {
    Ok(Json(ResolvedLinks { links: state.links.resolve(body).await? }))
}

async fn backlinks(
    State(state): State<AppState>,
    ValidatedPath(target): ValidatedPath<BacklinkTarget>,
) -> ApiResult<Json<Backlinks>> {
    Ok(Json(Backlinks { backlinks: state.links.backlinks(target).await? }))
}

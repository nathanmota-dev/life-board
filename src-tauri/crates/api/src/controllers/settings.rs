use axum::Json;
use axum::extract::State;

use super::RouteTable;
use crate::dto::settings::UpdateFilesSettingsBody;
use crate::error::ApiResult;
use crate::extract::ValidatedJson;
use crate::services::files_settings::FilesSettings;
use crate::state::AppState;

pub fn routes(table: RouteTable) -> RouteTable {
    table.get("/settings/files", get_files).put("/settings/files", update_files)
}

async fn get_files(State(state): State<AppState>) -> ApiResult<Json<FilesSettings>> {
    Ok(Json(state.files_settings.get().await?))
}

async fn update_files(
    State(state): State<AppState>,
    ValidatedJson(body): ValidatedJson<UpdateFilesSettingsBody>,
) -> ApiResult<Json<FilesSettings>> {
    Ok(Json(state.files_settings.update(body.base_dir).await?))
}

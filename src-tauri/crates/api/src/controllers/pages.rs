use axum::Json;
use axum::extract::State;
use axum::http::StatusCode;

use super::RouteTable;
use crate::db::schema::pages::Page;
use crate::dto::pages::{CreatePageBody, ImportPageFields, ReplacePageContentBody, UpdatePageBody};
use crate::dto::{IdParams, Items, OK_RESPONSE, OkResponse};
use crate::error::ApiResult;
use crate::extract::{UploadForm, ValidatedJson, ValidatedPath};
use crate::services::pages::PageContent;
use crate::state::AppState;

pub fn routes(table: RouteTable) -> RouteTable {
    table
        .get("/pages", list_pages)
        .post("/pages", create_page)
        .post("/pages/import", import_page)
        .patch("/pages/{id}", update_page)
        .delete("/pages/{id}", remove_page)
        .get("/pages/{id}/content", read_content)
        .put("/pages/{id}/content", replace_content)
}

/// The whole tree as a flat list, without content.
async fn list_pages(State(state): State<AppState>) -> ApiResult<Json<Items<Page>>> {
    Ok(Json(Items { items: state.pages.list().await? }))
}

async fn create_page(
    State(state): State<AppState>,
    ValidatedJson(body): ValidatedJson<CreatePageBody>,
) -> ApiResult<(StatusCode, Json<Page>)> {
    Ok((StatusCode::CREATED, Json(state.pages.create(body).await?)))
}

/// Multipart import of one `.md` file: the file in `file`, `parentId` and `folderPath` as plain fields.
async fn import_page(
    State(state): State<AppState>,
    upload: UploadForm<ImportPageFields>,
) -> ApiResult<(StatusCode, Json<Page>)> {
    Ok((StatusCode::CREATED, Json(state.pages.import(upload.file, upload.fields).await?)))
}

async fn update_page(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
    ValidatedJson(body): ValidatedJson<UpdatePageBody>,
) -> ApiResult<Json<Page>> {
    Ok(Json(state.pages.update(&params.id, body).await?))
}

async fn remove_page(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
) -> ApiResult<Json<OkResponse>> {
    state.pages.remove(&params.id).await?;
    Ok(Json(OK_RESPONSE))
}

async fn read_content(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
) -> ApiResult<Json<PageContent>> {
    Ok(Json(state.pages.read_content(&params.id).await?))
}

async fn replace_content(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
    ValidatedJson(body): ValidatedJson<ReplacePageContentBody>,
) -> ApiResult<Json<Page>> {
    Ok(Json(state.pages.replace_content(&params.id, body).await?))
}

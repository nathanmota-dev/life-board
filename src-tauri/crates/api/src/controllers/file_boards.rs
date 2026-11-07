use axum::Json;
use axum::body::Body;
use axum::extract::State;
use axum::http::StatusCode;
use axum::http::header::{CACHE_CONTROL, CONTENT_LENGTH, CONTENT_TYPE};
use axum::response::{IntoResponse, Response};
use tokio_util::io::ReaderStream;

use super::RouteTable;
use crate::db::schema::file_boards::{FileBoard, FileItem};
use crate::dto::file_boards::{CreateBoardBody, UpdateBoardBody, UpdateItemBody};
use crate::dto::{IdParams, Items, OK_RESPONSE, OkResponse};
use crate::error::ApiResult;
use crate::extract::{UploadForm, ValidatedJson, ValidatedPath};
use crate::state::AppState;

pub fn routes(table: RouteTable) -> RouteTable {
    table
        .get("/file-boards", list_boards)
        .post("/file-boards", create_board)
        .patch("/file-boards/{id}", update_board)
        .delete("/file-boards/{id}", remove_board)
        .get("/file-boards/{id}/items", list_items)
        .post("/file-boards/{id}/items", upload_item)
        .patch("/file-items/{id}", update_item)
        .delete("/file-items/{id}", remove_item)
        .get("/file-items/{id}/file", download_item)
}

async fn list_boards(State(state): State<AppState>) -> ApiResult<Json<Items<FileBoard>>> {
    Ok(Json(Items { items: state.file_boards.list_boards().await? }))
}

async fn create_board(
    State(state): State<AppState>,
    ValidatedJson(body): ValidatedJson<CreateBoardBody>,
) -> ApiResult<(StatusCode, Json<FileBoard>)> {
    Ok((StatusCode::CREATED, Json(state.file_boards.create_board(body).await?)))
}

async fn update_board(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
    ValidatedJson(body): ValidatedJson<UpdateBoardBody>,
) -> ApiResult<Json<FileBoard>> {
    Ok(Json(state.file_boards.update_board(&params.id, body).await?))
}

async fn remove_board(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
) -> ApiResult<Json<OkResponse>> {
    state.file_boards.remove_board(&params.id).await?;
    Ok(Json(OK_RESPONSE))
}

async fn list_items(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
) -> ApiResult<Json<Items<FileItem>>> {
    Ok(Json(Items { items: state.file_boards.list_items(&params.id).await? }))
}

/// Multipart upload: the binary goes in the `file` field, metadata in plain fields.
async fn upload_item(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
    upload: UploadForm,
) -> ApiResult<(StatusCode, Json<FileItem>)> {
    let item = state.file_boards.add_item(&params.id, upload.file, upload.fields).await?;
    Ok((StatusCode::CREATED, Json(item)))
}

async fn update_item(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
    ValidatedJson(body): ValidatedJson<UpdateItemBody>,
) -> ApiResult<Json<FileItem>> {
    Ok(Json(state.file_boards.update_item(&params.id, body).await?))
}

async fn remove_item(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
) -> ApiResult<Json<OkResponse>> {
    state.file_boards.remove_item(&params.id).await?;
    Ok(Json(OK_RESPONSE))
}

async fn download_item(
    State(state): State<AppState>,
    ValidatedPath(params): ValidatedPath<IdParams>,
) -> ApiResult<Response> {
    let opened = state.file_boards.open_item_file(&params.id).await?;
    let headers = [
        (CONTENT_TYPE, opened.item.mime),
        (CONTENT_LENGTH, opened.size.to_string()),
        (CACHE_CONTROL, "private, max-age=3600".to_owned()),
    ];
    Ok((headers, Body::from_stream(ReaderStream::new(opened.file))).into_response())
}

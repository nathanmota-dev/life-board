//! Extractors that apply a [`Dto`] to the body, query string or path, and
//! reject with `ApiError` the way Fastify does: `400 validation_error` with the
//! issues, `FST_ERR_CTP_*` codes for unreadable bodies.

use std::collections::BTreeMap;

use axum::body::to_bytes;
use axum::extract::{FromRequest, FromRequestParts, Path, Query, Request};
use axum::http::StatusCode;
use axum::http::header::CONTENT_TYPE;
use axum::http::request::Parts;
use serde_json::{Map, Value};

use crate::dto::Dto;
use crate::dto::file_boards::UploadItemFields;
use crate::error::ApiError;
use crate::services::file_boards::UploadedFile;

/// Fastify's default `bodyLimit`.
pub const JSON_BODY_LIMIT: usize = 1024 * 1024;

/// A validated JSON body.
#[derive(Debug, Clone)]
pub struct ValidatedJson<T>(pub T);

/// A validated query string (values are strings; repeated keys become arrays).
#[derive(Debug, Clone)]
pub struct ValidatedQuery<T>(pub T);

/// Validated path parameters.
#[derive(Debug, Clone)]
pub struct ValidatedPath<T>(pub T);

fn validate<T: Dto>(input: &Value) -> Result<T, ApiError> {
    T::parse(input).map_err(ApiError::validation)
}

impl<T: Dto, S: Send + Sync> FromRequest<S> for ValidatedJson<T> {
    type Rejection = ApiError;

    async fn from_request(request: Request, _state: &S) -> Result<Self, Self::Rejection> {
        let content_type = request
            .headers()
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(|value| value.split(';').next().unwrap_or_default().trim().to_ascii_lowercase());
        let bytes = to_bytes(request.into_body(), JSON_BODY_LIMIT).await.map_err(|_| {
            ApiError::client(
                StatusCode::PAYLOAD_TOO_LARGE,
                Some("FST_ERR_CTP_BODY_TOO_LARGE"),
                "Request body is too large",
            )
        })?;
        let value = match content_type.as_deref() {
            // No body at all is `undefined`, which fails the schema like any non-object.
            None if bytes.is_empty() => Value::Null,
            Some("application/json") if bytes.is_empty() => {
                return Err(ApiError::client(
                    StatusCode::BAD_REQUEST,
                    Some("FST_ERR_CTP_EMPTY_JSON_BODY"),
                    "Body cannot be empty when content-type is set to 'application/json'",
                ));
            }
            Some("application/json") => serde_json::from_slice(&bytes).map_err(|error| {
                ApiError::client(StatusCode::BAD_REQUEST, Some("FST_ERR_CTP_INVALID_JSON_BODY"), error.to_string())
            })?,
            // @fastify/multipart accepts the body but leaves `request.body` unset.
            Some("multipart/form-data") => Value::Null,
            _ => {
                return Err(ApiError::client(
                    StatusCode::UNSUPPORTED_MEDIA_TYPE,
                    Some("FST_ERR_CTP_INVALID_MEDIA_TYPE"),
                    "Unsupported Media Type",
                ));
            }
        };
        validate(&value).map(Self)
    }
}

fn string_map(pairs: impl IntoIterator<Item = (String, String)>) -> Value {
    let mut grouped: BTreeMap<String, Vec<String>> = BTreeMap::new();
    for (key, value) in pairs {
        grouped.entry(key).or_default().push(value);
    }
    let map: Map<String, Value> = grouped
        .into_iter()
        .map(|(key, mut values)| {
            let value = match values.len() {
                1 => Value::String(values.remove(0)),
                _ => Value::Array(values.into_iter().map(Value::String).collect()),
            };
            (key, value)
        })
        .collect();
    Value::Object(map)
}

impl<T: Dto, S: Send + Sync> FromRequestParts<S> for ValidatedQuery<T> {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let Query(pairs) = Query::<Vec<(String, String)>>::try_from_uri(&parts.uri)
            .map_err(|error| ApiError::client(StatusCode::BAD_REQUEST, None, error.to_string()))?;
        validate(&string_map(pairs)).map(Self)
    }
}

impl<T: Dto, S: Send + Sync> FromRequestParts<S> for ValidatedPath<T> {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let Path(pairs) = Path::<Vec<(String, String)>>::from_request_parts(parts, state)
            .await
            .map_err(|error| ApiError::client(StatusCode::BAD_REQUEST, None, error.to_string()))?;
        validate(&string_map(pairs)).map(Self)
    }
}

/// The multipart upload of `POST /file-boards/:id/items`: the binary in the
/// `file` field (`400 missing_file` without it), metadata in plain fields
/// (`400 validation_error`), and `413` past `MAX_UPLOAD_BYTES`.
#[derive(Debug, Clone)]
pub struct UploadForm {
    pub file: UploadedFile,
    pub fields: UploadItemFields,
}

impl<S: Send + Sync> FromRequest<S> for UploadForm {
    type Rejection = ApiError;

    async fn from_request(request: Request, state: &S) -> Result<Self, Self::Rejection> {
        pending!(52, request, state)
    }
}

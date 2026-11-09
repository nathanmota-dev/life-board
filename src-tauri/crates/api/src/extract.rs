//! Extractors that apply a [`Dto`] to the body, query string or path, and
//! reject with `ApiError` the way Fastify does: `400 validation_error` with the
//! issues, `FST_ERR_CTP_*` codes for unreadable bodies.

use std::collections::BTreeMap;

use axum::body::{HttpBody, to_bytes};
use axum::extract::multipart::Field;
use axum::extract::{FromRequest, FromRequestParts, Multipart, Path, Query, Request};
use axum::http::header::{CONTENT_DISPOSITION, CONTENT_TYPE};
use axum::http::request::Parts;
use axum::http::{HeaderMap, StatusCode};
use serde_json::{Map, Value};

use crate::dto::Dto;
use crate::dto::file_boards::{MAX_UPLOAD_BYTES, UploadItemFields};
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

/// The essence of `Content-Type`, lowercased, without parameters.
fn content_type(headers: &HeaderMap) -> Option<String> {
    headers
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.split(';').next().unwrap_or_default().trim().to_ascii_lowercase())
}

/// What Fastify's content-type parsers leave in `request.body`.
async fn read_body(request: Request) -> Result<Value, ApiError> {
    let content_type = content_type(request.headers());
    let bytes = to_bytes(request.into_body(), JSON_BODY_LIMIT).await.map_err(|_| {
        ApiError::client(StatusCode::PAYLOAD_TOO_LARGE, Some("FST_ERR_CTP_BODY_TOO_LARGE"), "Request body is too large")
    })?;
    match content_type.as_deref() {
        // No body at all is `undefined`, which fails the schema like any non-object.
        None if bytes.is_empty() => Ok(Value::Null),
        Some("application/json") if bytes.is_empty() => Err(ApiError::client(
            StatusCode::BAD_REQUEST,
            Some("FST_ERR_CTP_EMPTY_JSON_BODY"),
            "Body cannot be empty when content-type is set to 'application/json'",
        )),
        Some("application/json") => serde_json::from_slice(&bytes).map_err(|_| {
            ApiError::client(
                StatusCode::BAD_REQUEST,
                Some("FST_ERR_CTP_INVALID_JSON_BODY"),
                "Body is not valid JSON but content-type is set to 'application/json'",
            )
        }),
        // Fastify's other default parser: a string, which fails any object schema.
        Some("text/plain") => Ok(Value::String(String::from_utf8_lossy(&bytes).into_owned())),
        // A multipart body is accepted here and read by `UploadForm`.
        Some("multipart/form-data") => Ok(Value::Null),
        _ => Err(ApiError::client(
            StatusCode::UNSUPPORTED_MEDIA_TYPE,
            Some("FST_ERR_CTP_INVALID_MEDIA_TYPE"),
            "Unsupported Media Type",
        )),
    }
}

impl<T: Dto, S: Send + Sync> FromRequest<S> for ValidatedJson<T> {
    type Rejection = ApiError;

    async fn from_request(request: Request, _state: &S) -> Result<Self, Self::Rejection> {
        validate(&read_body(request).await?).map(Self)
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

/// The multipart upload of `POST /file-boards/:id/items`: the first file part
/// (`400 missing_file` without one), metadata in plain fields
/// (`400 validation_error`), and `413` past `MAX_UPLOAD_BYTES`.
#[derive(Debug, Clone)]
pub struct UploadForm {
    pub file: UploadedFile,
    pub fields: UploadItemFields,
}

/// Limits of the multipart parser, unchanged since the Node API.
const MAX_PARTS: usize = 1000;
const MAX_FIELD_BYTES: usize = 1024 * 1024;

/// Field names that were refused in the Node API (`name in Object.prototype`).
const OBJECT_PROTOTYPE_KEYS: [&str; 12] = [
    "__proto__",
    "__defineGetter__",
    "__defineSetter__",
    "__lookupGetter__",
    "__lookupSetter__",
    "constructor",
    "hasOwnProperty",
    "isPrototypeOf",
    "propertyIsEnumerable",
    "toLocaleString",
    "toString",
    "valueOf",
];

fn missing_file() -> ApiError {
    ApiError::bad_request("missing_file", "The \"file\" field is required.")
}

fn too_large(code: &str, message: &str) -> ApiError {
    ApiError::client(StatusCode::PAYLOAD_TOO_LARGE, Some(code), message)
}

fn unreadable(error: impl std::fmt::Display) -> ApiError {
    ApiError::internal(error.to_string())
}

/// busboy's `basename`: both separators on every OS, and `.`/`..` count as empty.
fn busboy_basename(path: &str) -> String {
    let name = path.rsplit(['/', '\\']).next().unwrap_or_default();
    if name == "." || name == ".." { String::new() } else { name.to_owned() }
}

/// busboy's type of a part: lowercase, without parameters, `text/plain` by default.
fn part_type(part: &Field<'_>) -> String {
    let essence = part
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.split(';').next().unwrap_or_default().trim().to_ascii_lowercase())
        .unwrap_or_default();
    if essence.is_empty() { "text/plain".to_owned() } else { essence }
}

/// busboy skips parts that don't say `Content-Disposition: form-data`.
fn is_form_data(part: &Field<'_>) -> bool {
    // Read as bytes: browsers send non-ASCII file names as raw UTF-8 in this header.
    part.headers()
        .get(CONTENT_DISPOSITION)
        .and_then(|value| value.as_bytes().split(|byte| *byte == b';').next())
        .is_some_and(|kind| kind.trim_ascii().eq_ignore_ascii_case(b"form-data"))
}

async fn read_file(part: &mut Field<'_>) -> Result<Vec<u8>, ApiError> {
    let mut bytes = Vec::new();
    while let Some(chunk) = part.chunk().await.map_err(unreadable)? {
        if bytes.len() + chunk.len() > MAX_UPLOAD_BYTES {
            return Err(too_large("FST_REQ_FILE_TOO_LARGE", "request file too large"));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(bytes)
}

/// The text of a field, cut at busboy's `fieldSize`, and whether it was cut.
async fn read_field(part: &mut Field<'_>) -> Result<(String, bool), ApiError> {
    let mut bytes = Vec::new();
    let mut truncated = false;
    while let Some(chunk) = part.chunk().await.map_err(unreadable)? {
        let room = MAX_FIELD_BYTES - bytes.len();
        truncated |= chunk.len() > room;
        bytes.extend_from_slice(&chunk[..chunk.len().min(room)]);
    }
    Ok((String::from_utf8_lossy(&bytes).into_owned(), truncated))
}

/// `upload.fields`: a name sent twice becomes an array, which the controller drops.
#[derive(Default)]
struct FormFields(BTreeMap<String, Option<Value>>);

impl FormFields {
    fn add(&mut self, name: String, value: Option<Value>) {
        self.0.entry(name).and_modify(|slot| *slot = None).or_insert(value);
    }

    fn into_json(self) -> Value {
        Value::Object(self.0.into_iter().filter_map(|(name, value)| Some((name, value?))).collect::<Map<_, _>>())
    }
}

/// A file whose name may be missing: busboy also treats a nameless
/// `application/octet-stream` part as a file, and Node then fails in `extname`.
struct ReceivedFile {
    bytes: Vec<u8>,
    filename: Option<String>,
    mime: String,
}

impl<S: Send + Sync> FromRequest<S> for UploadForm {
    type Rejection = ApiError;

    async fn from_request(request: Request, state: &S) -> Result<Self, Self::Rejection> {
        if content_type(request.headers()).as_deref() != Some("multipart/form-data") {
            read_body(request).await?;
            return Err(missing_file());
        }
        let empty_body = request.body().is_end_stream();
        let mut multipart = Multipart::from_request(request, state).await.map_err(unreadable)?;
        if empty_body {
            return Err(missing_file());
        }

        let mut fields = FormFields::default();
        let mut file: Option<ReceivedFile> = None;
        // `onError`: only reaches the client when the form ends without a file.
        let mut deferred: Option<ApiError> = None;
        let (mut parts, mut files) = (0, 0);
        loop {
            let mut part = match multipart.next_field().await {
                Ok(Some(part)) => part,
                Ok(None) => break,
                // Node stops reading the form once it has the file.
                Err(_) if file.is_some() => break,
                Err(error) => return Err(unreadable(error)),
            };
            parts += 1;
            if parts > MAX_PARTS {
                if file.is_some() {
                    break;
                }
                return Err(too_large("FST_PARTS_LIMIT", "reach parts limit"));
            }
            if !is_form_data(&part) {
                continue;
            }
            let name = part.name().map(str::to_owned);
            let is_prototype_key = name.as_deref().is_some_and(|name| OBJECT_PROTOTYPE_KEYS.contains(&name));
            let filename = part.file_name().map(busboy_basename);
            let mime = part_type(&part);

            if filename.is_some() || mime == "application/octet-stream" {
                files += 1;
                if files > 1 {
                    continue;
                }
                if is_prototype_key {
                    deferred = Some(prototype_violation());
                    continue;
                }
                let bytes = read_file(&mut part).await?;
                if let Some(name) = name {
                    fields.add(name, None);
                }
                file = Some(ReceivedFile { bytes, filename, mime });
                continue;
            }

            let (text, truncated) = read_field(&mut part).await?;
            if is_prototype_key {
                deferred = Some(prototype_violation());
                continue;
            }
            let value = if mime.starts_with("application/json") {
                match serde_json::from_str(&text) {
                    Ok(value) if !truncated => value,
                    _ => {
                        deferred = Some(ApiError::client(
                            StatusCode::NOT_ACCEPTABLE,
                            Some("FST_INVALID_JSON_FIELD_ERROR"),
                            "a request field is not a valid JSON as declared by its Content-Type",
                        ));
                        continue;
                    }
                }
            } else {
                Value::String(text)
            };
            if let Some(name) = name {
                fields.add(name, Some(value));
            }
        }

        let Some(ReceivedFile { bytes, filename, mime }) = file else {
            return Err(deferred.unwrap_or_else(missing_file));
        };
        let fields = UploadItemFields::parse(&fields.into_json()).map_err(|issues| {
            let message: Vec<String> = issues.iter().map(|issue| format!("{} {}", issue.path, issue.message)).collect();
            ApiError::bad_request("validation_error", message.join(", "))
        })?;
        let filename = filename.ok_or_else(|| unreadable("The uploaded file has no name."))?;
        Ok(Self { file: UploadedFile { bytes, filename, mime }, fields })
    }
}

fn prototype_violation() -> ApiError {
    ApiError::client(
        StatusCode::BAD_REQUEST,
        Some("FST_PROTO_VIOLATION"),
        "prototype property is not allowed as field name",
    )
}

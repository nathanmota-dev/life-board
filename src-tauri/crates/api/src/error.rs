//! `ApiError` and its JSON body: the Rust side of `services/errors.ts` and
//! `plugins/error-handler.ts`.

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde::Serialize;

pub type ApiResult<T> = Result<T, ApiError>;

/// One failed rule of a request DTO. `path` is a JSON pointer (`/title`, `/items/1`),
/// and `/` for the body itself.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Issue {
    pub path: String,
    pub message: String,
}

impl Issue {
    pub fn new(path: impl Into<String>, message: impl Into<String>) -> Self {
        let path = path.into();
        Self { path: if path.is_empty() { "/".to_owned() } else { path }, message: message.into() }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    /// `HttpError` and its subclasses: `{ error: code, message }` with their own status.
    #[error("{message}")]
    Http { status: StatusCode, code: String, message: String },
    /// Framework errors below 500 (body too large, invalid JSON): passed through,
    /// with `bad_request` when they carry no code.
    #[error("{message}")]
    Client { status: StatusCode, code: Option<String>, message: String },
    /// `400 { error: "validation_error", message, issues }`.
    #[error("{message}")]
    Validation { message: String, issues: Vec<Issue> },
    /// Anything unexpected: logged, then `500 internal_error`.
    #[error(transparent)]
    Internal(Box<dyn std::error::Error + Send + Sync>),
}

impl ApiError {
    pub fn http(status: StatusCode, code: impl Into<String>, message: impl Into<String>) -> Self {
        Self::Http { status, code: code.into(), message: message.into() }
    }

    /// `NotFoundError`.
    pub fn not_found(message: impl Into<String>) -> Self {
        Self::http(StatusCode::NOT_FOUND, "not_found", message)
    }

    /// `BadRequestError`.
    pub fn bad_request(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self::http(StatusCode::BAD_REQUEST, code, message)
    }

    pub fn client(status: StatusCode, code: Option<&str>, message: impl Into<String>) -> Self {
        Self::Client { status, code: code.map(str::to_owned), message: message.into() }
    }

    pub fn validation(issues: Vec<Issue>) -> Self {
        let message =
            issues.iter().map(|issue| format!("{} {}", issue.path, issue.message)).collect::<Vec<_>>().join(", ");
        Self::Validation { message, issues }
    }

    pub fn internal(error: impl Into<Box<dyn std::error::Error + Send + Sync>>) -> Self {
        Self::Internal(error.into())
    }

    pub fn status(&self) -> StatusCode {
        match self {
            Self::Http { status, .. } | Self::Client { status, .. } => *status,
            Self::Validation { .. } => StatusCode::BAD_REQUEST,
            Self::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    /// The `error` field of the response body.
    pub fn code(&self) -> &str {
        match self {
            Self::Http { code, .. } => code,
            Self::Client { code, .. } => code.as_deref().unwrap_or("bad_request"),
            Self::Validation { .. } => "validation_error",
            Self::Internal(_) => "internal_error",
        }
    }

    pub fn is_not_found(&self) -> bool {
        matches!(self, Self::Http { status, .. } if *status == StatusCode::NOT_FOUND)
    }

    pub fn is_bad_request(&self) -> bool {
        matches!(self, Self::Http { status, .. } if *status == StatusCode::BAD_REQUEST)
    }
}

impl IntoResponse for ApiError {
    /// `{ error, message }`, plus `issues` for validation errors; 5xx bodies are
    /// `{ error: "internal_error", message: "Something went wrong." }` and get logged.
    fn into_response(self) -> Response {
        let status = self.status();
        let body = match &self {
            Self::Validation { message, issues } => {
                serde_json::json!({ "error": "validation_error", "message": message, "issues": issues })
            }
            Self::Http { code, message, .. } => serde_json::json!({ "error": code, "message": message }),
            Self::Client { message, .. } if status.is_client_error() => {
                serde_json::json!({ "error": self.code(), "message": message })
            }
            Self::Client { .. } | Self::Internal(_) => {
                tracing::error!(error = %self, "request failed");
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    axum::Json(serde_json::json!({ "error": "internal_error", "message": "Something went wrong." })),
                )
                    .into_response();
            }
        };
        (status, axum::Json(body)).into_response()
    }
}

impl From<crate::db::DbError> for ApiError {
    fn from(error: crate::db::DbError) -> Self {
        Self::internal(error)
    }
}

impl From<rusqlite::Error> for ApiError {
    fn from(error: rusqlite::Error) -> Self {
        Self::internal(error)
    }
}

impl From<std::io::Error> for ApiError {
    fn from(error: std::io::Error) -> Self {
        Self::internal(error)
    }
}

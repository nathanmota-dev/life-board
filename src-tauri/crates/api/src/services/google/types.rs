use axum::http::StatusCode;
use chrono::TimeDelta;
use serde::Serialize;

use crate::db::columns::{Timestamp, js_date, js_date_opt};
use crate::error::ApiError;
use crate::services::google_auth_client::GoogleAuthError;

pub const SETTINGS_ID: &str = "default";
/// Where Google sends the browser back, under the sidecar's own address.
pub const CALLBACK_PATH: &str = "/api/google/oauth/callback";
/// How long a started connection waits for Google's answer.
pub const FLOW_TTL: TimeDelta = TimeDelta::minutes(10);
/// An access token this close to expiring is refreshed first.
pub const REFRESH_MARGIN: TimeDelta = TimeDelta::seconds(60);
/// Used when Google doesn't say how long an access token lasts.
pub const DEFAULT_TOKEN_LIFETIME: TimeDelta = TimeDelta::hours(1);

/// `GET /google/status`. Never carries a secret.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleStatus {
    /// A refresh token is stored.
    pub connected: bool,
    pub email: Option<String>,
    pub has_credentials: bool,
    /// A connection started in the browser is waiting for Google's answer.
    pub pending: bool,
    /// Google refused the stored refresh token; connecting again fixes it.
    pub reauth_required: bool,
    #[serde(with = "js_date_opt")]
    pub last_sync_at: Option<Timestamp>,
    pub last_sync_error: Option<String>,
    /// Changes made in Life Board that Google doesn't have yet.
    pub pending_changes: i64,
    /// The last time the Google version of an event won over a change made here.
    pub last_conflict: Option<ConflictNotice>,
}

/// An event whose local change was dropped because Google had a newer one.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictNotice {
    pub title: String,
    #[serde(with = "js_date")]
    pub at: Timestamp,
}

/// `POST /google/connect`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GoogleConnectStart {
    pub auth_url: String,
}

/// Why `access_token()` has no token to give.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum GoogleTokenError {
    #[error("Google Calendar is not connected.")]
    NotConnected,
    #[error("Google refused the stored authorization. Connect the account again.")]
    ReauthRequired,
    #[error("Google could not be reached: {0}")]
    Network(String),
    #[error("{0}")]
    Google(String),
}

impl From<GoogleAuthError> for GoogleTokenError {
    fn from(error: GoogleAuthError) -> Self {
        match error {
            GoogleAuthError::Network(message) => Self::Network(message),
            other => Self::Google(other.to_string()),
        }
    }
}

impl From<GoogleTokenError> for ApiError {
    fn from(error: GoogleTokenError) -> Self {
        let code = match error {
            GoogleTokenError::NotConnected => "google_not_connected",
            GoogleTokenError::ReauthRequired => "reauth_required",
            GoogleTokenError::Network(_) | GoogleTokenError::Google(_) => {
                return unavailable(error);
            }
        };
        ApiError::bad_request(code, error.to_string())
    }
}

/// `502 google_unavailable`.
pub fn unavailable(error: impl std::fmt::Display) -> ApiError {
    ApiError::http(StatusCode::BAD_GATEWAY, "google_unavailable", error.to_string())
}

/// A failed code exchange or account lookup during `finish_connect`.
pub fn connect_error(error: GoogleAuthError) -> ApiError {
    match error {
        GoogleAuthError::InvalidGrant => {
            ApiError::bad_request("invalid_grant", "Google refused the authorization code. Connect again.")
        }
        GoogleAuthError::InvalidClient(_) => {
            ApiError::bad_request("invalid_credentials", "Google refused the client ID or secret.")
        }
        other => unavailable(other),
    }
}

/// The browser's answer to the consent page, as the callback receives it.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct OAuthCallback {
    pub code: Option<String>,
    pub state: Option<String>,
    pub error: Option<String>,
}

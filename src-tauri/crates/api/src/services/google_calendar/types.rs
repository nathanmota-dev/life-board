use serde::Serialize;

use crate::services::google::GoogleTokenError;

/// What one sync changed. `POST /google/sync` answers with it.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct SyncResult {
    pub imported: usize,
    pub updated: usize,
    pub removed: usize,
}

/// Why a sync stopped. Cloneable, so callers that waited for the same sync get the same answer.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SyncFailure {
    NotConnected,
    /// Google refused the stored authorization.
    ReauthRequired,
    /// Google failed or couldn't be reached; the message is safe to show.
    Google(String),
    Internal(String),
}

impl From<crate::db::DbError> for SyncFailure {
    fn from(error: crate::db::DbError) -> Self {
        Self::Internal(error.to_string())
    }
}

impl SyncFailure {
    pub(super) fn from_token(error: GoogleTokenError) -> Self {
        match error {
            GoogleTokenError::NotConnected => Self::NotConnected,
            GoogleTokenError::ReauthRequired => Self::ReauthRequired,
            GoogleTokenError::Network(message) | GoogleTokenError::Google(message) => Self::Google(message),
        }
    }
}

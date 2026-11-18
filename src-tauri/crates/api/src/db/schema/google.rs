use crate::db::columns::{Timestamp, get_timestamp, get_timestamp_opt};
use crate::services::crypto::SealedSecret;

/// Single row (id = "default"), present once the OAuth client credentials are saved.
/// The client ID, client secret and refresh token are sealed with AES-256-GCM; the
/// row has no `Serialize` so none of them can reach a response by accident.
#[derive(Debug, Clone, PartialEq)]
pub struct GoogleSettings {
    pub id: String,
    /// The primary calendar's id, set once an account is connected.
    pub email: Option<String>,
    pub client_id: SealedSecret,
    pub client_secret: SealedSecret,
    /// `None` before connecting, after disconnecting or once Google refused it.
    pub refresh_token: Option<SealedSecret>,
    pub calendar_id: String,
    pub last_sync_at: Option<Timestamp>,
    pub last_sync_error: Option<String>,
    pub created_at: Timestamp,
    pub updated_at: Timestamp,
}

fn sealed(row: &rusqlite::Row<'_>, prefix: &str) -> rusqlite::Result<SealedSecret> {
    Ok(SealedSecret {
        ciphertext: row.get(format!("{prefix}_ciphertext").as_str())?,
        iv: row.get(format!("{prefix}_iv").as_str())?,
        tag: row.get(format!("{prefix}_tag").as_str())?,
    })
}

fn sealed_opt(row: &rusqlite::Row<'_>, prefix: &str) -> rusqlite::Result<Option<SealedSecret>> {
    let ciphertext: Option<String> = row.get(format!("{prefix}_ciphertext").as_str())?;
    let iv: Option<String> = row.get(format!("{prefix}_iv").as_str())?;
    let tag: Option<String> = row.get(format!("{prefix}_tag").as_str())?;
    Ok(match (ciphertext, iv, tag) {
        (Some(ciphertext), Some(iv), Some(tag)) => Some(SealedSecret { ciphertext, iv, tag }),
        _ => None,
    })
}

impl GoogleSettings {
    pub fn from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Self> {
        let (created_at, updated_at) = (get_timestamp(row, "created_at")?, get_timestamp(row, "updated_at")?);
        Ok(Self {
            id: row.get("id")?,
            email: row.get("email")?,
            client_id: sealed(row, "client_id")?,
            client_secret: sealed(row, "client_secret")?,
            refresh_token: sealed_opt(row, "refresh_token")?,
            calendar_id: row.get("calendar_id")?,
            last_sync_error: row.get("last_sync_error")?,
            last_sync_at: get_timestamp_opt(row, "last_sync_at")?,
            created_at,
            updated_at,
        })
    }
}

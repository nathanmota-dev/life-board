//! The `google_settings` row. Every write stamps `updated_at`.

use rusqlite::{OptionalExtension, params};

use super::SETTINGS_ID;
use crate::db::Db;
use crate::db::columns::{Timestamp, to_millis};
use crate::db::schema::google::GoogleSettings;
use crate::error::ApiResult;
use crate::services::crypto::SealedSecret;

pub async fn find(db: &Db) -> ApiResult<Option<GoogleSettings>> {
    Ok(db
        .call(|conn| {
            conn.query_row("SELECT * FROM google_settings WHERE id = ?", [SETTINGS_ID], GoogleSettings::from_row)
                .optional()
        })
        .await?)
}

/// Creates the row, or replaces the client of an existing one.
pub async fn save_credentials(
    db: &Db,
    client_id: SealedSecret,
    client_secret: SealedSecret,
    now: Timestamp,
) -> ApiResult<()> {
    db.call(move |conn| {
        conn.execute(
            "INSERT INTO google_settings (id, client_id_ciphertext, client_id_iv, client_id_tag, client_secret_ciphertext, client_secret_iv, client_secret_tag, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8) ON CONFLICT(id) DO UPDATE SET client_id_ciphertext = excluded.client_id_ciphertext, client_id_iv = excluded.client_id_iv, client_id_tag = excluded.client_id_tag, client_secret_ciphertext = excluded.client_secret_ciphertext, client_secret_iv = excluded.client_secret_iv, client_secret_tag = excluded.client_secret_tag, updated_at = excluded.updated_at",
            params![
                SETTINGS_ID,
                client_id.ciphertext,
                client_id.iv,
                client_id.tag,
                client_secret.ciphertext,
                client_secret.iv,
                client_secret.tag,
                to_millis(now)
            ],
        )
    })
    .await?;
    Ok(())
}

/// Stores the account and its sealed refresh token, or only replaces the token
/// (`email: None`) when Google hands out a new one on refresh.
pub async fn save_refresh_token(
    db: &Db,
    email: Option<String>,
    refresh_token: SealedSecret,
    now: Timestamp,
) -> ApiResult<()> {
    db.call(move |conn| {
        conn.execute(
            "UPDATE google_settings SET email = COALESCE(?1, email), refresh_token_ciphertext = ?2, refresh_token_iv = ?3, refresh_token_tag = ?4, updated_at = ?5 WHERE id = ?6",
            params![email, refresh_token.ciphertext, refresh_token.iv, refresh_token.tag, to_millis(now), SETTINGS_ID],
        )
    })
    .await?;
    Ok(())
}

/// Drops the refresh token. `forget_account` also clears the email and the sync
/// state (disconnect); otherwise the email stays so Settings can offer Reconnect.
pub async fn clear_refresh_token(db: &Db, forget_account: bool, now: Timestamp) -> ApiResult<()> {
    let sql = if forget_account {
        "UPDATE google_settings SET email = NULL, refresh_token_ciphertext = NULL, refresh_token_iv = NULL, refresh_token_tag = NULL, last_sync_at = NULL, last_sync_error = NULL, updated_at = ?1 WHERE id = ?2"
    } else {
        "UPDATE google_settings SET refresh_token_ciphertext = NULL, refresh_token_iv = NULL, refresh_token_tag = NULL, updated_at = ?1 WHERE id = ?2"
    };
    db.call(move |conn| conn.execute(sql, params![to_millis(now), SETTINGS_ID])).await?;
    Ok(())
}

pub async fn delete(db: &Db) -> ApiResult<()> {
    db.call(|conn| conn.execute("DELETE FROM google_settings", [])).await?;
    Ok(())
}

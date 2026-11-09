mod types;
pub use types::*;
mod buckets;
pub use buckets::repo_from_url;
use buckets::*;
mod sync;

use crate::clock;
use std::sync::Arc;

use axum::http::StatusCode;
use rusqlite::OptionalExtension;
use rusqlite::types::Value;

use crate::db::Db;
use crate::db::columns::to_millis;
use crate::db::schema::github::{GithubIssue, GithubPr, GithubSettings};
use crate::dto::github::{ConnectGithubBody, ListIssuesQuery, ListPrsQuery, RecentReposQuery};
use crate::error::{ApiError, ApiResult};
use crate::services::crypto::{CryptoError, CryptoService, SealedSecret};
use crate::services::github_client::{CONTRIBUTION_LEVELS, GithubApi};
use crate::services::query::{enum_opt, query_all};

#[derive(Clone)]
pub struct GithubService {
    db: Db,
    client: Arc<dyn GithubApi>,
    crypto: CryptoService,
    logger: Arc<dyn SyncLogger>,
}

impl GithubService {
    pub fn new(db: Db, client: Arc<dyn GithubApi>, crypto: CryptoService, logger: Arc<dyn SyncLogger>) -> Self {
        Self { db, client, crypto, logger }
    }

    /// Also read by the `startServer` tests (#51).
    pub async fn status(&self) -> ApiResult<GithubStatus> {
        Ok(match self.find_settings().await? {
            Some(settings) => GithubStatus {
                connected: true,
                login: Some(settings.login),
                last_sync_at: settings.last_sync_at,
                last_sync_error: settings.last_sync_error,
            },
            None => GithubStatus { connected: false, login: None, last_sync_at: None, last_sync_error: None },
        })
    }

    /// Checks the token with GitHub (`400 invalid_token`), then stores it sealed.
    pub async fn connect(&self, input: ConnectGithubBody) -> ApiResult<GithubConnected> {
        let ConnectGithubBody { token, org_filter } = input;
        // Check the token before storing it, so a typo fails fast.
        let login = self
            .client
            .get_login(&token)
            .await
            .map_err(|error| ApiError::bad_request("invalid_token", error.message))?;
        let sealed = self.crypto.seal(&token).map_err(ApiError::internal)?;

        let stored_login = login.clone();
        self.db
            .call(move |conn| {
                let now = to_millis(clock::now());
                conn.execute(
                    "INSERT INTO github_settings (id, login, org_filter, token_ciphertext, token_iv, token_tag, last_sync_error, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, ?7, ?7) ON CONFLICT(id) DO UPDATE SET login = excluded.login, org_filter = excluded.org_filter, token_ciphertext = excluded.token_ciphertext, token_iv = excluded.token_iv, token_tag = excluded.token_tag, last_sync_error = NULL, updated_at = excluded.updated_at",
                    rusqlite::params![
                        SETTINGS_ID,
                        stored_login,
                        org_filter.flatten(),
                        sealed.ciphertext,
                        sealed.iv,
                        sealed.tag,
                        now
                    ],
                )
            })
            .await?;
        Ok(GithubConnected { connected: true, login })
    }

    /// Deletes the settings row and the cached PRs and issues.
    pub async fn disconnect(&self) -> ApiResult<()> {
        self.db
            .call(|conn| {
                let tx = conn.transaction()?;
                tx.execute("DELETE FROM github_settings", [])?;
                tx.execute("DELETE FROM github_prs", [])?;
                tx.execute("DELETE FROM github_issues", [])?;
                tx.commit()
            })
            .await?;
        Ok(())
    }

    /// `400 not_connected`; `502 sync_failed` after recording `lastSyncError`.
    pub async fn sync(&self) -> ApiResult<SyncResult> {
        let settings = self.require_settings().await?;
        match self.run_sync(&settings).await {
            Ok((count, issues)) => Ok(SyncResult { ok: true, count, issues, login: settings.login }),
            Err(error) => {
                // Keep the reason so the UI can show why the last sync failed.
                let message = error.to_string();
                let recorded = message.clone();
                self.db
                    .call(move |conn| {
                        conn.execute(
                            "UPDATE github_settings SET last_sync_error = ?, updated_at = ? WHERE id = ?",
                            rusqlite::params![recorded, to_millis(clock::now()), SETTINGS_ID],
                        )
                    })
                    .await?;
                Err(ApiError::http(StatusCode::BAD_GATEWAY, "sync_failed", message))
            }
        }
    }

    /// `400 not_connected`; `502 github_unavailable`.
    pub async fn contributions(&self) -> ApiResult<Contributions> {
        let settings = self.require_settings().await?;
        let token = self.open_token(&settings).map_err(unavailable)?;
        let calendar = self.client.get_contributions(&token, &settings.login).await.map_err(unavailable)?;
        let days = calendar
            .weeks
            .into_iter()
            .flat_map(|week| week.contribution_days)
            .map(|day| ContributionDay {
                level: CONTRIBUTION_LEVELS.iter().position(|level| *level == day.contribution_level).map_or(0, to_i64),
                date: day.date,
                count: day.contribution_count,
            })
            .collect();
        Ok(Contributions { login: settings.login, total: calendar.total_contributions, days })
    }

    /// `400 not_connected`; `502 github_unavailable`.
    pub async fn recent_repos(&self, query: RecentReposQuery) -> ApiResult<Vec<RecentRepo>> {
        let settings = self.require_settings().await?;
        let token = self.open_token(&settings).map_err(unavailable)?;
        let first = usize::try_from(query.limit).unwrap_or(0);
        let repos = self.client.get_contributed_repos(&token, &settings.login, first).await.map_err(unavailable)?;
        Ok(repos
            .into_iter()
            .map(|entry| {
                let repo = entry.repository;
                let (language, language_color) =
                    repo.primary_language.map_or((None, None), |language| (Some(language.name), language.color));
                RecentRepo {
                    full_name: repo.name_with_owner,
                    url: repo.url,
                    description: repo.description,
                    private: repo.is_private,
                    last_contributed_at: entry.last_contributed_at,
                    stars: repo.stargazer_count,
                    language,
                    language_color,
                }
            })
            .collect())
    }

    /// Most recently updated first.
    pub async fn list_prs(&self, query: ListPrsQuery) -> ApiResult<Vec<GithubPr>> {
        self.list_rows("github_prs", enum_opt(query.kind), query.limit, GithubPr::from_row).await
    }

    /// Most recently updated first.
    pub async fn list_issues(&self, query: ListIssuesQuery) -> ApiResult<Vec<GithubIssue>> {
        self.list_rows("github_issues", enum_opt(query.kind), query.limit, GithubIssue::from_row).await
    }

    async fn list_rows<T: Send + 'static>(
        &self,
        table: &'static str,
        kind: Value,
        limit: i64,
        map: fn(&rusqlite::Row<'_>) -> rusqlite::Result<T>,
    ) -> ApiResult<Vec<T>> {
        let sql =
            format!("SELECT * FROM {table} WHERE (?1 IS NULL OR kind = ?1) ORDER BY updated_at DESC, id ASC LIMIT ?2");
        Ok(self.db.call(move |conn| query_all(conn, &sql, &[kind, Value::Integer(limit)], map)).await?)
    }

    fn open_token(&self, settings: &GithubSettings) -> Result<String, CryptoError> {
        self.crypto.open(&SealedSecret {
            ciphertext: settings.token_ciphertext.clone(),
            iv: settings.token_iv.clone(),
            tag: settings.token_tag.clone(),
        })
    }

    async fn find_settings(&self) -> ApiResult<Option<GithubSettings>> {
        Ok(self
            .db
            .call(|conn| {
                conn.query_row("SELECT * FROM github_settings WHERE id = ?", [SETTINGS_ID], GithubSettings::from_row)
                    .optional()
            })
            .await?)
    }

    async fn require_settings(&self) -> ApiResult<GithubSettings> {
        self.find_settings().await?.ok_or_else(|| ApiError::bad_request("not_connected", "GitHub is not connected."))
    }
}

fn unavailable(error: impl std::fmt::Display) -> ApiError {
    ApiError::http(StatusCode::BAD_GATEWAY, "github_unavailable", error.to_string())
}

//! The Google account connection: OAuth 2.0 authorization code with PKCE, the
//! login in the user's default browser and the redirect back to this sidecar on
//! loopback. The client credentials and the refresh token are sealed at rest; the
//! pending flow and the access token live only in memory.

mod store;
mod types;
pub use types::*;

use std::future::Future;
use std::sync::Arc;

use tokio::sync::Mutex;

use crate::clock;
use crate::db::Db;
use crate::db::columns::Timestamp;
use crate::db::schema::calendar::forget_google;
use crate::db::schema::google::GoogleSettings;
use crate::dto::google::SaveGoogleCredentialsBody;
use crate::error::{ApiError, ApiResult};
use crate::services::crypto::{CryptoService, SealedSecret};
use crate::services::google_auth_client::{
    CodeGrant, GoogleAuthApi, GoogleAuthError, GoogleCredentials, GoogleTokens, authorization_url, new_flow_secrets,
};

/// The clock the expiries follow; tests replace it.
pub type Now = Arc<dyn Fn() -> Timestamp + Send + Sync>;

/// A connection waiting for the browser. Single use: a matching callback consumes it.
struct PendingFlow {
    state: String,
    code_verifier: String,
    redirect_uri: String,
    expires_at: Timestamp,
}

struct CachedToken {
    token: String,
    expires_at: Timestamp,
}

#[derive(Clone)]
pub struct GoogleService {
    db: Db,
    client: Arc<dyn GoogleAuthApi>,
    crypto: CryptoService,
    now: Now,
    pending: Arc<Mutex<Option<PendingFlow>>>,
    /// Also serializes refreshes, so concurrent callers share one.
    access: Arc<Mutex<Option<CachedToken>>>,
    /// Kept in memory: it only tells the user once, and resets with the app.
    conflict: Arc<std::sync::Mutex<Option<ConflictNotice>>>,
}

impl GoogleService {
    pub fn new(db: Db, client: Arc<dyn GoogleAuthApi>, crypto: CryptoService) -> Self {
        Self::with_clock(db, client, crypto, Arc::new(clock::now))
    }

    pub fn with_clock(db: Db, client: Arc<dyn GoogleAuthApi>, crypto: CryptoService, now: Now) -> Self {
        Self {
            db,
            client,
            crypto,
            now,
            pending: Arc::new(Mutex::new(None)),
            access: Arc::new(Mutex::new(None)),
            conflict: Arc::default(),
        }
    }

    fn now(&self) -> Timestamp {
        (self.now)()
    }

    pub async fn status(&self) -> ApiResult<GoogleStatus> {
        let pending = self.pending_flow_alive().await;
        let (pending_changes, last_conflict) = (store::pending_changes(&self.db).await?, self.last_conflict());
        Ok(match store::find(&self.db).await? {
            Some(settings) => GoogleStatus {
                connected: settings.refresh_token.is_some(),
                reauth_required: settings.refresh_token.is_none() && settings.email.is_some(),
                email: settings.email,
                has_credentials: true,
                pending,
                last_sync_at: settings.last_sync_at,
                last_sync_error: settings.last_sync_error,
                pending_changes,
                last_conflict,
            },
            None => GoogleStatus {
                connected: false,
                email: None,
                has_credentials: false,
                pending,
                reauth_required: false,
                last_sync_at: None,
                last_sync_error: None,
                pending_changes,
                last_conflict,
            },
        })
    }

    /// Notes that Google's version of the event called `title` replaced a change made here.
    pub fn record_conflict(&self, title: &str, at: Timestamp) {
        *self.conflict.lock().unwrap_or_else(std::sync::PoisonError::into_inner) =
            Some(ConflictNotice { title: title.to_owned(), at });
    }

    fn last_conflict(&self) -> Option<ConflictNotice> {
        self.conflict.lock().unwrap_or_else(std::sync::PoisonError::into_inner).clone()
    }

    /// Drops an expired flow, so a late callback finds nothing.
    async fn pending_flow_alive(&self) -> bool {
        let mut pending = self.pending.lock().await;
        if pending.as_ref().is_some_and(|flow| flow.expires_at <= self.now()) {
            *pending = None;
        }
        pending.is_some()
    }

    /// Seals the client of the user's Google Cloud project. A connected account
    /// belongs to the previous client, so it is disconnected first.
    pub async fn save_credentials(&self, input: SaveGoogleCredentialsBody) -> ApiResult<GoogleStatus> {
        self.disconnect().await?;
        let client_id = self.crypto.seal(&input.client_id).map_err(ApiError::internal)?;
        let client_secret = self.crypto.seal(&input.client_secret).map_err(ApiError::internal)?;
        store::save_credentials(&self.db, client_id, client_secret, self.now()).await?;
        self.status().await
    }

    /// Disconnects, then forgets the client credentials too.
    pub async fn clear_credentials(&self) -> ApiResult<()> {
        self.disconnect().await?;
        store::delete(&self.db).await
    }

    /// Starts a flow (replacing any pending one) and returns the consent page URL.
    /// `redirect_base` is the address this server listens on.
    pub async fn start_connect(&self, redirect_base: &str) -> ApiResult<GoogleConnectStart> {
        let client_id = self.open(&self.require_settings().await?.client_id)?;
        let (state, code_verifier) = new_flow_secrets();
        let redirect_uri = format!("{}{CALLBACK_PATH}", redirect_base.trim_end_matches('/'));
        let auth_url = authorization_url(self.client.accounts_url(), &client_id, &redirect_uri, &state, &code_verifier)
            .map_err(unavailable)?;
        let expires_at = self.now() + FLOW_TTL;
        *self.pending.lock().await = Some(PendingFlow { state, code_verifier, redirect_uri, expires_at });
        Ok(GoogleConnectStart { auth_url })
    }

    pub async fn cancel_connect(&self) {
        *self.pending.lock().await = None;
    }

    /// Takes the pending flow when `state` matches it. A wrong state leaves it in place.
    async fn take_flow(&self, state: Option<&str>) -> ApiResult<PendingFlow> {
        let mut pending = self.pending.lock().await;
        let Some(flow) = pending.as_ref() else {
            return Err(ApiError::bad_request("no_pending_flow", "No Google connection is waiting for an answer."));
        };
        if state != Some(flow.state.as_str()) {
            return Err(ApiError::bad_request("invalid_state", "The answer doesn't match the pending connection."));
        }
        let flow = pending.take().ok_or_else(|| ApiError::internal("pending flow vanished"))?;
        if flow.expires_at <= self.now() {
            return Err(ApiError::bad_request("flow_expired", "The connection took too long. Start it again."));
        }
        Ok(flow)
    }

    /// The browser came back with an error (consent denied): ends the flow it belongs to.
    pub async fn fail_connect(&self, state: Option<&str>) -> ApiResult<()> {
        self.take_flow(state).await.map(drop)
    }

    /// Checks the state and expiry, exchanges the code, reads the account email
    /// and seals the refresh token. Returns the email.
    pub async fn finish_connect(&self, code: &str, state: Option<&str>) -> ApiResult<String> {
        let flow = self.take_flow(state).await?;
        let credentials = self.credentials(&self.require_settings().await?)?;
        let tokens = self
            .client
            .exchange_code(
                &credentials,
                CodeGrant { code, code_verifier: &flow.code_verifier, redirect_uri: &flow.redirect_uri },
            )
            .await
            .map_err(connect_error)?;
        let refresh_token = tokens
            .refresh_token
            .clone()
            .ok_or_else(|| unavailable("Google returned no refresh token. Connect again."))?;
        let email = self.client.primary_calendar_id(&tokens.access_token).await.map_err(connect_error)?;
        let sealed = self.crypto.seal(&refresh_token).map_err(ApiError::internal)?;
        store::save_refresh_token(&self.db, Some(email.clone()), sealed, self.now()).await?;
        *self.access.lock().await = Some(self.cached(&tokens));
        Ok(email)
    }

    /// Revokes the refresh token (best effort), then forgets the account. The
    /// client credentials stay, so reconnecting is one click.
    pub async fn disconnect(&self) -> ApiResult<()> {
        self.cancel_connect().await;
        *self.access.lock().await = None;
        *self.conflict.lock().unwrap_or_else(std::sync::PoisonError::into_inner) = None;
        let result = self.revoke_and_forget().await;
        // The imported events go with the account, even when forgetting it failed.
        let cleanup =
            self.db.call(|conn| conn.transaction().and_then(|tx| forget_google(&tx).and_then(|()| tx.commit())));
        cleanup.await?;
        result
    }

    async fn revoke_and_forget(&self) -> ApiResult<()> {
        let Some(settings) = store::find(&self.db).await? else { return Ok(()) };
        if let Some(sealed) = &settings.refresh_token {
            let revoked = match (self.credentials(&settings), self.open(sealed)) {
                (Ok(credentials), Ok(token)) => {
                    self.client.revoke(&credentials, &token).await.map_err(|e| e.to_string())
                }
                (Err(error), _) | (_, Err(error)) => Err(error.to_string()),
            };
            if let Err(error) = revoked {
                tracing::warn!("revoking the Google token failed: {error}");
            }
        }
        store::clear_refresh_token(&self.db, true, self.now()).await
    }

    /// A valid access token for the Calendar API: the cached one while it has more
    /// than a minute left, otherwise a refreshed one. `invalid_grant` drops the
    /// refresh token, so the status turns to `reauthRequired`.
    pub async fn access_token(&self) -> Result<String, GoogleTokenError> {
        let mut cache = self.access.lock().await;
        if let Some(cached) = cache.as_ref().filter(|cached| cached.expires_at - REFRESH_MARGIN > self.now()) {
            return Ok(cached.token.clone());
        }
        *cache = None;
        let settings = store::find(&self.db).await.map_err(google_failure)?.ok_or(GoogleTokenError::NotConnected)?;
        let Some(sealed) = &settings.refresh_token else {
            return Err(if settings.email.is_some() {
                GoogleTokenError::ReauthRequired
            } else {
                GoogleTokenError::NotConnected
            });
        };
        let credentials = self.credentials(&settings).map_err(google_failure)?;
        let refresh_token = self.open(sealed).map_err(google_failure)?;
        match self.client.refresh(&credentials, &refresh_token).await {
            Ok(tokens) => {
                if let Some(rotated) = tokens.refresh_token.as_deref().filter(|token| *token != refresh_token) {
                    let sealed = self.crypto.seal(rotated).map_err(google_failure)?;
                    store::save_refresh_token(&self.db, None, sealed, self.now()).await.map_err(google_failure)?;
                }
                let cached = self.cached(&tokens);
                let token = cached.token.clone();
                *cache = Some(cached);
                Ok(token)
            }
            Err(GoogleAuthError::InvalidGrant) => {
                store::clear_refresh_token(&self.db, false, self.now()).await.map_err(google_failure)?;
                Err(GoogleTokenError::ReauthRequired)
            }
            Err(error) => Err(error.into()),
        }
    }

    /// Runs `call` with an access token; after a `401` it refreshes the token once and retries.
    pub async fn with_access_token<T, F, Fut>(&self, call: F) -> Result<T, GoogleTokenError>
    where
        F: Fn(String) -> Fut,
        Fut: Future<Output = Result<T, GoogleAuthError>>,
    {
        let token = self.access_token().await?;
        match call(token.clone()).await {
            Err(GoogleAuthError::Unauthorized) => {
                self.expire_access_token(&token).await;
                Ok(call(self.access_token().await?).await?)
            }
            other => Ok(other?),
        }
    }

    /// The calendar the sync reads: the account's, once connected.
    pub async fn calendar_id(&self) -> Result<String, GoogleTokenError> {
        let settings = store::find(&self.db).await.map_err(google_failure)?.ok_or(GoogleTokenError::NotConnected)?;
        match (&settings.refresh_token, &settings.email) {
            (Some(_), _) => Ok(settings.calendar_id),
            (None, Some(_)) => Err(GoogleTokenError::ReauthRequired),
            (None, None) => Err(GoogleTokenError::NotConnected),
        }
    }

    /// Forgets `token` if it is still the cached one (another caller may have refreshed it).
    pub async fn expire_access_token(&self, token: &str) {
        let mut cache = self.access.lock().await;
        if cache.as_ref().is_some_and(|cached| cached.token == token) {
            *cache = None;
        }
    }

    fn cached(&self, tokens: &GoogleTokens) -> CachedToken {
        let lifetime = tokens
            .expires_in
            .and_then(|duration| chrono::TimeDelta::from_std(duration).ok())
            .unwrap_or(DEFAULT_TOKEN_LIFETIME);
        CachedToken { token: tokens.access_token.clone(), expires_at: self.now() + lifetime }
    }

    fn open(&self, sealed: &SealedSecret) -> ApiResult<String> {
        self.crypto.open(sealed).map_err(ApiError::internal)
    }

    fn credentials(&self, settings: &GoogleSettings) -> ApiResult<GoogleCredentials> {
        Ok(GoogleCredentials {
            client_id: self.open(&settings.client_id)?,
            client_secret: self.open(&settings.client_secret)?,
        })
    }

    async fn require_settings(&self) -> ApiResult<GoogleSettings> {
        store::find(&self.db)
            .await?
            .ok_or_else(|| ApiError::bad_request("missing_credentials", "Save the Google client ID and secret first."))
    }
}

fn google_failure(error: impl std::fmt::Display) -> GoogleTokenError {
    GoogleTokenError::Google(error.to_string())
}

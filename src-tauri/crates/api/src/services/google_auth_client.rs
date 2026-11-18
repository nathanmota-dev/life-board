//! Google's OAuth 2.0 endpoints, through the `oauth2` crate over the workspace's
//! `reqwest`, plus the one Calendar call the connection needs, made through
//! [`GoogleCalendarClient`]. All HTTP lives here, so tests can plug in a fake
//! [`GoogleAuthApi`] or point the client at `wiremock`.
//!
//! Tokens and the client secret only travel in request bodies or the
//! `Authorization` header; no error message carries them.

use std::future::Future;
use std::pin::Pin;
use std::time::Duration;

use async_trait::async_trait;
use oauth2::basic::{BasicClient, BasicErrorResponse, BasicTokenResponse};
use oauth2::url::form_urlencoded;
use oauth2::{
    AuthType, AuthUrl, AuthorizationCode, ClientId, ClientSecret, CsrfToken, EndpointNotSet, EndpointSet,
    PkceCodeChallenge, PkceCodeVerifier, RedirectUrl, RefreshToken, RequestTokenError, Scope, TokenResponse, TokenUrl,
};
use serde::Deserialize;

use crate::services::google_calendar_client::{
    CALENDAR_PATH, GoogleCalendarApi, GoogleCalendarClient, GoogleCalendarError,
};

pub const GOOGLE_ACCOUNTS_URL: &str = "https://accounts.google.com";
pub const GOOGLE_OAUTH_URL: &str = "https://oauth2.googleapis.com";
pub const GOOGLE_APIS_URL: &str = "https://www.googleapis.com";
/// The only scope Life Board asks for.
pub const CALENDAR_SCOPE: &str = "https://www.googleapis.com/auth/calendar.events";
/// The consent page, under [`GOOGLE_ACCOUNTS_URL`].
pub const AUTHORIZE_PATH: &str = "/o/oauth2/v2/auth";

/// Where each kind of request goes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GoogleUrls {
    pub accounts: String,
    pub oauth: String,
    pub apis: String,
}

impl Default for GoogleUrls {
    fn default() -> Self {
        Self { accounts: GOOGLE_ACCOUNTS_URL.into(), oauth: GOOGLE_OAUTH_URL.into(), apis: GOOGLE_APIS_URL.into() }
    }
}

impl GoogleUrls {
    /// Every request to one server, such as a `wiremock` instance or the E2E fake.
    pub fn single(base_url: &str) -> Self {
        let base = base_url.trim_end_matches('/').to_owned();
        Self { accounts: base.clone(), oauth: base.clone(), apis: base }
    }
}

/// The OAuth client the user created in Google Cloud.
#[derive(Clone, PartialEq, Eq)]
pub struct GoogleCredentials {
    pub client_id: String,
    pub client_secret: String,
}

impl std::fmt::Debug for GoogleCredentials {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("GoogleCredentials { client_id: <redacted>, client_secret: <redacted> }")
    }
}

/// A token endpoint answer. `refresh_token` only comes with the first exchange.
#[derive(Clone, PartialEq, Eq)]
pub struct GoogleTokens {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<Duration>,
}

impl std::fmt::Debug for GoogleTokens {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("GoogleTokens")
            .field("access_token", &"<redacted>")
            .field("refresh_token", &self.refresh_token.as_ref().map(|_| "<redacted>"))
            .field("expires_in", &self.expires_in)
            .finish()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum GoogleAuthError {
    /// `invalid_grant`: the code or refresh token expired, was revoked or was already used.
    #[error("Google refused the authorization (invalid_grant).")]
    InvalidGrant,
    /// `invalid_client` or `unauthorized_client`: the client ID or secret is wrong.
    #[error("Google refused the client ID or secret ({0}).")]
    InvalidClient(String),
    /// A `401` from a Google API: the access token is no longer valid.
    #[error("Google refused the access token.")]
    Unauthorized,
    #[error("Google could not be reached: {0}")]
    Network(String),
    #[error("{0}")]
    Google(String),
}

pub type GoogleAuthResult<T> = Result<T, GoogleAuthError>;

/// What the consent page handed back, and what proves this app asked for it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CodeGrant<'a> {
    pub code: &'a str,
    pub code_verifier: &'a str,
    pub redirect_uri: &'a str,
}

/// The calls `GoogleService` makes, so tests can plug in a fake.
#[async_trait]
pub trait GoogleAuthApi: Send + Sync + 'static {
    /// Where the consent page lives; see [`authorization_url`].
    fn accounts_url(&self) -> &str {
        GOOGLE_ACCOUNTS_URL
    }
    async fn exchange_code(
        &self,
        credentials: &GoogleCredentials,
        grant: CodeGrant<'_>,
    ) -> GoogleAuthResult<GoogleTokens>;
    async fn refresh(&self, credentials: &GoogleCredentials, refresh_token: &str) -> GoogleAuthResult<GoogleTokens>;
    async fn revoke(&self, credentials: &GoogleCredentials, token: &str) -> GoogleAuthResult<()>;
    /// `GET /calendar/v3/calendars/primary`: its `id` is the account's email.
    async fn primary_calendar_id(&self, access_token: &str) -> GoogleAuthResult<String>;
}

type OAuthClient = BasicClient<EndpointNotSet, EndpointNotSet, EndpointNotSet, EndpointNotSet, EndpointSet>;

fn invalid_url(error: impl std::fmt::Display) -> GoogleAuthError {
    GoogleAuthError::Google(format!("Invalid Google URL: {error}"))
}

/// The token endpoint client, sending the credentials in the request body.
fn token_client(urls: &GoogleUrls, credentials: &GoogleCredentials) -> GoogleAuthResult<OAuthClient> {
    Ok(BasicClient::new(ClientId::new(credentials.client_id.clone()))
        .set_client_secret(ClientSecret::new(credentials.client_secret.clone()))
        .set_token_uri(TokenUrl::new(format!("{}/token", urls.oauth)).map_err(invalid_url)?)
        .set_auth_type(AuthType::RequestBody))
}

/// The consent page under `accounts_url`, with the S256 challenge of `code_verifier`,
/// offline access, forced consent (so Google always returns a refresh token) and
/// [`CALENDAR_SCOPE`].
pub fn authorization_url(
    accounts_url: &str,
    client_id: &str,
    redirect_uri: &str,
    state: &str,
    code_verifier: &str,
) -> GoogleAuthResult<String> {
    let redirect = RedirectUrl::new(redirect_uri.to_owned()).map_err(invalid_url)?;
    // RFC 7636 (and an assertion in `oauth2`): 43 to 128 characters.
    if !(43..=128).contains(&code_verifier.len()) {
        return Err(GoogleAuthError::Google("The PKCE verifier must have 43 to 128 characters.".into()));
    }
    let challenge = PkceCodeChallenge::from_code_verifier_sha256(&PkceCodeVerifier::new(code_verifier.to_owned()));
    let auth_url = AuthUrl::new(format!("{accounts_url}{AUTHORIZE_PATH}")).map_err(invalid_url)?;
    let (url, _) = BasicClient::new(ClientId::new(client_id.to_owned()))
        .set_auth_uri(auth_url)
        .set_redirect_uri(redirect)
        .authorize_url(|| CsrfToken::new(state.to_owned()))
        .add_scope(Scope::new(CALENDAR_SCOPE.to_owned()))
        .set_pkce_challenge(challenge)
        .add_extra_param("access_type", "offline")
        .add_extra_param("prompt", "consent")
        .url();
    Ok(url.to_string())
}

/// A fresh single-use `state` and PKCE verifier (43+ URL-safe characters each).
pub fn new_flow_secrets() -> (String, String) {
    let (_, verifier) = PkceCodeChallenge::new_random_sha256();
    (CsrfToken::new_random().secret().clone(), verifier.secret().clone())
}

#[derive(Debug, thiserror::Error)]
#[error("{0}")]
pub struct HttpError(String);

/// `oauth2`'s HTTP client trait over the workspace's `reqwest`, which is newer than
/// the one the crate's own `reqwest` feature targets.
#[derive(Debug, Clone)]
struct OAuthHttp(reqwest::Client);

impl<'c> oauth2::AsyncHttpClient<'c> for OAuthHttp {
    type Error = HttpError;
    type Future = Pin<Box<dyn Future<Output = Result<oauth2::HttpResponse, HttpError>> + Send + 'c>>;

    fn call(&'c self, request: oauth2::HttpRequest) -> Self::Future {
        Box::pin(async move {
            let (parts, body) = request.into_parts();
            let response = self
                .0
                .request(parts.method, parts.uri.to_string())
                .headers(parts.headers)
                .body(body)
                .send()
                .await
                .map_err(|error| HttpError(error.without_url().to_string()))?;
            let mut builder = oauth2::http::Response::builder().status(response.status());
            for (name, value) in response.headers() {
                builder = builder.header(name, value);
            }
            let bytes = response.bytes().await.map_err(|error| HttpError(error.without_url().to_string()))?;
            builder.body(bytes.to_vec()).map_err(|error| HttpError(error.to_string()))
        })
    }
}

/// An OAuth error code (RFC 6749, section 5.2) as a [`GoogleAuthError`].
fn oauth_error(code: &str) -> GoogleAuthError {
    match code {
        "invalid_grant" => GoogleAuthError::InvalidGrant,
        "invalid_client" | "unauthorized_client" => GoogleAuthError::InvalidClient(code.to_owned()),
        code => GoogleAuthError::Google(format!("Google refused the request ({code}).")),
    }
}

/// Maps a token endpoint failure without ever echoing the response body, which can hold tokens.
fn token_error(error: RequestTokenError<HttpError, BasicErrorResponse>) -> GoogleAuthError {
    match error {
        RequestTokenError::ServerResponse(response) => oauth_error(response.error().as_ref()),
        RequestTokenError::Request(error) => GoogleAuthError::Network(error.to_string()),
        RequestTokenError::Parse(..) => GoogleAuthError::Google("Google sent an invalid response.".into()),
        RequestTokenError::Other(message) => GoogleAuthError::Google(format!("Google request failed: {message}")),
    }
}

fn network(error: reqwest::Error) -> GoogleAuthError {
    GoogleAuthError::Network(error.without_url().to_string())
}

#[derive(Deserialize)]
struct OAuthErrorBody {
    error: String,
}

fn tokens(response: &BasicTokenResponse) -> GoogleTokens {
    GoogleTokens {
        access_token: response.access_token().secret().clone(),
        refresh_token: response.refresh_token().map(|token| token.secret().clone()),
        expires_in: response.expires_in(),
    }
}

/// The real client (`reqwest` with rustls, redirects off as `oauth2` advises).
#[derive(Debug, Clone)]
pub struct GoogleAuthClient {
    http: OAuthHttp,
    urls: GoogleUrls,
    calendar: GoogleCalendarClient,
}

impl GoogleAuthClient {
    /// Talks to Google. Under the `e2e` feature, `LIFE_BOARD_E2E_GOOGLE_URL` replaces
    /// every base URL the sidecar calls. The consent page keeps Google's address: only
    /// the (stubbed) browser opens it, and the desktop allow-list only lets it out there.
    pub fn new() -> Self {
        #[cfg(feature = "e2e")]
        if let Ok(base_url) = std::env::var("LIFE_BOARD_E2E_GOOGLE_URL") {
            return Self::with_urls(GoogleUrls {
                accounts: GOOGLE_ACCOUNTS_URL.into(),
                ..GoogleUrls::single(&base_url)
            });
        }
        Self::with_urls(GoogleUrls::default())
    }

    pub fn with_urls(urls: GoogleUrls) -> Self {
        let http = reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        let calendar = GoogleCalendarClient::with_base_url(format!("{}{CALENDAR_PATH}", urls.apis));
        Self { http: OAuthHttp(http), urls, calendar }
    }

    pub fn urls(&self) -> &GoogleUrls {
        &self.urls
    }
}

impl Default for GoogleAuthClient {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl GoogleAuthApi for GoogleAuthClient {
    async fn exchange_code(
        &self,
        credentials: &GoogleCredentials,
        grant: CodeGrant<'_>,
    ) -> GoogleAuthResult<GoogleTokens> {
        let CodeGrant { code, code_verifier, redirect_uri } = grant;
        let redirect = RedirectUrl::new(redirect_uri.to_owned()).map_err(invalid_url)?;
        let client = token_client(&self.urls, credentials)?.set_redirect_uri(redirect);
        let response = client
            .exchange_code(AuthorizationCode::new(code.to_owned()))
            .set_pkce_verifier(PkceCodeVerifier::new(code_verifier.to_owned()))
            .request_async(&self.http)
            .await
            .map_err(token_error)?;
        Ok(tokens(&response))
    }

    async fn refresh(&self, credentials: &GoogleCredentials, refresh_token: &str) -> GoogleAuthResult<GoogleTokens> {
        let client = token_client(&self.urls, credentials)?;
        let token = RefreshToken::new(refresh_token.to_owned());
        let response = client.exchange_refresh_token(&token).request_async(&self.http).await.map_err(token_error)?;
        Ok(tokens(&response))
    }

    /// `POST /revoke` with the token in the body. `oauth2`'s revocation request is
    /// not used because it refuses plain-HTTP endpoints such as the test servers.
    async fn revoke(&self, _credentials: &GoogleCredentials, token: &str) -> GoogleAuthResult<()> {
        let body = form_urlencoded::Serializer::new(String::new()).append_pair("token", token).finish();
        let response = self
            .http
            .0
            .post(format!("{}/revoke", self.urls.oauth))
            .header(reqwest::header::CONTENT_TYPE, "application/x-www-form-urlencoded")
            .body(body)
            .send()
            .await
            .map_err(network)?;
        let status = response.status();
        if status.is_success() {
            return Ok(());
        }
        Err(match response.json::<OAuthErrorBody>().await {
            Ok(body) => oauth_error(&body.error),
            Err(_) => GoogleAuthError::Google(format!("Google answered {}.", status.as_u16())),
        })
    }

    async fn primary_calendar_id(&self, access_token: &str) -> GoogleAuthResult<String> {
        self.calendar.get_primary_calendar(access_token).await.map(|calendar| calendar.id).map_err(
            |error| match error {
                GoogleCalendarError::Unauthorized => GoogleAuthError::Unauthorized,
                GoogleCalendarError::Network(message) => GoogleAuthError::Network(message),
                other => GoogleAuthError::Google(other.to_string()),
            },
        )
    }

    fn accounts_url(&self) -> &str {
        &self.urls.accounts
    }
}

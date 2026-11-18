use std::sync::Arc;

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use chrono::TimeDelta;
use life_board_api::dto::google::SaveGoogleCredentialsBody;
use life_board_api::services::google::{GoogleService, GoogleTokenError};
use life_board_api::services::google_auth_client::{CALENDAR_SCOPE, GoogleAuthError};
use sha2::{Digest, Sha256};

use crate::common::google::{
    CLIENT_ID, CLIENT_SECRET, EMAIL, FakeGoogle, REDIRECT_URI, REFRESH_TOKEN, SERVER_URL, TestClock, google_service,
    query_param, state_of, tokens,
};
use crate::common::{TestDb, assert_error, test_db};

struct Ctx {
    db: TestDb,
    fake: Arc<FakeGoogle>,
    clock: TestClock,
    service: GoogleService,
}

async fn setup() -> Ctx {
    let db = test_db().await;
    let fake = FakeGoogle::new();
    let clock = TestClock::new();
    let service = google_service(&db.db, &fake, &clock);
    Ctx { db, fake, clock, service }
}

fn credentials() -> SaveGoogleCredentialsBody {
    SaveGoogleCredentialsBody { client_id: CLIENT_ID.into(), client_secret: CLIENT_SECRET.into() }
}

impl Ctx {
    async fn with_credentials(self) -> Self {
        self.service.save_credentials(credentials()).await.unwrap();
        self
    }

    /// Starts a flow and returns its `state`.
    async fn start(&self) -> String {
        state_of(&self.service.start_connect(SERVER_URL).await.unwrap().auth_url)
    }

    async fn connected(self) -> Self {
        let ctx = self.with_credentials().await;
        let state = ctx.start().await;
        assert_eq!(ctx.service.finish_connect("code-1", Some(&state)).await.unwrap(), EMAIL);
        ctx
    }

    fn database_file(&self) -> Vec<u8> {
        std::fs::read(self.db.file()).unwrap()
    }
}

fn contains(haystack: &[u8], needle: &str) -> bool {
    haystack.windows(needle.len()).any(|window| window == needle.as_bytes())
}

#[tokio::test]
async fn reports_nothing_before_the_credentials_are_saved() {
    let ctx = setup().await;
    let status = ctx.service.status().await.unwrap();

    assert!(!status.connected && !status.has_credentials && !status.pending && !status.reauth_required);
    assert_eq!(status.email, None);
    assert_error(ctx.service.start_connect(SERVER_URL).await, 400, "missing_credentials");
}

#[tokio::test]
async fn seals_the_client_credentials() {
    let ctx = setup().await.with_credentials().await;
    let status = ctx.service.status().await.unwrap();

    assert!(status.has_credentials && !status.connected);
    let file = ctx.database_file();
    assert!(!contains(&file, CLIENT_SECRET));
    assert!(!contains(&file, CLIENT_ID));
}

#[tokio::test]
async fn builds_the_authorization_url_with_pkce_offline_access_and_the_loopback_redirect() {
    let ctx = setup().await.with_credentials().await;
    let auth_url = ctx.service.start_connect(&format!("{SERVER_URL}/")).await.unwrap().auth_url;

    assert!(auth_url.starts_with("https://accounts.google.com/o/oauth2/v2/auth?"), "{auth_url}");
    let param = |name| query_param(&auth_url, name);
    assert_eq!(param("response_type").as_deref(), Some("code"));
    assert_eq!(param("client_id").as_deref(), Some(CLIENT_ID));
    assert_eq!(param("redirect_uri").as_deref(), Some(REDIRECT_URI));
    assert_eq!(param("scope").as_deref(), Some(CALENDAR_SCOPE));
    assert_eq!(param("code_challenge_method").as_deref(), Some("S256"));
    assert_eq!(param("access_type").as_deref(), Some("offline"));
    assert_eq!(param("prompt").as_deref(), Some("consent"));
    assert!(ctx.service.status().await.unwrap().pending);

    ctx.service.finish_connect("code-1", param("state").as_deref()).await.unwrap();
    let exchange = ctx.fake.calls().into_iter().find(|call| call.starts_with("exchange_code(")).unwrap();
    let verifier = exchange.split(", ").nth(2).unwrap().to_owned();
    assert!(verifier.len() >= 43, "{verifier}");
    assert_eq!(param("code_challenge"), Some(URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))));
    assert_eq!(exchange, format!("exchange_code({CLIENT_ID}:{CLIENT_SECRET}, code-1, {verifier}, {REDIRECT_URI})"));
}

#[tokio::test]
async fn stores_a_sealed_refresh_token_and_the_email_after_a_valid_callback() {
    let ctx = setup().await.connected().await;
    let status = ctx.service.status().await.unwrap();

    assert!(status.connected && !status.pending && !status.reauth_required);
    assert_eq!(status.email.as_deref(), Some(EMAIL));
    assert!(ctx.fake.calls().contains(&"primary_calendar_id(access-0)".to_owned()));
    let file = ctx.database_file();
    assert!(!contains(&file, REFRESH_TOKEN));
    assert!(!contains(&file, CLIENT_SECRET));
    assert!(contains(&file, EMAIL));
}

#[tokio::test]
async fn rejects_callbacks_without_a_matching_live_flow() {
    let ctx = setup().await.with_credentials().await;
    assert_error(ctx.service.finish_connect("code", Some("state")).await, 400, "no_pending_flow");

    let state = ctx.start().await;
    assert_error(ctx.service.finish_connect("code", Some("other")).await, 400, "invalid_state");
    assert_error(ctx.service.finish_connect("code", None).await, 400, "invalid_state");
    ctx.service.finish_connect("code", Some(&state)).await.unwrap();
    assert_error(ctx.service.finish_connect("code", Some(&state)).await, 400, "no_pending_flow");

    let state = ctx.start().await;
    ctx.clock.advance(TimeDelta::minutes(10));
    assert_error(ctx.service.finish_connect("code", Some(&state)).await, 400, "flow_expired");
    assert_error(ctx.service.finish_connect("code", Some(&state)).await, 400, "no_pending_flow");
    assert_eq!(ctx.fake.count("exchange_code("), 1);
}

#[tokio::test]
async fn forgets_an_expired_flow_and_replaces_a_started_one() {
    let ctx = setup().await.with_credentials().await;
    let first = ctx.start().await;
    let second = ctx.start().await;
    assert_ne!(first, second);
    assert_error(ctx.service.finish_connect("code", Some(&first)).await, 400, "invalid_state");

    ctx.clock.advance(TimeDelta::minutes(9));
    assert!(ctx.service.status().await.unwrap().pending);
    ctx.clock.advance(TimeDelta::minutes(1));
    assert!(!ctx.service.status().await.unwrap().pending);
    assert_error(ctx.service.finish_connect("code", Some(&second)).await, 400, "no_pending_flow");
}

#[tokio::test]
async fn ends_the_flow_on_cancel_or_a_matching_denial() {
    let ctx = setup().await.with_credentials().await;
    ctx.start().await;
    ctx.service.cancel_connect().await;
    assert!(!ctx.service.status().await.unwrap().pending);

    let state = ctx.start().await;
    assert_error(ctx.service.fail_connect(Some("forged")).await, 400, "invalid_state");
    assert!(ctx.service.status().await.unwrap().pending);
    ctx.service.fail_connect(Some(&state)).await.unwrap();
    assert!(!ctx.service.status().await.unwrap().pending);
}

#[tokio::test]
async fn maps_failed_exchanges_and_lookups() {
    let ctx = setup().await.with_credentials().await;
    type Case = (fn(&FakeGoogle), u16, &'static str);
    let cases: [Case; 4] = [
        (|fake| fake.on_exchange(|_| Err(GoogleAuthError::InvalidGrant)), 400, "invalid_grant"),
        (
            |fake| fake.on_exchange(|_| Err(GoogleAuthError::InvalidClient("invalid_client".into()))),
            400,
            "invalid_credentials",
        ),
        (|fake| fake.on_exchange(|_| Ok(tokens("access", None))), 502, "google_unavailable"),
        (
            |fake| {
                fake.on_exchange(|_| Ok(tokens("access", Some(REFRESH_TOKEN))));
                fake.on_primary(|_| Err(GoogleAuthError::Network("offline".into())));
            },
            502,
            "google_unavailable",
        ),
    ];
    for (arrange, status, code) in cases {
        arrange(&ctx.fake);
        let state = ctx.start().await;
        assert_error(ctx.service.finish_connect("code", Some(&state)).await, status, code);
        assert!(!ctx.service.status().await.unwrap().connected);
    }
}

#[tokio::test]
async fn caches_the_access_token_until_a_minute_before_it_expires() {
    let ctx = setup().await.connected().await;
    assert_eq!(ctx.service.access_token().await.unwrap(), "access-0");
    ctx.clock.advance(TimeDelta::minutes(58) + TimeDelta::seconds(59));
    assert_eq!(ctx.service.access_token().await.unwrap(), "access-0");
    assert_eq!(ctx.fake.count("refresh("), 0);

    ctx.clock.advance(TimeDelta::seconds(1));
    assert_eq!(ctx.service.access_token().await.unwrap(), "access-1");
    assert_eq!(ctx.service.access_token().await.unwrap(), "access-1");
    assert_eq!(ctx.fake.calls().last().unwrap(), &format!("refresh({CLIENT_ID}:{CLIENT_SECRET}, {REFRESH_TOKEN})"));
}

#[tokio::test]
async fn refreshes_after_a_restart_and_keeps_a_rotated_refresh_token() {
    let ctx = setup().await.connected().await;
    let restarted = google_service(&ctx.db.db, &ctx.fake, &ctx.clock);
    ctx.fake.on_refresh(|count| Ok(tokens(&format!("fresh-{count}"), Some("1//rotated-refresh-token"))));

    assert_eq!(restarted.access_token().await.unwrap(), "fresh-0");
    ctx.clock.advance(TimeDelta::hours(1));
    assert_eq!(restarted.access_token().await.unwrap(), "fresh-1");
    assert_eq!(
        ctx.fake.calls().last().unwrap(),
        &format!("refresh({CLIENT_ID}:{CLIENT_SECRET}, 1//rotated-refresh-token)")
    );
    assert!(!contains(&ctx.database_file(), "1//rotated-refresh-token"));
}

#[tokio::test]
async fn refreshes_once_after_a_401() {
    let ctx = setup().await.connected().await;
    let result = ctx
        .service
        .with_access_token(|token| async move {
            if token == "access-0" { Err(GoogleAuthError::Unauthorized) } else { Ok(token) }
        })
        .await;

    assert_eq!(result.unwrap(), "access-1");
    assert_eq!(ctx.fake.count("refresh("), 1);
    let again = ctx.service.with_access_token(|_| async { Err::<(), _>(GoogleAuthError::Unauthorized) }).await;
    assert_eq!(again.unwrap_err(), GoogleTokenError::Google("Google refused the access token.".into()));
    assert_eq!(ctx.fake.count("refresh("), 2);
    let network =
        ctx.service.with_access_token(|_| async { Err::<(), _>(GoogleAuthError::Network("down".into())) }).await;
    assert_eq!(network.unwrap_err(), GoogleTokenError::Network("down".into()));
}

#[tokio::test]
async fn requires_reauthorization_after_invalid_grant() {
    let ctx = setup().await.connected().await;
    let restarted = google_service(&ctx.db.db, &ctx.fake, &ctx.clock);
    ctx.fake.on_refresh(|_| Err(GoogleAuthError::InvalidGrant));

    assert_eq!(restarted.access_token().await.unwrap_err(), GoogleTokenError::ReauthRequired);
    let status = restarted.status().await.unwrap();
    assert!(status.reauth_required && !status.connected && status.has_credentials);
    assert_eq!(status.email.as_deref(), Some(EMAIL));
    assert_eq!(restarted.access_token().await.unwrap_err(), GoogleTokenError::ReauthRequired);
    assert_eq!(ctx.fake.count("refresh("), 1);

    let state = state_of(&restarted.start_connect(SERVER_URL).await.unwrap().auth_url);
    restarted.finish_connect("code-2", Some(&state)).await.unwrap();
    assert!(restarted.status().await.unwrap().connected);
}

#[tokio::test]
async fn reports_why_there_is_no_access_token() {
    let ctx = setup().await;
    assert_eq!(ctx.service.access_token().await.unwrap_err(), GoogleTokenError::NotConnected);
    let ctx = ctx.with_credentials().await;
    assert_eq!(ctx.service.access_token().await.unwrap_err(), GoogleTokenError::NotConnected);

    let ctx = ctx.connected().await;
    let restarted = google_service(&ctx.db.db, &ctx.fake, &ctx.clock);
    ctx.fake.on_refresh(|_| Err(GoogleAuthError::Network("offline".into())));
    assert_eq!(restarted.access_token().await.unwrap_err(), GoogleTokenError::Network("offline".into()));
    ctx.fake.on_refresh(|_| Err(GoogleAuthError::InvalidClient("invalid_client".into())));
    assert!(matches!(restarted.access_token().await.unwrap_err(), GoogleTokenError::Google(_)));
    assert!(restarted.status().await.unwrap().connected);
}

#[tokio::test]
async fn disconnect_revokes_the_token_and_keeps_the_credentials() {
    let ctx = setup().await.connected().await;
    ctx.service.disconnect().await.unwrap();

    assert!(ctx.fake.calls().contains(&format!("revoke({CLIENT_ID}:{CLIENT_SECRET}, {REFRESH_TOKEN})")));
    let status = ctx.service.status().await.unwrap();
    assert!(status.has_credentials && !status.connected && !status.reauth_required);
    assert_eq!(status.email, None);
    assert_eq!(ctx.service.access_token().await.unwrap_err(), GoogleTokenError::NotConnected);

    ctx.service.disconnect().await.unwrap();
    assert_eq!(ctx.fake.count("revoke("), 1);
}

#[tokio::test]
async fn disconnects_even_when_the_revoke_fails() {
    let ctx = setup().await.connected().await;
    ctx.fake.on_revoke(|_| Err(GoogleAuthError::Network("offline".into())));

    ctx.service.disconnect().await.unwrap();
    assert!(!ctx.service.status().await.unwrap().connected);
}

#[tokio::test]
async fn clearing_or_replacing_the_credentials_disconnects_first() {
    let ctx = setup().await.connected().await;
    ctx.service.save_credentials(credentials()).await.unwrap();
    assert_eq!(ctx.fake.count("revoke("), 1);
    assert!(!ctx.service.status().await.unwrap().connected);

    let ctx = ctx.connected().await;
    ctx.service.clear_credentials().await.unwrap();
    assert_eq!(ctx.fake.count("revoke("), 2);
    assert!(!ctx.service.status().await.unwrap().has_credentials);
    ctx.service.clear_credentials().await.unwrap();
}

#[tokio::test]
async fn refuses_a_profile_sealed_with_another_key() {
    let ctx = setup().await.connected().await;
    let other_key =
        GoogleService::with_clock(ctx.db.db.clone(), ctx.fake.clone(), crate::common::crypto(9), ctx.clock.now());

    assert!(matches!(other_key.access_token().await.unwrap_err(), GoogleTokenError::Google(_)));
    assert!(other_key.start_connect(SERVER_URL).await.is_err());
    other_key.disconnect().await.unwrap();
    assert_eq!(ctx.fake.count("revoke("), 0);
}

#[test]
fn maps_token_errors_to_api_errors_and_redacts_the_credentials() {
    let cases = [
        (GoogleTokenError::NotConnected, 400, "google_not_connected"),
        (GoogleTokenError::ReauthRequired, 400, "reauth_required"),
        (GoogleTokenError::Network("down".into()), 502, "google_unavailable"),
        (GoogleTokenError::Google("odd".into()), 502, "google_unavailable"),
    ];
    for (error, status, code) in cases {
        let api: life_board_api::ApiError = error.into();
        assert_eq!((api.status().as_u16(), api.code()), (status, code));
    }
    let printed = format!("{:?}", credentials());
    assert!(!printed.contains(CLIENT_SECRET) && !printed.contains(CLIENT_ID), "{printed}");
}

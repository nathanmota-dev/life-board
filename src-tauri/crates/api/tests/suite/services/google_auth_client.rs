use std::collections::HashMap;
use std::time::Duration;

use life_board_api::services::google_auth_client::{
    CodeGrant, GoogleAuthApi, GoogleAuthClient, GoogleAuthError, GoogleCredentials, GoogleTokens, GoogleUrls,
    authorization_url, new_flow_secrets,
};
use serde_json::{Value, json};
use wiremock::matchers::{header, method, path};
use wiremock::{Mock, MockServer, Request, ResponseTemplate};

use crate::common::google::{CLIENT_ID, CLIENT_SECRET, REDIRECT_URI, REFRESH_TOKEN, query_param};

fn credentials() -> GoogleCredentials {
    GoogleCredentials { client_id: CLIENT_ID.into(), client_secret: CLIENT_SECRET.into() }
}

async fn answering(route: &str, response: ResponseTemplate) -> (MockServer, GoogleAuthClient) {
    let server = MockServer::start().await;
    Mock::given(method("POST")).and(path(route)).respond_with(response).mount(&server).await;
    let client = GoogleAuthClient::with_urls(GoogleUrls::single(&server.uri()));
    (server, client)
}

fn token_answer(body: Value) -> ResponseTemplate {
    ResponseTemplate::new(200).set_body_json(body)
}

fn error_answer(status: u16, error: &str) -> ResponseTemplate {
    ResponseTemplate::new(status).set_body_json(json!({ "error": error, "error_description": "Synthetic" }))
}

/// The form fields of the only request `server` received.
async fn form(server: &MockServer) -> HashMap<String, String> {
    let requests = server.received_requests().await.unwrap();
    assert_eq!(requests.len(), 1);
    let request: &Request = &requests[0];
    assert_eq!(request.headers.get("content-type").unwrap(), "application/x-www-form-urlencoded");
    oauth2::url::form_urlencoded::parse(&request.body).into_owned().collect()
}

fn fields(pairs: &[(&str, &str)]) -> HashMap<String, String> {
    pairs.iter().map(|(key, value)| ((*key).to_owned(), (*value).to_owned())).collect()
}

#[tokio::test]
async fn exchanges_the_code_with_the_verifier_and_the_redirect_uri() {
    let answer = json!({ "access_token": "ya29.synthetic", "refresh_token": REFRESH_TOKEN, "expires_in": 3599, "token_type": "Bearer", "scope": "https://www.googleapis.com/auth/calendar.events" });
    let (server, client) = answering("/token", token_answer(answer)).await;
    let tokens = client
        .exchange_code(
            &credentials(),
            CodeGrant { code: "4/code", code_verifier: "verifier-123", redirect_uri: REDIRECT_URI },
        )
        .await
        .unwrap();

    assert_eq!(
        tokens,
        GoogleTokens {
            access_token: "ya29.synthetic".into(),
            refresh_token: Some(REFRESH_TOKEN.into()),
            expires_in: Some(Duration::from_secs(3599)),
        }
    );
    assert_eq!(
        form(&server).await,
        fields(&[
            ("grant_type", "authorization_code"),
            ("code", "4/code"),
            ("code_verifier", "verifier-123"),
            ("redirect_uri", REDIRECT_URI),
            ("client_id", CLIENT_ID),
            ("client_secret", CLIENT_SECRET),
        ])
    );
}

#[tokio::test]
async fn refreshes_with_the_refresh_token() {
    let answer = json!({ "access_token": "ya29.fresh", "expires_in": 3599, "token_type": "Bearer" });
    let (server, client) = answering("/token", token_answer(answer)).await;
    let tokens = client.refresh(&credentials(), REFRESH_TOKEN).await.unwrap();

    assert_eq!((tokens.access_token.as_str(), tokens.refresh_token), ("ya29.fresh", None));
    assert_eq!(
        form(&server).await,
        fields(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", REFRESH_TOKEN),
            ("client_id", CLIENT_ID),
            ("client_secret", CLIENT_SECRET),
        ])
    );
}

#[tokio::test]
async fn revokes_the_refresh_token() {
    let (server, client) = answering("/revoke", ResponseTemplate::new(200)).await;
    client.revoke(&credentials(), REFRESH_TOKEN).await.unwrap();

    assert_eq!(form(&server).await, fields(&[("token", REFRESH_TOKEN)]));

    let (_server, client) = answering("/revoke", error_answer(400, "invalid_token")).await;
    let error = client.revoke(&credentials(), REFRESH_TOKEN).await.unwrap_err();
    assert_eq!(error, GoogleAuthError::Google("Google refused the request (invalid_token).".into()));
    let (_server, client) = answering("/revoke", error_answer(400, "invalid_grant")).await;
    assert_eq!(client.revoke(&credentials(), REFRESH_TOKEN).await.unwrap_err(), GoogleAuthError::InvalidGrant);
    let (_server, client) = answering("/revoke", ResponseTemplate::new(503)).await;
    let error = client.revoke(&credentials(), REFRESH_TOKEN).await.unwrap_err();
    assert_eq!(error, GoogleAuthError::Google("Google answered 503.".into()));
    let unreachable = GoogleAuthClient::with_urls(GoogleUrls::single("http://127.0.0.1:9"));
    assert!(matches!(unreachable.revoke(&credentials(), REFRESH_TOKEN).await, Err(GoogleAuthError::Network(_))));
}

#[tokio::test]
async fn maps_token_endpoint_errors_without_echoing_the_body() {
    let (_server, client) = answering("/token", error_answer(400, "invalid_grant")).await;
    assert_eq!(client.refresh(&credentials(), REFRESH_TOKEN).await.unwrap_err(), GoogleAuthError::InvalidGrant);
    assert_eq!(
        client
            .exchange_code(
                &credentials(),
                CodeGrant { code: "code", code_verifier: "verifier", redirect_uri: REDIRECT_URI }
            )
            .await
            .unwrap_err(),
        GoogleAuthError::InvalidGrant
    );

    let (_server, client) = answering("/token", error_answer(401, "invalid_client")).await;
    assert_eq!(
        client.refresh(&credentials(), REFRESH_TOKEN).await.unwrap_err(),
        GoogleAuthError::InvalidClient("invalid_client".into())
    );

    let (_server, client) = answering("/token", error_answer(400, "invalid_request")).await;
    let error = client.refresh(&credentials(), REFRESH_TOKEN).await.unwrap_err();
    assert_eq!(error.to_string(), "Google refused the request (invalid_request).");

    let leaked = format!("{{\"access_token\": \"{REFRESH_TOKEN}\"");
    let (_server, client) =
        answering("/token", ResponseTemplate::new(200).set_body_raw(leaked, "application/json")).await;
    let error = client.refresh(&credentials(), REFRESH_TOKEN).await.unwrap_err();
    assert_eq!(error, GoogleAuthError::Google("Google sent an invalid response.".into()));

    let (_server, client) = answering("/token", ResponseTemplate::new(500)).await;
    let error = client.refresh(&credentials(), REFRESH_TOKEN).await.unwrap_err();
    assert!(
        matches!(&error, GoogleAuthError::Google(message) if message.starts_with("Google request failed")),
        "{error}"
    );
}

#[tokio::test]
async fn reports_network_failures() {
    let unreachable = GoogleAuthClient::with_urls(GoogleUrls::single("http://127.0.0.1:9"));
    let refresh = unreachable.refresh(&credentials(), REFRESH_TOKEN).await.unwrap_err();
    assert!(matches!(refresh, GoogleAuthError::Network(_)), "{refresh:?}");
    let calendar = unreachable.primary_calendar_id("ya29.synthetic").await.unwrap_err();
    assert!(matches!(calendar, GoogleAuthError::Network(_)), "{calendar:?}");
    assert!(!format!("{refresh}{calendar}").contains(REFRESH_TOKEN));
}

#[tokio::test]
async fn reads_the_primary_calendar_id_with_the_access_token() {
    let server = MockServer::start().await;
    Mock::given(method("GET"))
        .and(path("/calendar/v3/calendars/primary"))
        .and(header("authorization", "Bearer ya29.synthetic"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({ "id": "someone@gmail.com", "summary": "Me" })))
        .mount(&server)
        .await;
    let client = GoogleAuthClient::with_urls(GoogleUrls::single(&server.uri()));

    assert_eq!(client.primary_calendar_id("ya29.synthetic").await.unwrap(), "someone@gmail.com");
    assert_eq!(
        client.primary_calendar_id("ya29.expired").await.unwrap_err(),
        GoogleAuthError::Google("Google Calendar answered 404.".into())
    );
}

#[tokio::test]
async fn maps_calendar_errors() {
    let answer = |response: ResponseTemplate| async move {
        let server = MockServer::start().await;
        Mock::given(method("GET")).respond_with(response).mount(&server).await;
        let client = GoogleAuthClient::with_urls(GoogleUrls::single(&server.uri()));
        let result = client.primary_calendar_id("ya29.synthetic").await;
        drop(server);
        result
    };

    assert_eq!(answer(ResponseTemplate::new(401)).await.unwrap_err(), GoogleAuthError::Unauthorized);
    assert_eq!(
        answer(ResponseTemplate::new(200).set_body_json(json!({}))).await.unwrap_err().to_string(),
        "Google Calendar returned no primary calendar."
    );
    assert_eq!(
        answer(ResponseTemplate::new(200).set_body_string("not json")).await.unwrap_err().to_string(),
        "Google Calendar sent an invalid response."
    );
}

#[tokio::test]
async fn builds_the_consent_url_on_the_configured_server() {
    let client = GoogleAuthClient::with_urls(GoogleUrls::single("http://127.0.0.1:9/"));
    assert_eq!(client.urls(), &GoogleUrls::single("http://127.0.0.1:9"));
    let verifier = "v".repeat(43);
    let url = authorization_url(client.accounts_url(), CLIENT_ID, REDIRECT_URI, "state-1", &verifier).unwrap();

    assert!(url.starts_with("http://127.0.0.1:9/o/oauth2/v2/auth?"), "{url}");
    assert_eq!(query_param(&url, "state").as_deref(), Some("state-1"));
    assert!(authorization_url(client.accounts_url(), CLIENT_ID, "not a url", "state", &verifier).is_err());
    assert!(authorization_url(client.accounts_url(), CLIENT_ID, REDIRECT_URI, "state", "short").is_err());
    assert!(authorization_url(client.accounts_url(), CLIENT_ID, REDIRECT_URI, "state", &"v".repeat(129)).is_err());
    let broken = GoogleAuthClient::with_urls(GoogleUrls::single("::"));
    assert!(authorization_url(broken.accounts_url(), CLIENT_ID, REDIRECT_URI, "s", &verifier).is_err());
    assert!(matches!(broken.refresh(&credentials(), REFRESH_TOKEN).await, Err(GoogleAuthError::Google(_))));
    let exchange = client
        .exchange_code(&credentials(), CodeGrant { code: "code", code_verifier: &verifier, redirect_uri: "not a url" })
        .await;
    assert!(matches!(exchange, Err(GoogleAuthError::Google(_))));
    assert_eq!(GoogleAuthClient::new().urls(), &GoogleUrls::default());
    assert_eq!(GoogleAuthClient::default().urls().accounts, "https://accounts.google.com");
}

#[test]
fn generates_fresh_flow_secrets_and_redacts_secrets_in_debug_output() {
    let (state, verifier) = new_flow_secrets();
    let (other_state, other_verifier) = new_flow_secrets();
    assert!(state.len() >= 16 && verifier.len() >= 43);
    assert!(state != other_state && verifier != other_verifier);

    let tokens = GoogleTokens {
        access_token: "ya29.secret".into(),
        refresh_token: Some(REFRESH_TOKEN.into()),
        expires_in: None,
    };
    let printed = format!("{tokens:?} {:?}", credentials());
    assert!(
        !printed.contains("ya29.secret") && !printed.contains(REFRESH_TOKEN) && !printed.contains(CLIENT_SECRET),
        "{printed}"
    );
}

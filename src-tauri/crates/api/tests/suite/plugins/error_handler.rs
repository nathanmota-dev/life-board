use axum::Router;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::routing::get;
use http_body_util::BodyExt;
use life_board_api::ApiError;
use serde_json::{Value, json};
use tower::ServiceExt;

/// `appThatThrows(error)`: a bare router whose only route fails with `error`.
async fn app_that_throws(error: fn() -> ApiError) -> (StatusCode, Value) {
    let app: Router = Router::new().route("/", get(move || async move { Err::<(), ApiError>(error()) }));
    let response = app.oneshot(Request::builder().uri("/").body(Body::empty()).unwrap()).await.unwrap();
    let status = response.status();
    let body = response.into_body().collect().await.unwrap().to_bytes();
    (status, serde_json::from_slice(&body).unwrap())
}

#[tokio::test]
async fn maps_domain_errors_to_their_status_codes() {
    let not_found = app_that_throws(|| ApiError::not_found("Resource not found.")).await;
    assert_eq!(not_found.0, StatusCode::NOT_FOUND);
    assert_eq!(not_found.1, json!({ "error": "not_found", "message": "Resource not found." }));

    let bad_request = app_that_throws(|| ApiError::bad_request("bad_thing", "bad_thing")).await;
    assert_eq!(bad_request.1, json!({ "error": "bad_thing", "message": "bad_thing" }));
}

#[tokio::test]
async fn passes_client_errors_through_and_hides_server_errors() {
    let client_error =
        app_that_throws(|| ApiError::client(StatusCode::PAYLOAD_TOO_LARGE, Some("FST_TOO_LARGE"), "Too big")).await;
    assert_eq!(client_error.1, json!({ "error": "FST_TOO_LARGE", "message": "Too big" }));

    let no_code = app_that_throws(|| ApiError::client(StatusCode::BAD_REQUEST, None, "Nope")).await;
    assert_eq!(no_code.1["error"], "bad_request");

    let crash = app_that_throws(|| ApiError::internal("db exploded")).await;
    assert_eq!(crash.0, StatusCode::INTERNAL_SERVER_ERROR);
    assert_eq!(crash.1, json!({ "error": "internal_error", "message": "Something went wrong." }));
}

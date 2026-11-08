//! Life Board's HTTP API in Rust: the port of `api/` (Fastify + Drizzle) with
//! the same routes, JSON and SQLite profile. See `CONTRACT.md`.

pub mod controllers;
pub mod db;
pub mod dto;
pub mod error;
pub mod extract;
pub mod plugins;
pub mod server;
pub mod services;
pub mod state;

use axum::Router;

pub use error::{ApiError, ApiResult};
pub use server::{RunningServer, ServerOptions, start_server};
pub use state::{AppOptions, AppState};

/// `buildApp`: the public and protected routes under `/api`, with CORS, the
/// auth layer, the body limits and the error mapping.
pub fn build_app(state: AppState) -> Router {
    let protected = controllers::protected()
        .into_router()
        .route_layer(axum::middleware::from_fn_with_state(state.clone(), plugins::auth::require_auth));
    let api = controllers::public().into_router().merge(protected);
    Router::new()
        .nest(controllers::PREFIX, api)
        .fallback(not_found)
        .method_not_allowed_fallback(not_found)
        // JSON bodies have their own limit in `extract`; uploads are limited per file.
        .layer(axum::extract::DefaultBodyLimit::disable())
        .layer(plugins::cors::layer())
        .layer(axum::middleware::from_fn(plugins::cors::preflight_no_content))
        .with_state(state)
}

/// Fastify's default 404 body, also used for a known path with another method.
async fn not_found(
    method: axum::http::Method,
    uri: axum::http::Uri,
) -> (axum::http::StatusCode, axum::Json<serde_json::Value>) {
    (
        axum::http::StatusCode::NOT_FOUND,
        axum::Json(serde_json::json!({
            "message": format!("Route {method}:{} not found", uri.path_and_query().map_or(uri.path(), |value| value.as_str())),
            "error": "Not Found",
            "statusCode": 404,
        })),
    )
}

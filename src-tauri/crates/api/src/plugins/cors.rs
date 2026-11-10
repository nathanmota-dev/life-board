use axum::extract::Request;
use axum::http::{HeaderValue, Method, StatusCode};
use axum::middleware::Next;
use axum::response::Response;
use tower_http::cors::{AllowHeaders, AllowMethods, AllowOrigin, CorsLayer};

/// The renderer origin in dev, `null` for the packaged Electron app loaded from
/// `file://`, and `tauri://localhost` for the Tauri app in `src-tauri/app`.
pub const ALLOWED_ORIGINS: [&str; 4] = ["http://127.0.0.1:5180", "http://localhost:5180", "null", "tauri://localhost"];

/// The renderer also edits and deletes, so not only GET, HEAD and POST.
pub const ALLOWED_METHODS: [&str; 6] = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"];

/// Those origins and methods with credentials; preflights answer `204`.
pub fn layer() -> CorsLayer {
    let origins = ALLOWED_ORIGINS.map(HeaderValue::from_static);
    let methods = ALLOWED_METHODS.map(|method| Method::from_bytes(method.as_bytes()).unwrap_or(Method::GET));
    CorsLayer::new()
        .allow_origin(AllowOrigin::list(origins))
        .allow_methods(AllowMethods::list(methods))
        .allow_headers(AllowHeaders::mirror_request())
        .allow_credentials(true)
}

/// tower-http answers preflights with `200`; the renderer has always received `204`.
pub async fn preflight_no_content(request: Request, next: Next) -> Response {
    let preflight = request.method() == Method::OPTIONS;
    let mut response = next.run(request).await;
    if preflight && response.status() == StatusCode::OK {
        *response.status_mut() = StatusCode::NO_CONTENT;
    }
    response
}

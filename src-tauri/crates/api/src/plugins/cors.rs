use tower_http::cors::CorsLayer;

/// The renderer origin in dev, and `null` for the packaged app loaded from `file://`.
pub const ALLOWED_ORIGINS: [&str; 3] = ["http://127.0.0.1:5180", "http://localhost:5180", "null"];

/// The renderer also edits and deletes, so not only GET, HEAD and POST.
pub const ALLOWED_METHODS: [&str; 6] = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"];

/// Those origins and methods with credentials; preflights answer `204`.
pub fn layer() -> CorsLayer {
    pending!(51)
}

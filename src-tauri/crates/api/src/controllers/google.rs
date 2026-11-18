use axum::Json;
use axum::extract::{Query, State};
use axum::http::header::{CACHE_CONTROL, CONTENT_SECURITY_POLICY, CONTENT_TYPE, REFERRER_POLICY};
use axum::http::{StatusCode, Uri};
use axum::response::{IntoResponse, Response};

use super::RouteTable;
use crate::dto::google::SaveGoogleCredentialsBody;
use crate::dto::{OK_RESPONSE, OkResponse};
use crate::error::{ApiError, ApiResult};
use crate::extract::ValidatedJson;
use crate::services::google::{GoogleConnectStart, GoogleStatus, OAuthCallback};
use crate::state::AppState;

pub fn routes(table: RouteTable) -> RouteTable {
    table
        .get("/google/status", status)
        .put("/google/credentials", save_credentials)
        .delete("/google/credentials", clear_credentials)
        .post("/google/connect", start_connect)
        .delete("/google/connect", cancel_connect)
        .delete("/google/disconnect", disconnect)
}

/// Outside the auth layer: the browser that Google redirects can't send app credentials.
pub fn public_routes(table: RouteTable) -> RouteTable {
    table.get("/google/oauth/callback", callback)
}

async fn status(State(state): State<AppState>) -> ApiResult<Json<GoogleStatus>> {
    Ok(Json(state.google.status().await?))
}

async fn save_credentials(
    State(state): State<AppState>,
    ValidatedJson(body): ValidatedJson<SaveGoogleCredentialsBody>,
) -> ApiResult<Json<GoogleStatus>> {
    Ok(Json(state.google.save_credentials(body).await?))
}

async fn clear_credentials(State(state): State<AppState>) -> ApiResult<Json<OkResponse>> {
    state.google.clear_credentials().await?;
    Ok(Json(OK_RESPONSE))
}

async fn start_connect(State(state): State<AppState>) -> ApiResult<Json<GoogleConnectStart>> {
    let server_url = state
        .server_url
        .as_deref()
        .ok_or_else(|| ApiError::internal("the server address is unknown, so Google can't redirect back"))?;
    Ok(Json(state.google.start_connect(server_url).await?))
}

async fn cancel_connect(State(state): State<AppState>) -> Json<OkResponse> {
    state.google.cancel_connect().await;
    Json(OK_RESPONSE)
}

async fn disconnect(State(state): State<AppState>) -> ApiResult<Json<OkResponse>> {
    state.google.disconnect().await?;
    Ok(Json(OK_RESPONSE))
}

fn parse_callback(uri: &Uri) -> OAuthCallback {
    let pairs = Query::<Vec<(String, String)>>::try_from_uri(uri).map(|Query(pairs)| pairs).unwrap_or_default();
    let mut callback = OAuthCallback::default();
    for (key, value) in pairs {
        let slot = match key.as_str() {
            "code" => &mut callback.code,
            "state" => &mut callback.state,
            "error" => &mut callback.error,
            _ => continue,
        };
        slot.get_or_insert(value);
    }
    callback
}

/// `GET /google/oauth/callback`: finishes the pending flow and answers a short page
/// for the browser tab. Only a callback matching the pending `state` changes anything.
async fn callback(State(state): State<AppState>, uri: Uri) -> Response {
    let callback = parse_callback(&uri);
    let outcome = match (&callback.error, &callback.code) {
        (Some(error), _) => {
            // Consent denied (or another Google error): end the flow it belongs to.
            let _ = state.google.fail_connect(callback.state.as_deref()).await;
            Err((StatusCode::BAD_REQUEST, safe_code(error)))
        }
        (None, Some(code)) => state
            .google
            .finish_connect(code, callback.state.as_deref())
            .await
            .map_err(|error| (error.status(), safe_code(error.code()))),
        (None, None) => Err((StatusCode::BAD_REQUEST, "missing_code".to_owned())),
    };
    match outcome {
        Ok(_) => page(StatusCode::OK, SUCCESS_PAGE.to_owned()),
        Err((status, code)) => {
            tracing::warn!("Google connection failed: {code}");
            page(status, ERROR_PAGE.replace("{code}", &code))
        }
    }
}

/// An error code as the page shows it: only `[a-z0-9_]`, at most 64 characters.
fn safe_code(code: &str) -> String {
    let code: String = code
        .chars()
        .filter(|character| character.is_ascii_lowercase() || character.is_ascii_digit() || *character == '_')
        .take(64)
        .collect();
    if code.is_empty() { "unknown_error".to_owned() } else { code }
}

fn page(status: StatusCode, body: String) -> Response {
    (
        status,
        [
            (CONTENT_TYPE, "text/html; charset=utf-8"),
            (CACHE_CONTROL, "no-store"),
            (REFERRER_POLICY, "no-referrer"),
            (CONTENT_SECURITY_POLICY, "default-src 'none'; style-src 'unsafe-inline'"),
        ],
        body,
    )
        .into_response()
}

/// The head shared by both pages (a macro, since `concat!` only takes literals).
macro_rules! page_head {
    () => {
        "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"><title>Life Board</title><style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5;color:#18181b;background:#fff}@media (prefers-color-scheme:dark){body{color:#fafafa;background:#09090b}}h1{font-size:1.25rem}p{margin:.5rem 0}code{font-size:.875rem}</style></head><body>"
    };
}

const SUCCESS_PAGE: &str = concat!(
    page_head!(),
    "<h1 lang=\"pt\">Conectado. Você pode voltar ao Life Board.</h1>",
    "<p lang=\"en\">Connected. You can go back to Life Board.</p>",
    "</body></html>"
);

const ERROR_PAGE: &str = concat!(
    page_head!(),
    "<h1 lang=\"pt\">Não foi possível conectar o Google Agenda. Volte ao Life Board e tente novamente.</h1>",
    "<p lang=\"en\">Could not connect Google Calendar. Go back to Life Board and try again.</p>",
    "<p><code>{code}</code></p>",
    "</body></html>"
);

//! There is no auth yet, so every request is allowed. When login arrives, this
//! is where the session gets validated; routes behind [`require_auth`] pick it
//! up without changes. `/api/health` stays public.

use async_trait::async_trait;
use axum::extract::{Request, State};
use axum::http::request::Parts;
use axum::middleware::Next;
use axum::response::Response;

use crate::state::AppState;

/// `Authenticate`: `Err(response)` rejects the request with that response.
#[async_trait]
pub trait Authenticator: Send + Sync + 'static {
    async fn authenticate(&self, parts: &Parts) -> Result<(), Response>;
}

/// `allowAll`.
#[derive(Debug, Clone, Copy, Default)]
pub struct AllowAll;

#[async_trait]
impl Authenticator for AllowAll {
    async fn authenticate(&self, _parts: &Parts) -> Result<(), Response> {
        Ok(())
    }
}

/// The layer on every protected route (`registerProtected`): runs the state's authenticator first.
pub async fn require_auth(State(state): State<AppState>, request: Request, next: Next) -> Response {
    let (parts, body) = request.into_parts();
    if let Err(response) = state.authenticator.authenticate(&parts).await {
        return response;
    }
    next.run(Request::from_parts(parts, body)).await
}

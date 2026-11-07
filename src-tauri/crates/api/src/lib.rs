//! Life Board's HTTP API in Rust: the port of `api/` (Fastify + Drizzle) with
//! the same routes, JSON and SQLite profile. See `CONTRACT.md`.
//!
//! This crate is being filled in by the issues of the Rust API series: bodies
//! that still say `pending!(N)` are implemented by issue #N.

/// The body of a declared function that issue `#N` implements. It names the
/// arguments so they count as used until then.
macro_rules! pending {
    ($issue:literal $(, $arg:expr)* $(,)?) => {{
        $(let _ = &$arg;)*
        todo!(concat!("pending #", stringify!($issue)))
    }};
}

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
    pending!(51, state)
}

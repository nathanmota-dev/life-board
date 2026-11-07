//! Routes (`controllers/*.controller.ts`). Each controller registers its routes
//! on a [`RouteTable`], which builds the axum router and records every
//! `(method, path)` so tests can compare them with the Node routes.
//!
//! Paths use axum's `{param}` syntax. A segment keeps one parameter name across
//! routes (a `matchit` rule), so the goal of `/goals/{id}/milestones/{milestoneId}`
//! is `{id}` where Fastify says `:goalId`.

pub mod calendar;
pub mod file_boards;
pub mod github;
pub mod goals;
pub mod habits;
pub mod health;
pub mod links;
pub mod mood;
pub mod projects;
pub mod settings;
pub mod stats;
pub mod tasks;
pub mod thoughts;

use axum::Router;
use axum::handler::Handler;
use axum::routing::{self, MethodRouter};

use crate::state::AppState;

/// Every route is mounted under this prefix.
pub const PREFIX: &str = "/api";

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct RouteInfo {
    pub method: &'static str,
    /// The full path, `/api` included.
    pub path: String,
}

#[derive(Default)]
pub struct RouteTable {
    router: Router<AppState>,
    routes: Vec<RouteInfo>,
}

macro_rules! method {
    ($name:ident, $method:literal) => {
        pub fn $name<H, T>(self, path: &str, handler: H) -> Self
        where
            H: Handler<T, AppState>,
            T: 'static,
        {
            self.add($method, path, routing::$name(handler))
        }
    };
}

impl RouteTable {
    pub fn new() -> Self {
        Self::default()
    }

    method!(get, "GET");
    method!(post, "POST");
    method!(put, "PUT");
    method!(patch, "PATCH");
    method!(delete, "DELETE");

    fn add(mut self, method: &'static str, path: &str, route: MethodRouter<AppState>) -> Self {
        self.routes.push(RouteInfo { method, path: format!("{PREFIX}{path}") });
        self.router = self.router.route(path, route);
        self
    }

    pub fn routes(&self) -> &[RouteInfo] {
        &self.routes
    }

    /// The router for these routes, without the `/api` prefix.
    pub fn into_router(self) -> Router<AppState> {
        self.router
    }
}

/// Routes outside the auth layer: `/api/health`.
pub fn public() -> RouteTable {
    health::routes(RouteTable::new())
}

/// Every other route, in the order `buildApp` registers the controllers.
pub fn protected() -> RouteTable {
    [
        tasks::routes,
        thoughts::routes,
        links::routes,
        goals::routes,
        calendar::routes,
        mood::routes,
        habits::routes,
        projects::routes,
        stats::routes,
        github::routes,
        file_boards::routes,
        settings::routes,
    ]
    .into_iter()
    .fold(RouteTable::new(), |table, register| register(table))
}

/// `(method, path)` of every route, public ones first.
pub fn all_routes() -> Vec<RouteInfo> {
    let mut routes = public().routes().to_vec();
    routes.extend_from_slice(protected().routes());
    routes
}

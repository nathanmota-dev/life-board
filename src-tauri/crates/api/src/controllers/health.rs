use crate::clock;
use axum::Json;
use serde::Serialize;

use super::RouteTable;
use crate::db::columns::to_iso;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Health {
    pub ok: bool,
    pub service: &'static str,
    pub time: String,
}

pub fn routes(table: RouteTable) -> RouteTable {
    table.get("/health", health)
}

async fn health() -> Json<Health> {
    Json(Health { ok: true, service: "life-board-api", time: to_iso(clock::now()) })
}

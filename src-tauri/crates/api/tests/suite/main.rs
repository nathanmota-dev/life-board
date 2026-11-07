//! The backend suite ported from `api/src/**/*.test.ts`, one module per TS file
//! at the mirrored path. Each ported test is ignored with `pending #N` until the
//! issue that implements its module turns it on. `routes`, `dto`, `golden` and
//! `db::migrator` are Rust-only (see `tests/parity-allowlist.json`).

#![allow(clippy::unwrap_used, clippy::expect_used)]

mod common;
mod controllers;
mod db;
mod dto;
mod golden;
mod plugins;
mod routes;
mod server;
mod services;

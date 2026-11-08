//! The backend suite, ported from the Node API's tests with one module per file.
//! `routes`, `dto`, `golden`, `http`, `sidecar` and `db::migrator` only exist here.

#![allow(clippy::unwrap_used, clippy::expect_used)]

mod common;
mod controllers;
mod db;
mod dto;
mod golden;
mod http;
mod plugins;
mod routes;
mod server;
mod services;
mod sidecar;

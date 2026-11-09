//! Request DTOs: field names, enum values, bounds, defaults,
//! trimming and optional vs nullable, checked by [`common::Dto::parse`].
//!
//! Field shapes: `T` is required, `Option<T>` is optional (missing = `None`),
//! and `Option<Option<T>>` is optional and nullable (`Some(None)` = `null`).

pub mod calendar;
pub mod common;
pub mod file_boards;
pub mod github;
pub mod goals;
pub mod habits;
pub mod links;
pub mod mood;
pub mod projects;
pub mod settings;
pub mod tasks;
pub mod thoughts;

pub use common::{Dto, IdParams, Items, OK_RESPONSE, OkResponse};

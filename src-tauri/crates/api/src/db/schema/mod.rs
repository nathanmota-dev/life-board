//! Tables (`db/schema/*.ts`). Each module has the row type returned by the
//! services, its text enums, and a `New*` insert type whose `None` fields take
//! the column default (like Drizzle's `$defaultFn`), used by services and tests.

pub mod app_settings;
pub mod calendar;
pub mod file_boards;
pub mod github;
pub mod goals;
pub mod habits;
pub mod mood;
pub mod projects;
pub mod tasks;
pub mod thoughts;

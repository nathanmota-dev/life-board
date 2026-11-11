//! Life Board as a Tauri app: the Rust API runs in this process and the
//! frontend build is shown in a WebKitGTK window. Linux only, not packaged yet.

pub mod app;
pub mod backend;
pub mod commands;
pub mod graphics;
pub mod webview;

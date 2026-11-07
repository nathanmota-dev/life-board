//! The `life-board-api` sidecar. See `life_board_api::server::run_sidecar`.

use std::process::ExitCode;

#[tokio::main]
async fn main() -> ExitCode {
    ExitCode::from(life_board_api::server::run_sidecar().await)
}

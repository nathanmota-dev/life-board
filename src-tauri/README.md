# src-tauri

This folder holds the Rust backend, which the Electron app starts as a
sidecar, and the first pieces of the Tauri app that will replace Electron.

## What lives here now

- `crates/api/`: the `life-board-api` crate (library and sidecar binary). Its
  HTTP contract and SQLite profile are described in
  [`crates/api/CONTRACT.md`](crates/api/CONTRACT.md).
- `crates/api/migrations/`: the SQL migrations, embedded in the binary.
- `crates/api/tests/suite/`: the backend test suite.
- `crates/api/tests/fixtures/`: a profile, golden responses, sealed secrets and
  the route list recorded from the Node API of 1.1.2, kept frozen as regression
  tests.
- `app/`: the `life-board-desktop` crate, a minimal Tauri 2 app for Linux. It
  runs `life_board_api::start_server` in its own process on a free port of
  `127.0.0.1` and shows the frontend build (`out/renderer`) in a WebKitGTK
  window. It has no tray, pomodoro, notifications or capture window yet, and it
  **is not packaged**: Electron is still the shipped app.

The Cargo workspace for the API is the root `Cargo.toml`; the toolchain is
pinned in the root `rust-toolchain.toml`. `app/` has its own `[workspace]` and
`Cargo.lock` and is not a member of the root workspace, so `cargo test
--workspace`, `npm test` and CI need no `webkit2gtk`.

## Commands

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace                  # npm run test:rust
npm run test:coverage                   # cargo llvm-cov, at least 80%
```

Run the tests with `TZ=UTC` and `TZ=America/Sao_Paulo` too: day keys use local
time.

The `e2e` feature lets the Playwright suite move the clock and redirect GitHub.
Only `npm run test:e2e` builds it, in `target/e2e`.

## The Tauri app (`app/`)

It needs the WebKitGTK and Tauri system libraries and the Tauri CLI:

```bash
sudo apt install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev
cargo install tauri-cli --version "^2" --locked
```

Build the frontend, then the app (no bundle):

```bash
npm run build:app
(cd src-tauri/app && cargo tauri build --no-bundle)
LIFE_BOARD_DATA_DIR=$(mktemp -d) src-tauri/app/target/release/life-board-desktop
```

Always pass a temporary `LIFE_BOARD_DATA_DIR` while it is in development;
without it the app uses Tauri's `app_data_dir()`
(`~/.local/share/dev.nathanmota.lifeboard`). It never opens the Electron
profile in `~/.config/life-board-app`.

Its secret key is 32 random bytes per launch, kept in memory, and the API
starts with `reset_secrets`, so a saved GitHub token does not survive a
restart. Storing the key belongs to the later secret-key migration. There is no
dev server either: `electron-vite dev` would also start Electron.

Its checks use its own manifest:

```bash
cargo fmt --manifest-path src-tauri/app/Cargo.toml --check
cargo clippy --manifest-path src-tauri/app/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/app/Cargo.toml
cargo llvm-cov --manifest-path src-tauri/app/Cargo.toml \
  --ignore-filename-regex 'src/(app|main)\.rs$' \
  --fail-under-lines 80 --fail-under-functions 80 --fail-under-regions 80
```

`src/app.rs` and `src/main.rs` are the Tauri wiring, which needs a display;
the logic they call lives in `src/backend.rs` and `src/webview.rs`.

## What comes later

The `window.desktop` bridge over Tauri commands, the WebKitGTK rendering
check, the tray, pomodoro, notifications and capture window, and then
packaging, come in later issues.

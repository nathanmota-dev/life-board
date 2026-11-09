# src-tauri

This folder will hold the Tauri app that replaces Electron. Today it holds the
Rust backend, which the Electron app starts as a sidecar.

## What lives here now

- `crates/api/`: the `life-board-api` crate (library and sidecar binary). Its
  HTTP contract and SQLite profile are described in
  [`crates/api/CONTRACT.md`](crates/api/CONTRACT.md).
- `crates/api/migrations/`: the SQL migrations, embedded in the binary.
- `crates/api/tests/suite/`: the backend test suite.
- `crates/api/tests/fixtures/`: a profile, golden responses, sealed secrets and
  the route list recorded from the Node API of 1.1.2, kept frozen as regression
  tests.

The Cargo workspace is the root `Cargo.toml`; the toolchain is pinned in the
root `rust-toolchain.toml`. There is no Tauri dependency yet, so building needs
no `webkit2gtk`.

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

## What comes later

The Tauri shell (this folder becomes the Tauri app crate) and the frontend
changes it needs come in later issues.

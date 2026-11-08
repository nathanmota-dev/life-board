# src-tauri

This folder will hold the Tauri app that replaces Electron. Today it only holds
the Rust port of the backend; the desktop app still uses the Node API in `api/`.

## What lives here now

- `crates/api/`: the `life-board-api` crate (library and sidecar binary), the
  Rust port of `api/`. It keeps the HTTP contract and opens the same SQLite
  profile; see [`crates/api/CONTRACT.md`](crates/api/CONTRACT.md).
- `crates/api/tests/suite/`: the backend test suite translated from
  `api/src/**/*.test.ts`, one module per TS file at the mirrored path.
- `crates/api/tests/fixtures/`: a profile, golden responses, sealed secrets and
  the route list recorded from the Node API.
- `scripts/test-parity.mjs`: checks that every TS test case has its Rust port
  (`npm run test:parity`).
- `scripts/record-node-fixtures.mjs`: records the fixtures from the Node API.

The Cargo workspace is the root `Cargo.toml`; the toolchain is pinned in the
root `rust-toolchain.toml`. There is no Tauri dependency yet, so building needs
no `webkit2gtk`.

## Rust port in progress

The crate implements every route of the Node API, and the ported tests run with
no `ignore`. The desktop app still starts the Node API; the second part of #53
switches Electron to the sidecar and removes `api/`.

## Commands

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace                                        # npm run test:rust
cargo test -p life-board-api -- --list --include-ignored      # every ported test
npm run test:parity
node src-tauri/scripts/record-node-fixtures.mjs               # regenerate the fixtures
```

Run the tests with `TZ=UTC` and `TZ=America/Sao_Paulo` too: day keys use local
time, like `date.service.ts`.

## What comes later

The Tauri shell (this folder becomes the Tauri app crate), the frontend
changes it needs and packaging come in later issues.

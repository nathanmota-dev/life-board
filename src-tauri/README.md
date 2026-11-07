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

The crate already declares every module, route, DTO, state field and service
method. Bodies that are not written yet call `pending!(N)`, which panics with
the issue that implements them:

| Issue | Scope |
| --- | --- |
| #51 | Foundation (database, migrator, errors, auth, CORS, crypto, dates, startup, sidecar) and tasks, thoughts, links, mood, calendar, habits |
| #52 | Goals, projects, stats, settings, file boards and file storage |
| #53 | GitHub client and service, then the switch from the Node API |

Each ported test carries `#[ignore = "pending #N"]` and is turned on by the
issue that implements its module. Golden tests (`tests/suite/golden.rs`) follow
the same rule per module.

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

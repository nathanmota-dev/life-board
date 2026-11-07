# Life Board

Life Board is a personal Electron desktop app for organizing and tracking everything in day-to-day life in one place. Its goal is to work as a personal control board, covering:

- Tasks: to-dos and personal projects.
- Calendar: events, appointments, and scheduling.
- Goals: short- and long-term goals and their progress.
- GitHub: issues and pull requests to follow up on.
- Habits and routines: recurring personal tracking such as drinking water, cleaning the house, and similar chores or habits.

## Technology stack

- Desktop shell: Electron, built with electron-vite.
- Frontend: Vite, React, Tailwind CSS, shadcn/ui components, and TanStack Router.
- Backend (`api/`): Node, Fastify, Drizzle ORM with SQLite (`@libsql/client`) and Zod, organized as DTOs, controllers and services. It runs inside Electron's `utilityProcess` and listens on 127.0.0.1.
- Tests: Vitest, with jsdom and Testing Library for frontend tests. The backend requires at least 80% coverage.

## Frontend conventions

- Keep domain and component prop types in `web/src/types/`, never inside views or components.
- A component has a single `return`; when it needs alternative layouts, render child components (or `DataState`) instead.
- Keep views and components under 350 lines; move reusable logic to `web/src/lib/` and HTTP calls to `web/src/services/`.
- Name files in kebab-case, like the existing routes.
- Use the accent tokens (`primary`, `chart-1`…`chart-5`) for highlights and charts so the Settings accent color applies everywhere.

## Agent instructions

Before implementing or modifying any code, read and follow all instructions in ./RULES.md.

When a task requires creating a Git branch, commit, or pull request, follow the `git-pr-conventions` skill at `.agents/skills/git-pr-conventions/SKILL.md`. List the checklist below under **Validation** in the PR. Before running it, read and follow `.agents/skills/quality-gate-safe-delivery/SKILL.md`, which defines the implementation scope and the rules for handling regressions.

## Mandatory verification before completing a task

Whenever a task creates, modifies, or deletes application code, tests, runtime assets, dependencies, scripts, migrations, or build/packaging/workflow configuration, run **every command below**, in order, from the repository root before reporting the task as complete or opening a PR. This applies to desktop (Electron main/preload), backend (`api/`), and frontend (`web/`) changes, regardless of how small the change is. A targeted test or a partial checklist does not replace the full verification.

```bash
npm ci
npm run typecheck
npm test
npm run test:coverage
npm run test:quality
npm run test:coverage:ci
node scripts/quality-gate.js
npm run benchmark:ci
node scripts/benchmark-gate.js
npm run test:e2e:infra
npm run test:e2e
npm run package:linux
(cd release && sha256sum life-board_*_amd64.deb life-board-*-x86_64.AppImage latest-linux.yml > SHA256SUMS.txt)
node desktop/scripts/release-checks.mts assets release
dpkg-deb --info release/life-board_*_amd64.deb
dpkg-deb --contents release/life-board_*_amd64.deb
desktop/scripts/smoke-deb.sh   # inside a disposable container with the DEB installed; see below
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
TZ=UTC cargo test --workspace
TZ=America/Sao_Paulo cargo test --workspace
npm run test:parity
git diff --check
```

Use Node.js 22.12 or newer (CI uses 24.18.0) on Linux x64.

- `npm ci` must not change `package-lock.json`. Run it when dependencies changed or `node_modules` may be stale.
- `npm run typecheck` checks the desktop, frontend, API and E2E projects.
- `npm test` runs the desktop, frontend and API unit tests.
- `npm run test:coverage` runs the API suite with coverage and fails below 80% for lines, functions, branches or statements.
- `npm run test:quality` tests the gate scripts. `npm run test:coverage:ci` writes the coverage reports that `node scripts/quality-gate.js` compares; `npm run benchmark:ci` writes the results that `node scripts/benchmark-gate.js` compares. Inspect `reports/quality-gate.md` and `reports/performance.md`. See `docs/qualidade.md`.
- `npm run test:e2e:infra` tests the E2E launcher; `npm run test:e2e` rebuilds production output and runs the Playwright suite against the real Electron app with Xvfb, D-Bus, an isolated keyring and temporary profiles. It needs `xvfb`, `xauth`, `dbus-x11` and `gnome-keyring`; see `docs/e2e.md`. If a Playwright worker crashes (for example `SIGSEGV`), rerun the full suite and report both runs; a pass of only the failed spec does not count.
- `npm run package:linux` already runs `npm run build` (and therefore the typecheck); a separate `npm run build` is not an extra required check. It generates the DEB, AppImage and `latest-linux.yml` in `release/` and must load `@libsql/linux-x64-gnu` in the `after-pack` hook. Never publish these artifacts.
- `release-checks.mts assets release` validates names, sizes, the feed's SHA-512 and the SHA-256 list. `dpkg-deb` must show package `life-board` for amd64, the migrations and the unpacked native module.
- The Rust commands check the API port in `src-tauri/crates/api` with the toolchain pinned in `rust-toolchain.toml`. `cargo test` runs twice because day keys use the local time zone. `npm run test:parity` fails when a test in `api/src/**/*.test.ts` has no Rust port or a Rust test has no TS case nor a justified entry in `src-tauri/crates/api/tests/parity-allowlist.json`; see `docs/backend.md`.
- Run `desktop/scripts/smoke-deb.sh` against the DEB installed in a disposable Ubuntu 24.04 container as a non-root user, never on the host or a personal profile. Docker here cannot bind-mount `/mnt/linux-data/…`: use `docker create`, `docker cp` and `docker start -a`. The container needs `--security-opt seccomp=unconfined` so the Chromium sandbox can start. The smoke must reach `/api/health` and create `life-board.db` and `secret.key.enc`.

Additional checks that apply only to some changes:

- **Frontend or visible text:** open the app (`npm run dev` or `npm start` after a build) and review the affected screens in light and dark themes, in Portuguese and English, and at narrow width.
- **Workflows (`.github/workflows/`):** run `actionlint .github/workflows/*.yml`. When `actionlint` is not installed, say so and rely on the workflow's own CI run.
- **Windows or macOS code paths:** Linux results never validate them. Run the matching commands on the native OS (see `docs/desenvolvimento.md`) or point to the successful **Build Windows** / **Build macOS** run of the same commit. Without either, report them as not validated.
- **Migrations:** besides the suites above, confirm that a profile created by the previous version opens and keeps its data.

Fix verification failures and rerun the affected checks before completing the task. In the final response and in the PR, list each command with its real result. If an environment problem prevents a required check from running or passing, name the blocked check and the reason; never silently skip it or claim that verification passed. Do not open a PR while a required check is failing or blocked unless the user explicitly accepts it.

### Protected validation policy

These files define the gates, baselines, benchmarks and PR report. `scripts/protected-paths.json` is the machine-readable source; the workflows read it from the trusted base or default branch, and a test keeps this list in sync with it. After the policy is on the base branch, a pull request that changes them needs a same-repository `ci/` branch and the `validation-infrastructure-approved` label:

- `AGENTS.md`
- `.agents/skills/quality-gate-safe-delivery/SKILL.md`
- `scripts/protected-paths.json`
- `scripts/baseline.json`
- `scripts/benchmark-baseline.json`
- `scripts/quality-gate.js`
- `scripts/quality-gate.test.js`
- `scripts/diff-coverage.js`
- `scripts/diff-coverage.test.js`
- `scripts/check-test-markers.js`
- `scripts/check-test-markers.test.js`
- `scripts/benchmark-gate.js`
- `scripts/benchmark-gate.test.js`
- `scripts/run-rust-benchmark.js`
- `scripts/run-rust-benchmark.test.js`
- `scripts/pr-validation.js`
- `scripts/pr-validation.test.js`
- `.github/workflows/frontend-ci.yml`
- `.github/workflows/e2e.yml`
- `.github/workflows/quality-gate.yml`
- `.github/workflows/performance.yml`
- `.github/workflows/pr-validation.yml`
- `clippy.toml`
- `package.json`
- `api/package.json`
- `web/package.json`
- `api/vitest.config.ts`
- `web/vitest.config.ts`
- `desktop/vitest.config.ts`
- `api/vitest.benchmark.config.ts`
- `web/vitest.benchmark.config.ts`
- `api/benchmarks/**`
- `web/benchmarks/**`

### Exceptions

The checklist may be skipped only when the task makes **no file changes** (planning, read-only investigation, answering a question) or changes **only documentation or prose-only text files** (`README.md`, `AGENTS.md`, `RULES.md`, files under `docs/`, release notes). In that case, still run `git diff --check` and check that edited links and anchors resolve.

The exception depends on the actual changes, not the task label or file format: source code, CSS, HTML, scripts, migrations, workflows and configuration files are text files but are **not** documentation-only changes. If a task mixes documentation with any implementation change, the full checklist remains mandatory.

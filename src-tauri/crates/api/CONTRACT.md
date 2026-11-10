# Rust API contract

The Rust API (`life-board-api`) replaced the Node API of 1.1.2 without any
change to `web/` and without migrating anyone's data. This file is the
reference for what it must keep doing.

The proof is in the tests: the suite ported from Node (`tests/suite`), the route
list (`tests/fixtures/node-routes.json`) and the golden responses recorded from
Node (`tests/fixtures/node-1.1.2/`), now frozen.

## Routes

The same paths, methods, status codes, query parameter names, camelCase JSON
fields and `null`/missing-field behavior as the Node controllers. Every route
is under `/api`. `GET` routes also answer `HEAD`.

| Module | Method and path | Input | Success |
| --- | --- | --- | --- |
| health | `GET /api/health` | — | `200 { ok, service: "life-board-api", time }` |
| tasks | `GET /api/tasks` | `ListTasksQuery` | `200 { items: Task[] \| TaskWithChildren[] }` |
| | `POST /api/tasks` | `CreateTaskBody` | `201 TaskWithChildren` |
| | `PATCH /api/tasks/order` | `ReorderTasksBody` | `200 { ok: true }` |
| | `GET /api/tasks/:id` | — | `200 Task` |
| | `PATCH /api/tasks/:id` | `UpdateTaskBody` | `200 Task` |
| | `DELETE /api/tasks/:id` | — | `200 { ok: true }` |
| | `POST /api/tasks/:id/restore` | — | `200 Task` |
| thoughts | `GET /api/thoughts` | `ListThoughtsQuery` | `200 { items, nextCursor }` |
| | `POST /api/thoughts` | `CreateThoughtBody` | `201 Thought` |
| | `GET /api/thoughts/:id` | — | `200 Thought` |
| | `PATCH /api/thoughts/:id` | `UpdateThoughtBody` | `200 Thought` |
| | `DELETE /api/thoughts/:id` | — | `200 { ok: true }` |
| links | `POST /api/links/resolve` | `ResolveLinksBody` | `200 { links: { moduleId, entity }[] }` |
| | `GET /api/links/backlinks/:kind/:id` | `BacklinkTarget` (path) | `200 { backlinks }` |
| goals | `GET /api/goals` | — | `200 { items: GoalSummary[] }` |
| | `POST /api/goals` | `CreateGoalBody` | `201 { goal, milestonesCreated }` |
| | `GET /api/goals/:id` | — | `200 { goal, milestones }` |
| | `PATCH /api/goals/:id` | `UpdateGoalBody` | `200 GoalSummary` |
| | `DELETE /api/goals/:id` | — | `200 { ok: true }` |
| | `GET /api/goals/:id/progress` | `GoalProgressQuery` | `200 { items, startingProgress }` |
| | `POST /api/goals/:id/milestones` | `CreateMilestoneBody` | `201 GoalMilestone` |
| | `PATCH /api/goals/:goalId/milestones/:milestoneId` | `UpdateMilestoneBody` | `200 GoalMilestone` |
| | `DELETE /api/goals/:goalId/milestones/:milestoneId` | — | `200 { ok: true }` |
| calendar | `GET /api/calendar/events` | `ListEventsQuery` | `200 { items }` |
| | `POST /api/calendar/events` | `CreateEventBody` | `201 CalendarEvent` |
| | `PATCH /api/calendar/events/:id` | `UpdateEventBody` | `200 CalendarEvent` |
| | `DELETE /api/calendar/events/:id` | — | `200 { ok: true }` |
| mood | `GET /api/mood/today` | — | `200 { day, entry, nextAvailableAt }` |
| | `GET /api/mood/entries` | `ListMoodQuery` | `200 { items }` |
| | `POST /api/mood/entries` | `UpsertMoodBody` | `201` created / `200` updated, `MoodEntry` |
| | `DELETE /api/mood/entries/:id` | — | `200 { ok: true }` |
| habits | `GET /api/habits` | — | `200 { items: HabitSummary[] }` |
| | `POST /api/habits` | `CreateHabitBody` | `201 Habit` |
| | `PATCH /api/habits/:id` | `UpdateHabitBody` | `200 Habit` |
| | `DELETE /api/habits/:id` | — | `200 { ok: true }` |
| | `GET /api/habits/logs` | `ListHabitLogsQuery` | `200 { items: { habitId, day, count, target }[] }` |
| | `POST /api/habits/:id/logs` | `LogHabitBody` | `200 { habitId, day, count }` |
| | `PUT /api/habits/:id/logs/:day` | `HabitLogParams`, `SetHabitLogBody` | `200 { habitId, day, count }` |
| projects | `GET /api/projects` | `ListProjectsQuery` | `200 { items }` |
| | `POST /api/projects` | `CreateProjectBody` | `201 Project` |
| | `GET /api/projects/:id` | — | `200 Project` |
| | `GET /api/projects/:id/history` | — | `200 { items }` |
| | `PATCH /api/projects/:id` | `UpdateProjectBody` | `200 Project` |
| | `PATCH /api/projects/:id/move` | `MoveProjectBody` | `200 { items }` (the board) |
| | `POST /api/projects/:id/archive` | — | `200 Project` |
| | `POST /api/projects/:id/restore` | — | `200 Project` |
| | `DELETE /api/projects/:id` | — | `200 { ok: true }` |
| stats | `GET /api/stats/this-week` | — | `200 WeekStats` |
| github | `GET /api/github/status` | — | `200 { connected, login, lastSyncAt, lastSyncError }` |
| | `POST /api/github/connect` | `ConnectGithubBody` | `200 { connected: true, login }` |
| | `DELETE /api/github/disconnect` | — | `200 { ok: true }` |
| | `POST /api/github/sync` | — | `200 { ok, count, issues, login }` |
| | `GET /api/github/contributions` | — | `200 { login, total, days }` |
| | `GET /api/github/repos/recent` | `RecentReposQuery` | `200 { items }` |
| | `GET /api/github/prs` | `ListPrsQuery` | `200 { items }` |
| | `GET /api/github/issues` | `ListIssuesQuery` | `200 { items }` |
| file-boards | `GET /api/file-boards` | — | `200 { items }` |
| | `POST /api/file-boards` | `CreateBoardBody` | `201 FileBoard` |
| | `PATCH /api/file-boards/:id` | `UpdateBoardBody` | `200 FileBoard` |
| | `DELETE /api/file-boards/:id` | — | `200 { ok: true }` |
| | `GET /api/file-boards/:id/items` | — | `200 { items }` |
| | `POST /api/file-boards/:id/items` | multipart: `file` + `UploadItemFields` | `201 FileItem` |
| | `PATCH /api/file-items/:id` | `UpdateItemBody` | `200 FileItem` |
| | `DELETE /api/file-items/:id` | — | `200 { ok: true }` |
| | `GET /api/file-items/:id/file` | — | `200` the bytes, `Content-Type` = item mime, `Content-Length`, `Cache-Control: private, max-age=3600` |
| settings | `GET /api/settings/files` | — | `200 { baseDir, uploadsDir, defaultUploadsDir }` |
| | `PUT /api/settings/files` | `UpdateFilesSettingsBody` | `200 { baseDir, uploadsDir, defaultUploadsDir }` |

In axum a path segment keeps one parameter name across routes, so the Rust
router says `/goals/{id}/milestones/{milestoneId}` where Fastify says
`:goalId`. Parameter names never reach the client.

## Requests

The DTOs in `src/dto/` keep the rules of the Zod schemas of 1.1.2, translated
one by one (see `tests/suite/dto.rs`):

- `T` is required, `Option<T>` is optional, `Option<Option<T>>` is optional and
  nullable (`Some(None)` is an explicit `null`). Unknown keys are ignored.
- String lengths count Unicode code points, like Zod 4. `.trim()` trims before
  the length checks and the value is stored trimmed.
- Numbers in bodies must be JSON numbers; `.int()` rejects fractions and
  integers past `Number.MAX_SAFE_INTEGER`.
- Query and path values are strings: `limit` uses `Number(value)` and its
  default; booleans are `"true"`/`"false"` (`z.stringbool()` also takes
  `1/0`, `yes/no`, `on/off`, `y/n`, `enabled/disabled` on `GET /thoughts`).
  A repeated query key is an array, which fails a string rule.
- Dates (`z.coerce.date()`) take a number of milliseconds or an ISO 8601
  string: a date alone is UTC midnight, a date-time with `Z` or an offset is
  that instant, and a date-time without one is local time.

## Errors

- `{ "error": <code>, "message": <text> }`.
- Validation fails with `400 { "error": "validation_error", "message", "issues": [{ "path": "/field", "message" }] }`.
  Paths are JSON pointers like today (`/title`, `/items/1`, `/0/id` for a
  root array, `/` for the root). Message text may differ (the web app doesn't
  display it); codes and paths may not.
- Domain errors keep their status and code: `404 not_found`, `400 invalid_range`,
  `focus_limit`, `invalid_order`, `future_day`, `project_not_done`,
  `missing_file`, `relative_dir`, `invalid_dir`, `not_connected`,
  `invalid_token`, `500 move_failed`, `502 sync_failed`, `github_unavailable`.
- Body errors keep the codes of the Node API: `400 FST_ERR_CTP_EMPTY_JSON_BODY`,
  `400 FST_ERR_CTP_INVALID_JSON_BODY`, `415 FST_ERR_CTP_INVALID_MEDIA_TYPE`,
  `413 FST_ERR_CTP_BODY_TOO_LARGE` (JSON bodies up to 1 MiB). `text/plain` is
  read as a string and fails the object schemas. A request without a body and
  without `Content-Type` fails validation, like `undefined` in Zod.
- Uploads follow the multipart rules of 1.1.2: one file of up to 20 MiB, or
  `413 FST_REQ_FILE_TOO_LARGE`. The first file part counts whatever its field
  is named and later ones are ignored; a field name sent twice is dropped; more
  than 1000 parts before the file is `413 FST_PARTS_LIMIT`. Field errors
  (`400 FST_PROTO_VIOLATION`, `406 FST_INVALID_JSON_FIELD_ERROR`) only surface
  when the form has no file. A malformed form is `500 internal_error`.
- Other client errors pass through with `bad_request` when they have no code.
- Anything unexpected is logged and returns `500 { "error": "internal_error", "message": "Something went wrong." }`.

## On disk

The Rust API opens the same `life-board.db`, in the standard SQLite format.

- Timestamps are integer milliseconds, booleans `0/1`, string arrays JSON text
  (`'[]'` when empty), ids ULID text.
- `PRAGMA foreign_keys = ON` and `PRAGMA secure_delete = ON` when the database
  opens. The path is opened as is, never parsed as a `file:` URI.
- Migrations come from `migrations/` (embedded at compile time) and are recorded
  the way Drizzle's migrator did, so profiles from 1.1.2 and earlier keep working:
  - `CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)`;
    `SERIAL` is not an integer primary key in SQLite, so `id` stays `NULL`.
  - The last applied migration is the row with the highest `created_at`; every
    migration whose journal `when` is greater runs, split on
    `--> statement-breakpoint`, followed by
    `INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (<sha256 hex of the file>, <when>)`.
  - All pending statements run in one deferred transaction with
    `foreign_keys` off.
- Uploads live in `<data dir>/uploads`, or in `<folder>/life-board-app/uploads`
  when Settings > Files picked a folder (`app_settings.uploads_base_dir`).
  `storage_path` is relative to that folder.

## Intended differences

- `GET /api/thoughts?search=…` applies the other filters to every match. Node
  puts `title like ? or body like ?` inside Drizzle's `and()` without
  parentheses, so a thought whose body matches is returned even when it is
  deleted or fails `pinned`, `tag` or `cursor`. Rust wraps the search (#51).

- Settings > Files checks that a folder is writable by creating and removing an
  empty file, because `access(W_OK)` has no safe Rust equivalent. The result
  only differs where `access` is wrong about it (a folder without search
  permission, or a read-only folder on Windows): Rust answers `400 invalid_dir`
  where Node passed the check and then failed with `500`.

- Input the app never sends differs from Node on purpose:
  - dates accept only milliseconds and ISO 8601, not what JavaScript's `new Date`
    also guesses from other text (`?from=1`, `10/20/2026`);
  - `GET /api/tasks/` (empty id) is `404`, not `400` on `/id`;
  - an `OPTIONS` request with no `Origin` is `204`, not `400`;
  - a token with characters outside Latin-1 reaches GitHub and fails there;
  - a value that breaks two Zod rules reports one issue, not two.
- JSON answers say `application/json` without `charset`, and `Vary` and
  `Access-Control-Allow-Methods` are written differently, with the same meaning.

## JSON

- Timestamps are serialized like `Date.toJSON()`: `YYYY-MM-DDTHH:mm:ss.sssZ`.
- Nullable columns are `null`, never missing. The only optional field is
  `Backlink.meta`, which is missing when there is nothing to add.
- Day keys (`YYYY-MM-DD`) use the local time zone of the process.

## CORS

Origins `http://127.0.0.1:5180`, `http://localhost:5180`, `null` (the
packaged Electron renderer) and `tauri://localhost` (the Tauri app in
`src-tauri/app`); methods `GET HEAD POST PUT PATCH DELETE`; credentials
allowed. Preflights answer `204`. Other origins get no
`Access-Control-Allow-Origin`.

## Auth

`/api/health` is public. Every other route goes through `plugins::auth`, which
allows all requests (`AllowAll`). Tests plug in a
rejecting `Authenticator` through `AppOptions::authenticator`.

## Startup

In order:

1. create the data directory;
2. open `life-board.db` and migrate;
3. when `resetSecrets`, delete `github_settings` (the only encrypted secret);
4. `files_settings.load()` points the shared storage at the saved folder;
5. `file_boards.purge_deleted()` drops rows soft deleted by earlier versions;
6. listen on `127.0.0.1:0` (or the requested host and port).

## Sidecar binary `life-board-api`

Started by Electron (`desktop/src/backend.ts`).

- Environment: `LIFE_BOARD_DATA_DIR` (required), optional `LIFE_BOARD_HOST`
  and `LIFE_BOARD_PORT`.
- The key arrives as **one JSON line on stdin**,
  `{"type":"secret-key","key":"<base64, 32 bytes>","resetSecrets":false}`,
  never in the environment or arguments .
- Once listening, it prints one line on stdout:
  `{"type":"ready","url":"http://127.0.0.1:<port>"}`. Logs go to stderr.
- It exits with a non-zero code when startup fails, and exits when stdin
  closes, so it never outlives the desktop shell.

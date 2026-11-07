#!/usr/bin/env node
// Records compatibility fixtures from the current Node API (api/), so the Rust
// port can prove it reads the same profile and answers the same way.
//
//   node src-tauri/scripts/record-node-fixtures.mjs
//
// It writes, under src-tauri/crates/api/tests/fixtures/:
//   node-<version>.db          a profile migrated by Node, with fixed rows in every table
//   node-<version>/*.json      Node's answers to date-independent GET routes on that profile
//   node-<version>/manifest.json  the requests, in the order they were made
//   crypto.json                values sealed by the Node CryptoService with a fixed key
//   node-routes.json           every route Fastify registers (method + path)
//
// Running it again produces no diff: ids and timestamps are fixed, and sealed
// values are reused while the Node CryptoService still opens them.

import { createRequire } from "node:module"
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { createServer } from "vite"

const root = resolve(import.meta.dirname, "../..")
const fixtures = join(root, "src-tauri/crates/api/tests/fixtures")
const migrationsFolder = join(root, "api/drizzle")
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
const profileName = `node-${version}`

// The test key: 32 bytes of 0x2a. Never a real secret.
const KEY = Buffer.alloc(32, 0x2a)
const TOKEN = "ghp_fixture0123456789abcdefghij"
const PLAINTEXTS = [TOKEN, "", "olá 🌱 — unicode secret"]

const json = (value) => `${JSON.stringify(value, null, 2)}\n`
const at = (iso) => new Date(iso)

/** GET routes whose answers don't depend on today's date or on the data folder's path. */
const GETS = [
  ["tasks", "tasks.list", "/api/tasks"],
  ["tasks", "tasks.board", "/api/tasks?include=children"],
  ["tasks", "tasks.archived", "/api/tasks?archived=true"],
  ["tasks", "tasks.search", "/api/tasks?search=electricity"],
  ["tasks", "tasks.checklist", "/api/tasks?parentTaskId=t-trip"],
  ["tasks", "tasks.focus-day", "/api/tasks?focusDay=2026-10-19"],
  ["tasks", "tasks.pinned", "/api/tasks?pinned=true&color=blue"],
  ["tasks", "tasks.get", "/api/tasks/t-trip"],
  ["tasks", "tasks.get-deleted", "/api/tasks/t-gone"],
  ["thoughts", "thoughts.list", "/api/thoughts"],
  ["thoughts", "thoughts.page", "/api/thoughts?limit=2"],
  ["thoughts", "thoughts.next-page", "/api/thoughts?limit=2&cursor=0:1791277200000:th_idea"],
  ["thoughts", "thoughts.bad-cursor", "/api/thoughts?cursor=abc"],
  ["thoughts", "thoughts.tag", "/api/thoughts?tag=travel&pinned=true"],
  ["thoughts", "thoughts.search", "/api/thoughts?search=GROCERIES"],
  ["thoughts", "thoughts.get", "/api/thoughts/th_plan"],
  ["links", "links.backlinks-thought", "/api/links/backlinks/thought/th_plan"],
  ["links", "links.backlinks-task", "/api/links/backlinks/task/t-trip"],
  ["calendar", "calendar.list", "/api/calendar/events"],
  ["calendar", "calendar.range", "/api/calendar/events?from=2026-10-20&to=2026-10-21"],
  ["mood", "mood.entries", "/api/mood/entries"],
  ["mood", "mood.entries-limit", "/api/mood/entries?limit=1"],
  ["habits", "habits.logs", "/api/habits/logs"],
  ["habits", "habits.logs-filtered", "/api/habits/logs?habitId=h-water&from=2026-10-16"],
  ["goals", "goals.progress", "/api/goals/g-books/progress"],
  ["goals", "goals.progress-range", "/api/goals/g-books/progress?from=2026-10-01&to=2026-10-05"],
  ["goals", "goals.progress-deleted", "/api/goals/g-gone/progress"],
  ["projects", "projects.board", "/api/projects"],
  ["projects", "projects.archived", "/api/projects?archived=true"],
  ["projects", "projects.get", "/api/projects/p-paused"],
  ["projects", "projects.history", "/api/projects/p-garden/history"],
  ["projects", "projects.get-deleted", "/api/projects/p-gone"],
  ["file_boards", "file-boards.list", "/api/file-boards"],
  ["file_boards", "file-boards.items", "/api/file-boards/b-receipts/items"],
  ["file_boards", "file-boards.items-purged", "/api/file-boards/b-gone/items"],
  ["github", "github.status", "/api/github/status"],
  ["github", "github.prs", "/api/github/prs"],
  ["github", "github.prs-kind", "/api/github/prs?kind=authored"],
  ["github", "github.issues", "/api/github/issues"],
  ["github", "github.issues-kind", "/api/github/issues?kind=in_my_repos&limit=1"],
]

// Fastify registers every route through find-my-way; record them as they are added.
const routes = []
const Router = createRequire(join(root, "api/package.json"))("find-my-way")
const on = Router.prototype.on
Router.prototype.on = function (method, path, ...rest) {
  for (const verb of [method].flat()) routes.push({ method: verb, path })
  return on.call(this, method, path, ...rest)
}

const vite = await createServer({
  root,
  configFile: false,
  logLevel: "error",
  appType: "custom",
  server: { middlewareMode: true, hmr: false, watch: null },
})
const load = (file) => vite.ssrLoadModule(join(root, "api/src", file))
const temporary = mkdtempSync(join(tmpdir(), "life-board-fixtures-"))

try {
  const { createDb, sqliteFileUrl } = await load("db/client.ts")
  const schema = await load("db/schema/index.ts")
  const { CryptoService } = await load("services/crypto.service.ts")
  const { startServer } = await load("server.ts")

  const crypto = recordCrypto(new CryptoService(KEY))
  const sealedToken = crypto.cases.find((entry) => entry.plaintext === TOKEN).sealed

  const dataDir = join(temporary, "data")
  mkdirSync(dataDir)
  const database = await createDb(sqliteFileUrl(join(dataDir, "life-board.db")), migrationsFolder)
  await seed(database.db, schema, sealedToken)
  database.close()
  const leftovers = readdirSync(dataDir).filter((name) => name !== "life-board.db")
  if (leftovers.length) throw new Error(`Unexpected files next to the database: ${leftovers.join(", ")}`)

  mkdirSync(fixtures, { recursive: true })
  copyFileSync(join(dataDir, "life-board.db"), join(fixtures, `${profileName}.db`))

  routes.length = 0
  const server = await startServer({ dataDir, migrationsFolder, secretKey: KEY, logger: false })
  try {
    writeFileSync(
      join(fixtures, "node-routes.json"),
      // HEAD routes are implicit for GET, OPTIONS is the CORS preflight and `/*` the 404 handler.
      json(routes.filter((route) => route.path.startsWith("/api/") && route.method !== "HEAD" && route.method !== "OPTIONS")),
    )
    await recordGets(server.url)
  } finally {
    await server.app.close()
  }
  writeFileSync(join(fixtures, "crypto.json"), json(crypto))
  console.log(`Recorded ${profileName} fixtures in ${fixtures}`)
} finally {
  Router.prototype.on = on
  await vite.close()
  rmSync(temporary, { recursive: true, force: true })
}

/** Reuses the sealed values on disk while Node still opens them; seals the missing ones. */
function recordCrypto(service) {
  const path = join(fixtures, "crypto.json")
  const previous = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null
  const sameKey = previous?.key === KEY.toString("base64")
  const cases = PLAINTEXTS.map((plaintext) => {
    const kept = sameKey && previous.cases.find((entry) => entry.plaintext === plaintext)
    if (kept) {
      try {
        if (service.open(kept.sealed) === plaintext) return kept
      } catch {
        // Sealed with something else; seal it again below.
      }
    }
    return { plaintext, sealed: service.seal(plaintext) }
  })
  return { algorithm: "aes-256-gcm", key: KEY.toString("base64"), cases }
}

/** Fixed rows in every table, including soft-deleted ones and rows the startup purge drops. */
async function seed(db, s, token) {
  const T = at("2026-10-01T12:00:00.000Z")
  const stamps = (iso = "2026-10-01T12:00:00.000Z") => ({ createdAt: at(iso), updatedAt: at(iso) })

  await db.insert(s.tasks).values([
    {
      id: "t-trip", title: "Trip", description: "Pack <b>early</b>", status: "today", priority: "high",
      dueAt: at("2026-10-20T00:00:00.000Z"), tags: ["travel"], linkedThoughtIds: ["th_plan"], pinned: true,
      color: "blue", order: 0, focusDay: "2026-10-19", ...stamps(),
    },
    { id: "t-passport", title: "Passport", status: "done", completedAt: at("2026-10-02T08:00:00.000Z"), parentTaskId: "t-trip", order: 0, ...stamps() },
    { id: "t-tickets", title: "Tickets", parentTaskId: "t-trip", order: 1, ...stamps() },
    { id: "t-bills", title: "Pay bills", description: "Electricity 100%", priority: "medium", order: 1, ...stamps("2026-10-02T12:00:00.000Z") },
    { id: "t-call", title: "Call mom", status: "upcoming", priority: "low", dueAt: at("2026-10-25T15:30:00.000Z"), order: 2, ...stamps("2026-10-03T12:00:00.000Z") },
    { id: "t-old", title: "Old report", status: "done", completedAt: T, archivedAt: at("2026-10-03T00:00:00.000Z"), order: 3, ...stamps() },
    { id: "t-gone", title: "Deleted", deletedAt: at("2026-10-04T00:00:00.000Z"), ...stamps() },
  ])
  // Thought ids avoid `-`: the list cursor only accepts `\w` ids, like ULIDs.
  await db.insert(s.thoughts).values([
    { id: "th_plan", title: "Plan", body: "<p>Trip <b>plan</b></p>", tags: ["travel"], pinned: true, linkedTaskIds: ["t-trip"], ...stamps() },
    { id: "th_note", body: "Groceries list", tags: ["home"], linkedTaskIds: ["t-trip"], ...stamps("2026-10-05T09:00:00.000Z") },
    { id: "th_idea", title: "Idea", body: "A habit tracker", ...stamps("2026-10-06T09:00:00.000Z") },
    { id: "th_gone", body: "Deleted", deletedAt: at("2026-10-04T00:00:00.000Z"), ...stamps() },
  ])
  await db.insert(s.calendarEvents).values([
    {
      id: "ev-flight", title: "Flight", description: "Window seat", startAt: at("2026-10-20T08:00:00.000Z"),
      endAt: at("2026-10-20T10:00:00.000Z"), location: "GRU", color: "#22c55e", linkedTaskIds: ["t-trip"],
      linkedThoughtIds: ["th_plan"], ...stamps(),
    },
    { id: "ev-day", title: "Holiday", startAt: at("2026-10-12T00:00:00.000Z"), endAt: at("2026-10-12T23:59:00.000Z"), allDay: true, ...stamps() },
    { id: "ev-gone", title: "Deleted", startAt: T, endAt: T, deletedAt: at("2026-10-04T00:00:00.000Z"), ...stamps() },
  ])
  await db.insert(s.goals).values([
    {
      id: "g-books", title: "Read 12 books", why: "Learn more", domain: "learning", startAt: at("2026-09-01T00:00:00.000Z"),
      targetAt: at("2026-12-31T00:00:00.000Z"), progress: 40, progressMode: "manual", linkedTaskIds: ["t-bills"],
      linkedThoughtIds: ["th_plan"], linkedHabitIds: ["h-read"], ...stamps(),
    },
    { id: "g-run", title: "Run 10k", status: "paused", color: "#ef4444", linkedTaskIds: ["t-trip"], ...stamps("2026-10-02T12:00:00.000Z") },
    { id: "g-gone", title: "Deleted", deletedAt: at("2026-10-04T00:00:00.000Z"), ...stamps() },
  ])
  await db.insert(s.goalMilestones).values([
    { id: "m-first", goalId: "g-books", title: "First book", completedAt: at("2026-09-15T00:00:00.000Z"), order: 0, ...stamps() },
    { id: "m-half", goalId: "g-books", title: "Six books", dueAt: at("2026-11-01T00:00:00.000Z"), order: 1, ...stamps() },
    { id: "m-gone", goalId: "g-books", title: "Deleted", order: 2, deletedAt: at("2026-10-04T00:00:00.000Z"), ...stamps() },
  ])
  await db.insert(s.goalProgressSnapshots).values([
    { id: "s-1", goalId: "g-books", day: "2026-09-20", progress: 10, ...stamps() },
    { id: "s-2", goalId: "g-books", day: "2026-10-02", progress: 25, ...stamps() },
    { id: "s-3", goalId: "g-books", day: "2026-10-09", progress: 40, ...stamps() },
  ])
  await db.insert(s.habits).values([
    { id: "h-water", name: "Water", unit: "glasses", target: 8, emoji: "💧", ...stamps() },
    { id: "h-read", name: "Read", unit: "pages", target: 20, step: 5, emoji: "📚", ...stamps("2026-10-02T12:00:00.000Z") },
    { id: "h-gone", name: "Deleted", target: 1, deletedAt: at("2026-10-04T00:00:00.000Z"), ...stamps() },
  ])
  await db.insert(s.habitLogs).values([
    { id: "l-1", habitId: "h-water", day: "2026-10-15", count: 8, target: 8, ...stamps() },
    { id: "l-2", habitId: "h-water", day: "2026-10-16", count: 5, ...stamps() },
    { id: "l-3", habitId: "h-read", day: "2026-10-16", count: 20, target: 10, ...stamps() },
    { id: "l-4", habitId: "h-gone", day: "2026-10-16", count: 1, target: 1, ...stamps() },
  ])
  await db.insert(s.moodEntries).values([
    { id: "mood-1", day: "2026-10-15", score: 4, note: "Good day", linkedTaskIds: ["t-bills"], ...stamps() },
    { id: "mood-2", day: "2026-10-16", score: 2, ...stamps() },
  ])
  // No Done project on the board: listing the board archives stale ones with the current time.
  const changed = (iso) => ({ statusChangedAt: at(iso) })
  await db.insert(s.projects).values([
    { id: "p-idea", title: "Budget app", description: "Track spending", order: 0, ...changed("2026-10-01T12:00:00.000Z"), ...stamps() },
    { id: "p-blog", title: "Blog", order: 1, ...changed("2026-10-01T12:00:00.000Z"), ...stamps() },
    { id: "p-garden", title: "Garden", status: "in_progress", order: 0, ...changed("2026-10-02T12:00:00.000Z"), ...stamps() },
    { id: "p-paused", title: "Boat", status: "paused", pauseReason: "Waiting on parts", order: 0, ...changed("2026-10-03T12:00:00.000Z"), ...stamps() },
    { id: "p-archived", title: "Thesis", status: "done", order: 0, archivedAt: at("2026-10-05T00:00:00.000Z"), ...changed("2026-10-04T12:00:00.000Z"), ...stamps() },
    { id: "p-gone", title: "Deleted", order: 1, deletedAt: at("2026-10-04T00:00:00.000Z"), ...changed("2026-10-01T12:00:00.000Z"), ...stamps() },
  ])
  await db.insert(s.projectStatusChanges).values([
    { id: "c-idea", projectId: "p-idea", status: "idea", changedAt: at("2026-10-01T12:00:00.000Z") },
    { id: "c-blog", projectId: "p-blog", status: "idea", changedAt: at("2026-10-01T12:00:00.000Z") },
    { id: "c-garden-1", projectId: "p-garden", status: "idea", changedAt: at("2026-10-01T12:00:00.000Z") },
    { id: "c-garden-2", projectId: "p-garden", status: "in_progress", changedAt: at("2026-10-02T12:00:00.000Z") },
    { id: "c-paused-1", projectId: "p-paused", status: "planned", changedAt: at("2026-10-01T12:00:00.000Z") },
    { id: "c-paused-2", projectId: "p-paused", status: "paused", pauseReason: "Waiting on parts", changedAt: at("2026-10-03T12:00:00.000Z") },
    { id: "c-archived", projectId: "p-archived", status: "done", changedAt: at("2026-10-04T12:00:00.000Z") },
  ])
  await db.insert(s.fileBoards).values([
    { id: "b-receipts", name: "Receipts", description: "Paid bills", kind: "receipts", coverItemId: "fi-lunch", ...stamps("2026-10-03T12:00:00.000Z") },
    { id: "b-photos", name: "Photos", kind: "photos", color: "#f97316", ...stamps() },
    { id: "b-gone", name: "Deleted", deletedAt: at("2026-10-04T00:00:00.000Z"), ...stamps() },
  ])
  await db.insert(s.fileItems).values([
    {
      id: "fi-lunch", boardId: "b-receipts", kind: "receipt", title: "Lunch", notes: "Team lunch", mime: "image/png", sizeBytes: 3,
      storagePath: "01JFIXTURE0000000000000000-lunch.png", takenAt: at("2026-10-02T13:00:00.000Z"), amountCents: 1990,
      currency: "BRL", tags: ["food"], linkedTaskIds: ["t-bills"], ...stamps(),
    },
    { id: "fi-beach", boardId: "b-photos", mime: "image/jpeg", sizeBytes: 5, storagePath: "01JFIXTURE0000000000000001-beach.jpg", ...stamps("2026-10-02T12:00:00.000Z") },
    // Soft deleted by an earlier version: the startup purge removes both.
    { id: "fi-trashed", boardId: "b-receipts", mime: "text/plain", sizeBytes: 1, storagePath: "01JFIXTURE0000000000000002-a.txt", deletedAt: at("2026-10-04T00:00:00.000Z"), ...stamps() },
    { id: "fi-orphan", boardId: "b-gone", mime: "text/plain", sizeBytes: 1, storagePath: "01JFIXTURE0000000000000003-b.txt", ...stamps() },
  ])
  await db.insert(s.githubSettings).values({
    id: "default", tokenCiphertext: token.ciphertext, tokenIv: token.iv, tokenTag: token.tag, login: "octocat",
    lastSyncAt: at("2026-10-10T08:00:00.000Z"), ...stamps(),
  })
  await db.insert(s.githubPrs).values([
    {
      id: "octo/app#1", number: 1, title: "Fix login", state: "open", repoOwner: "octo", repoName: "app", authorLogin: "octocat",
      authorAvatarUrl: "https://avatars.example/octocat", url: "https://github.com/octo/app/pull/1", baseBranch: "main",
      headBranch: "fix-login", kind: "authored", additions: 10, deletions: 2, changedFiles: 3,
      createdAt: at("2026-10-01T00:00:00.000Z"), updatedAt: at("2026-10-09T00:00:00.000Z"), syncedAt: at("2026-10-10T08:00:00.000Z"),
    },
    {
      id: "octo/lib#2", number: 2, title: "Add cache", state: "merged", draft: true, repoOwner: "octo", repoName: "lib",
      authorLogin: "friend", url: "https://github.com/octo/lib/pull/2", kind: "review_requested", triggeredByLogin: "friend",
      createdAt: at("2026-10-02T00:00:00.000Z"), updatedAt: at("2026-10-08T00:00:00.000Z"), syncedAt: at("2026-10-10T08:00:00.000Z"),
    },
  ])
  await db.insert(s.githubIssues).values([
    {
      id: "octo/app#7", number: 7, title: "Broken", state: "open", repoOwner: "octo", repoName: "app", authorLogin: "octocat",
      url: "https://github.com/octo/app/issues/7", kind: "authored", labels: ["bug", "ui"], comments: 2,
      createdAt: at("2026-10-01T00:00:00.000Z"), updatedAt: at("2026-10-03T00:00:00.000Z"), syncedAt: at("2026-10-10T08:00:00.000Z"),
    },
    {
      id: "octo/site#3", number: 3, title: "Typo", state: "open", repoOwner: "octo", repoName: "site", authorLogin: "",
      url: "https://github.com/octo/site/issues/3", kind: "in_my_repos",
      createdAt: at("2026-10-01T00:00:00.000Z"), updatedAt: at("2026-10-02T00:00:00.000Z"), syncedAt: at("2026-10-10T08:00:00.000Z"),
    },
  ])
  await db.insert(s.appSettings).values({ id: "default", uploadsBaseDir: null, ...stamps() })
}

async function recordGets(baseUrl) {
  const folder = join(fixtures, profileName)
  rmSync(folder, { recursive: true, force: true })
  mkdirSync(folder)
  const manifest = []
  for (const [module, name, path] of GETS) {
    const response = await fetch(`${baseUrl}${path}`)
    const body = await response.json()
    writeFileSync(join(folder, `${name}.json`), json({ path, status: response.status, body }))
    manifest.push({ module, name, path })
  }
  writeFileSync(join(folder, "manifest.json"), json(manifest))
}

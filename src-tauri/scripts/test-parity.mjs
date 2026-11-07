#!/usr/bin/env node
// Checks that every Node API test case has its Rust port (npm run test:parity).
//
// 1. Reads the `it(...)` and `it.each(...)(...)` titles of api/src/**/*.test.ts.
// 2. Lists the Rust suite with `cargo test -p life-board-api --test suite -- --list --include-ignored`.
// 3. Fails when a TS case has no Rust test at the mirrored path
//    (services/tasks.service.test.ts > "lists tasks" -> services::tasks::lists_tasks),
//    when a Rust test has no TS case and no allowlist entry, when an allowlist
//    entry is stale or unexplained, or when a ported test is ignored for the
//    wrong issue.

import { execFileSync } from "node:child_process"
import { readFileSync, readdirSync } from "node:fs"
import { join, relative, resolve, sep } from "node:path"
import ts from "typescript"

const root = resolve(import.meta.dirname, "../..")
const apiSrc = join(root, "api/src")
const crate = join(root, "src-tauri/crates/api")
const suite = join(crate, "tests/suite")
const allowlist = JSON.parse(readFileSync(join(crate, "tests/parity-allowlist.json"), "utf8"))

// The issue that turns on each ported module (`#[ignore = "pending #N"]`).
const ISSUES = {
  51: ["db::client", "db::*_migration", "plugins::*", "server", "services::crypto", "services::date", "controllers::health",
    "*::tasks", "*::thoughts", "*::links", "*::mood", "*::calendar", "*::habits"],
  52: ["*::goals", "db::goals_migration", "db::projects_migration", "*::projects", "*::stats", "*::settings",
    "services::files_settings", "*::file_boards", "services::file_storage"],
  53: ["services::github_client", "*::github"],
}

const failures = []
const fail = (message) => failures.push(message)

/** `*` matches any run of characters; everything else is literal. */
const matches = (pattern, text) =>
  new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`).test(text)

/** The most specific pattern wins, so `db::goals_migration` beats `db::*_migration`. */
function expectedIssue(module) {
  let best = null
  for (const [issue, patterns] of Object.entries(ISSUES)) {
    for (const pattern of patterns) {
      if (matches(pattern, module) && (!best || pattern.replaceAll("*", "").length > best.length)) {
        best = { issue: Number(issue), length: pattern.replaceAll("*", "").length }
      }
    }
  }
  return best?.issue ?? null
}

/** The it title in snake_case, without printf placeholders such as `%s` or `%j`. */
export function snakeCase(title) {
  return title
    .replace(/%[sdifjoOc#%]/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

/** `services/tasks.service.test.ts` -> `services::tasks`. */
export function rustModule(file) {
  return relative(apiSrc, file)
    .split(sep)
    .join("/")
    .replace(/\.test\.ts$/, "")
    .replace(/\.(service|controller)$/, "")
    .replace(/-/g, "_")
    .split("/")
    .join("::")
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  })
}

/** `it("title", ...)` and `it.each(cases)("title", ...)`. */
function itTitles(file) {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true)
  const titles = []
  const isIt = (node) =>
    (ts.isIdentifier(node) && node.text === "it") ||
    (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) && node.expression.expression.text === "it" && node.expression.name.text === "each")
  const visit = (node) => {
    if (ts.isCallExpression(node) && isIt(node.expression)) {
      const [title] = node.arguments
      if (title && (ts.isStringLiteral(title) || ts.isNoSubstitutionTemplateLiteral(title))) titles.push(title.text)
      else fail(`${relative(root, file)}: an it() title is not a string literal`)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return titles
}

const tsCases = new Map()
for (const file of walk(apiSrc).filter((path) => path.endsWith(".test.ts")).sort()) {
  const module = rustModule(file)
  for (const title of itTitles(file)) {
    const name = `${module}::${snakeCase(title)}`
    if (tsCases.has(name)) fail(`Two TS cases map to ${name}: "${tsCases.get(name).title}" and "${title}"`)
    tsCases.set(name, { file: relative(root, file), title })
  }
}

const listing = execFileSync("cargo", ["test", "-p", "life-board-api", "--test", "suite", "--", "--list", "--include-ignored"], {
  cwd: root,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
})
// rstest turns each case into `<test>::case_<n>_<description>`.
const rustTests = new Set(
  listing
    .split("\n")
    .filter((line) => line.endsWith(": test"))
    .map((line) => line.slice(0, -": test".length).replace(/::case_\d+\w*$/, "")),
)

const rustOnly = allowlist.rustOnly ?? []
const inSpirit = allowlist.translatedInSpirit ?? []
for (const entry of [...rustOnly, ...inSpirit]) {
  if (!entry.reason?.trim()) fail(`Allowlist entry ${entry.test} has no reason`)
  if (![...rustTests].some((test) => matches(entry.test, test))) fail(`Allowlist entry ${entry.test} matches no Rust test`)
}
for (const entry of inSpirit) {
  if (![...tsCases.keys()].some((name) => matches(entry.test, name))) fail(`translatedInSpirit entry ${entry.test} matches no TS case`)
}

const missing = [...tsCases].filter(([name]) => !rustTests.has(name))
for (const [name, { file, title }] of missing) fail(`Missing Rust test ${name} for ${file} > "${title}"`)

const extra = [...rustTests].filter((test) => !tsCases.has(test) && !rustOnly.some((entry) => matches(entry.test, test)))
for (const test of extra) fail(`Rust test ${test} has no TS case and no allowlist entry`)

// Ported tests that are still ignored must name the issue that implements their module.
for (const file of walk(suite).filter((path) => path.endsWith(".rs"))) {
  const module = relative(suite, file).split(sep).join("::").replace(/(::mod)?\.rs$/, "")
  if (module === "main" || module.startsWith("common")) continue
  const ported = [...tsCases.keys()].some((name) => name.startsWith(`${module}::`))
  const expected = expectedIssue(module)
  for (const [, issue] of readFileSync(file, "utf8").matchAll(/#\[ignore = "pending #(\d+)"\]/g)) {
    if (ported && Number(issue) !== expected) fail(`${relative(root, file)}: ignored for #${issue}, but ${module} belongs to #${expected}`)
  }
  for (const [reason] of readFileSync(file, "utf8").matchAll(/#\[ignore(?! = "pending #\d+"\])[^\]]*\]/g)) {
    fail(`${relative(root, file)}: ${reason} should be #[ignore = "pending #N"]`)
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `✗ ${failure}`).join("\n"))
  console.error(`\nParity failed: ${failures.length} problem(s).`)
  process.exit(1)
}
const allowed = [...rustTests].filter((test) => !tsCases.has(test)).length
console.log(`Parity ok: ${tsCases.size} TS cases ported, ${allowed} Rust-only tests allowlisted, ${inSpirit.length} translated in spirit.`)

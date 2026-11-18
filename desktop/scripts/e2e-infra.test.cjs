const { test } = require("node:test")
const assert = require("node:assert/strict")
const { spawn } = require("node:child_process")
const { mkdtempSync, existsSync, readFileSync, rmSync } = require("node:fs")
const { join } = require("node:path")
const { tmpdir } = require("node:os")
const { pathToFileURL } = require("node:url")
const { setTimeout: delay } = require("node:timers/promises")

test("display selection keeps normal Linux tests off the host monitor", async () => {
  const { displayMode } = await import("./test-display.mjs")
  assert.equal(displayMode([], {}, "linux"), "xvfb")
  assert.equal(displayMode([], { DISPLAY: ":0", WAYLAND_DISPLAY: "wayland-0" }, "linux"), "xvfb")
  assert.equal(displayMode(["--debug"], {}, "linux"), "host")
  assert.equal(displayMode(["--ui"], {}, "linux"), "host")
  assert.equal(displayMode([], { LIFE_BOARD_TEST_DISPLAY: "host" }, "linux"), "host")
  assert.throws(() => displayMode([], { LIFE_BOARD_TEST_DISPLAY: "invalid" }, "linux"))
})

test("command runner preserves argv and a child's failure exit code", async () => {
  const { runCommand } = await import("./test-display.mjs")
  assert.equal(await runCommand(process.execPath, ["-e", "process.exit(process.argv[1] === 'path with spaces' ? 7 : 8)", "path with spaces"]), 7)
})

test("SIGTERM stops the owned child group and preserves interruption status", async () => {
  const dir = mkdtempSync(join(tmpdir(), "life-board-runner-"))
  const marker = join(dir, "pid")
  const moduleUrl = pathToFileURL(join(__dirname, "test-display.mjs")).href
  const childCode = `require('node:fs').writeFileSync(${JSON.stringify(marker)},String(process.pid));setInterval(()=>{},1000)`
  const supervisor = spawn(process.execPath, ["--input-type=module", "-e", `import { runCommand } from ${JSON.stringify(moduleUrl)};process.exitCode=await runCommand(process.execPath,['-e',${JSON.stringify(childCode)}])`], { stdio: "pipe" })
  try {
    const deadline = Date.now() + 5000
    while (!existsSync(marker) && Date.now() < deadline) await delay(20)
    assert.ok(existsSync(marker), "child started")
    const pid = Number(readFileSync(marker, "utf8"))
    const exited = new Promise(resolve => supervisor.once("exit", resolve))
    supervisor.kill("SIGTERM")
    assert.equal(await exited, 143)
    assert.throws(() => process.kill(pid, 0), { code: "ESRCH" })
  } finally { supervisor.kill("SIGKILL"); rmSync(dir, { recursive: true, force: true }) }
})

test("the Google fake answers the calendar calls the API client makes", async () => {
  const fake = join(__dirname, "../../e2e/support/google-server.cjs")
  const { ACCESS_TOKEN, EMAIL, CONFLICT_EVENT_ID } = require(fake)
  const server = spawn(process.execPath, ["-e", `require(${JSON.stringify(fake)})(() => {}).then(url => console.log(url))`], { stdio: ["ignore", "pipe", "inherit"] })
  try {
    const base = await new Promise((resolve, reject) => { server.stdout.once("data", data => resolve(`${String(data).trim()}/calendar/v3`)); server.once("exit", reject) })
    const call = async (method, path, { body, etag, token = ACCESS_TOKEN } = {}) => {
      const headers = { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}), ...(etag ? { "if-match": etag } : {}) }
      const response = await fetch(`${base}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) })
      return { status: response.status, body: response.status === 204 ? null : await response.json() }
    }
    const events = `/calendars/${encodeURIComponent(EMAIL)}/events`
    const list = `${events}?singleEvents=true&showDeleted=true&timeMin=2026-10-01T00%3A00%3A00.000Z&timeMax=2026-11-01T00%3A00%3A00.000Z&maxResults=250`

    const primary = await call("GET", "/calendars/primary")
    assert.deepEqual([primary.status, primary.body.id, primary.body.timeZone], [200, EMAIL, "America/Sao_Paulo"])
    assert.equal((await call("GET", "/calendars/primary", { token: "wrong" })).status, 401)
    const first = await call("GET", list)
    assert.deepEqual([first.body.items.length, first.body.nextPageToken], [1, "page-2"])
    const second = await call("GET", `${list}&pageToken=page-2`)
    assert.deepEqual(second.body.items.map(event => event.id), ["synthetic-all-day", CONFLICT_EVENT_ID])
    assert.equal(second.body.nextPageToken, undefined)
    assert.equal((await call("GET", events)).status, 400)

    const body = { summary: "Gym", start: { date: null, dateTime: "2026-10-12T09:00:00-03:00" }, end: { date: null, dateTime: "2026-10-12T10:00:00-03:00" }, colorId: "2" }
    const inserted = await call("POST", events, { body })
    assert.deepEqual([inserted.status, inserted.body.summary, inserted.body.etag], [200, "Gym", `"${inserted.body.id}-1"`])
    const path = `${events}/${encodeURIComponent(inserted.body.id)}`
    const patched = await call("PATCH", path, { body: { summary: "Run" }, etag: inserted.body.etag })
    assert.deepEqual([patched.status, patched.body.summary, patched.body.etag], [200, "Run", `"${inserted.body.id}-2"`])
    assert.equal((await call("PATCH", path, { body: { summary: "Stale" }, etag: inserted.body.etag })).status, 412)
    assert.equal((await call("PATCH", `${events}/${CONFLICT_EVENT_ID}`, { body: {}, etag: `"${CONFLICT_EVENT_ID}-1"` })).status, 412)
    assert.equal((await call("DELETE", path)).status, 204)
    assert.equal((await call("DELETE", path)).status, 410)
    assert.equal((await call("PATCH", path, { body: {}, etag: patched.body.etag })).status, 404)
    const deleted = (await call("GET", `${list}&pageToken=page-2`)).body.items.at(-1)
    assert.deepEqual(deleted, { id: inserted.body.id, status: "cancelled" })
    assert.equal((await call("GET", "/calendars/other%40gmail.com/events")).status, 404)
    const invalid = await fetch(`${base}${events}`, { method: "POST", headers: { authorization: `Bearer ${ACCESS_TOKEN}` }, body: "{not json" })
    assert.equal(invalid.status, 400)
  } finally { server.kill("SIGKILL") }
})

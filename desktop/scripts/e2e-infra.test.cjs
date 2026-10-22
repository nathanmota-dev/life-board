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

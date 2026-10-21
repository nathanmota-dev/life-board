import { spawn, execFile } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { promisify } from "node:util"
import { ensureTestDisplay, runCommand, stopProcess } from "./test-display.mjs"

const execute = promisify(execFile)
const args = process.argv.slice(2)
const require = createRequire(import.meta.url)

async function run() {
  if (process.platform !== "linux") throw new Error("The E2E suite currently supports Linux only.")
  // Start the display first: D-Bus activated desktop services must also inherit
  // the virtual DISPLAY and its Xauthority, never the user's desktop session.
  await ensureTestDisplay(args)
  // A private bus and keyring prevent tests from using the desktop user's secrets.
  if (!process.env.LIFE_BOARD_E2E_SESSION) {
    const session = mkdtempSync(join(tmpdir(), "life-board-e2e-session-"))
    const env = { ...process.env, LIFE_BOARD_E2E_SESSION: session, XDG_CURRENT_DESKTOP: "GNOME", GIO_USE_VFS: "local", GTK_USE_PORTAL: "0", NO_AT_BRIDGE: "1" }
    for (const kind of ["CONFIG", "DATA", "CACHE"]) {
      env[`XDG_${kind}_HOME`] = join(session, kind.toLowerCase())
      mkdirSync(env[`XDG_${kind}_HOME`], { recursive: true })
    }
    env.XDG_RUNTIME_DIR = join(session, "runtime")
    mkdirSync(env.XDG_RUNTIME_DIR, { mode: 0o700 })
    delete env.GNOME_KEYRING_CONTROL
    delete env.GNOME_KEYRING_PID
    try {
      return await runCommand("dbus-run-session", ["--", process.execPath, ...process.execArgv, ...process.argv.slice(1)], env)
    } finally {
      // Desktop portals can mount FUSE directories inside XDG_RUNTIME_DIR.
      // They disconnect when our private bus exits; unmount only these owned
      // paths before removing the temporary session.
      for (const name of ["doc", "gvfs"]) {
        const path = join(session, "runtime", name)
        try { await execute("fusermount3", ["-uz", path]) }
        catch (error) {
          if (error.code === "ENOENT") await execute("fusermount", ["-uz", path]).catch(() => {})
        }
      }
      rmSync(session, { recursive: true, force: true })
    }
  }
  const keyring = spawn("gnome-keyring-daemon", ["--foreground", "--unlock", "--components=secrets", "--control-directory", join(process.env.LIFE_BOARD_E2E_SESSION, "keyring")], {
    stdio: ["pipe", "pipe", "pipe"], detached: true,
  })
  let diagnostic = ""
  keyring.stdout.on("data", value => { diagnostic += value })
  keyring.stderr.on("data", value => { diagnostic += value })
  const started = new Promise((resolve, reject) => { keyring.once("spawn", resolve); keyring.once("error", reject) })
  try {
    await started
    keyring.stdin.end("life-board-synthetic-keyring\n")
    const deadline = Date.now() + 15_000
    while (true) {
      try {
        const { stdout } = await execute("gdbus", ["call", "--session", "--dest", "org.freedesktop.DBus", "--object-path", "/org/freedesktop/DBus", "--method", "org.freedesktop.DBus.NameHasOwner", "org.freedesktop.secrets"], { timeout: 1000 })
        if (!stdout.includes("true")) throw new Error("Waiting for test keyring")
        break
      } catch {
        if (Date.now() > deadline || keyring.exitCode !== null) throw new Error(`Test keyring could not start: ${diagnostic}`)
        await delay(100)
      }
    }
    return await runCommand(process.execPath, [require.resolve("@playwright/test/cli"), "test", ...args])
  } finally { await stopProcess(keyring) }
}

try { process.exitCode = await run() }
catch (error) { console.error(error.message); process.exitCode = 1 }

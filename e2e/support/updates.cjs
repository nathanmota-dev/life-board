const { EventEmitter } = require("node:events")
const { readFileSync, writeFileSync } = require("node:fs")
const { join } = require("node:path")
const { createHash } = require("node:crypto")
const { setTimeout: delay } = require("node:timers/promises")

module.exports = function installUpdates() {
  const scenario = () => JSON.parse(readFileSync(process.env.LIFE_BOARD_E2E_SCENARIO, "utf8"))
  const content = Buffer.from("synthetic update artifact; never executable")
  const installed = require(join(process.env.LIFE_BOARD_E2E_ROOT, "package.json")).version
  const next = require("semver").inc(installed, "patch")
  const sha512 = createHash("sha512").update(content).digest("base64")
  class SyntheticUpdater extends EventEmitter {
    async checkForUpdates() {
      if (scenario().updates === "network") throw new Error("ERR_CONNECTION_RESET")
      return { updateInfo: { version: scenario().updates === "current" ? installed : next, releaseDate: "2026-10-21T12:00:00Z", releaseNotes: "Synthetic release notes", files: [{ url: `life-board-${next}-x86_64.AppImage`, sha512 }] } }
    }
    async downloadUpdate() {
      this.emit("download-progress", { percent: 25 })
      while (scenario().updates === "hold-download") await delay(50)
      if (scenario().updates === "download-error") throw new Error("ERR_CONNECTION_RESET")
      const path = join(process.env.LIFE_BOARD_E2E_HOME, "download.AppImage")
      writeFileSync(path, scenario().updates === "integrity" ? "corrupted artifact" : content)
      this.emit("download-progress", { percent: 100 })
      return [path]
    }
  }
  const modulePath = require.resolve("electron-updater")
  const original = require(modulePath)
  require.cache[modulePath].exports = { ...original, AppImageUpdater: SyntheticUpdater, DebUpdater: SyntheticUpdater }
}

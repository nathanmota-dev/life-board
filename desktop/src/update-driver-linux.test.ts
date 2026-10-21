import { createHash } from "node:crypto"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createUpdateDriver } from "./update-driver"

const mocks = await vi.hoisted(async () => {
  const { EventEmitter } = await import("node:events")
  const state = { info: {} as unknown, paths: [] as string[], execFile: vi.fn() }
  class Updater extends EventEmitter {
    async getUpdateInfoAndProvider() { return { info: state.info } }
    async checkForUpdates() { return { updateInfo: (await this.getUpdateInfoAndProvider()).info } }
    async downloadUpdate() { return state.paths }
  }
  return { ...state, state, Updater }
})
vi.mock("electron-updater", () => ({ DebUpdater: mocks.Updater, AppImageUpdater: mocks.Updater, NsisUpdater: mocks.Updater, MacUpdater: mocks.Updater }))
vi.mock("node:child_process", async (original) => ({ ...await original<typeof import("node:child_process")>(), execFile: mocks.execFile }))
vi.mock("electron", () => ({}))

let directory: string
const lifecycle = { prepare: vi.fn(), cancel: vi.fn(), restart: vi.fn() }
const drivers: ReturnType<typeof createUpdateDriver>[] = []
function create(format: "deb" | "AppImage") {
  const artifact = join(directory, `download.${format}`)
  writeFileSync(artifact, "new app")
  const sha512 = createHash("sha512").update("new app").digest("base64")
  mocks.state.paths = [artifact]
  mocks.state.info = { version: "1.1.0", path: "unused", sha512, releaseDate: "2026-10-21",
    files: [{ url: `life-board-1.1.0-x64.${format}`, sha512 }] }
  const driver = createUpdateDriver(format, "1.0.0", lifecycle)
  drivers.push(driver)
  return { driver, artifact }
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal("process", { ...process, platform: "linux", arch: "x64" })
  directory = mkdtempSync(join(tmpdir(), "life-board-linux-update-"))
  mocks.execFile.mockImplementation((_command, _args, _options, callback) => callback(null, "", ""))
})
afterEach(() => {
  for (const driver of drivers.splice(0)) driver.dispose()
  chmodSync(directory, 0o700)
  rmSync(directory, { force: true, recursive: true })
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("Linux updater regressions", () => {
  it("installs only the verified DEB with the fixed PolicyKit/APT command", async () => {
    const { driver, artifact } = create("deb")
    await driver.check()
    await driver.download("1.1.0", vi.fn())
    expect(mocks.execFile).not.toHaveBeenCalled()
    await driver.install()
    expect(mocks.execFile).toHaveBeenCalledWith("/usr/bin/pkexec",
      ["--disable-internal-agent", "/usr/bin/apt-get", "install", "--yes", "--no-remove", artifact],
      expect.objectContaining({ env: expect.objectContaining({ PATH: "/usr/sbin:/usr/bin:/sbin:/bin" }) }), expect.any(Function))
    expect(lifecycle.prepare).toHaveBeenCalledOnce()
    expect(lifecycle.restart).toHaveBeenCalledExactlyOnceWith()
  })

  it.each([126, 127])("keeps the app open after PolicyKit denial %s, then permits retry", async (code) => {
    mocks.execFile.mockImplementationOnce((_command, _args, _options, callback) => callback(Object.assign(new Error("denied"), { code })))
    const { driver } = create("deb")
    await driver.check()
    await driver.download("1.1.0", vi.fn())
    await expect(driver.install()).rejects.toMatchObject({ kind: "permission" })
    expect(mocks.execFile).toHaveBeenCalledOnce()
    expect(lifecycle.restart).not.toHaveBeenCalled()
    await driver.install()
    expect(lifecycle.restart).toHaveBeenCalledOnce()
  })

  it("does not elevate after the downloaded DEB is corrupted", async () => {
    const { driver, artifact } = create("deb")
    await driver.check()
    await driver.download("1.1.0", vi.fn())
    writeFileSync(artifact, "corrupted")
    await expect(driver.install()).rejects.toMatchObject({ kind: "integrity" })
    expect(mocks.execFile).not.toHaveBeenCalled()
    expect(lifecycle.restart).not.toHaveBeenCalled()
  })

  it("preserves an unwritable AppImage and permits download/replacement after permissions are restored", async () => {
    const installed = join(directory, "life-board.AppImage")
    writeFileSync(installed, "old app", { mode: 0o555 })
    vi.stubEnv("APPIMAGE", installed)
    const { driver } = create("AppImage")
    await driver.check()
    await expect(driver.download("1.1.0", vi.fn())).rejects.toThrow()
    expect(readFileSync(installed, "utf8")).toBe("old app")
    expect(lifecycle.restart).not.toHaveBeenCalled()
    chmodSync(installed, 0o755)
    await driver.download("1.1.0", vi.fn())
    await driver.install()
    expect(readFileSync(installed, "utf8")).toBe("new app")
    expect(lifecycle.restart).toHaveBeenCalledExactlyOnceWith(installed)
    expect(mocks.execFile).not.toHaveBeenCalled()
  })

  it("never creates a Linux driver on Windows", () => {
    vi.stubGlobal("process", { ...process, platform: "win32" })
    expect(() => createUpdateDriver("deb", "1.0.0", lifecycle)).toThrow("metadata")
  })
})

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getStartOnLogin, isHiddenStartup, setStartOnLogin } from "./login-item"

const native = vi.hoisted(() => ({
  isPackaged: true,
  getPath: vi.fn(),
  getAppPath: vi.fn(() => "/opt/Life Board"),
  getLoginItemSettings: vi.fn(),
  setLoginItemSettings: vi.fn(),
}))
vi.mock("electron", () => ({ app: native }))

let directory: string
let entry: string

beforeEach(() => {
  vi.clearAllMocks()
  native.isPackaged = true
  directory = mkdtempSync(join(tmpdir(), "life-board-login-"))
  entry = join(directory, "autostart/dev.nathanmota.lifeboard.desktop")
  native.getPath.mockReturnValue(directory)
  vi.stubEnv("XDG_CONFIG_HOME", directory)
  vi.stubEnv("APPIMAGE", "")
  vi.stubGlobal("process", { ...process, platform: "linux", argv: [process.execPath], execPath: "/opt/Life Board/life-board" })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  rmSync(directory, { recursive: true, force: true })
})

describe("Linux login item", () => {
  it("registers a hidden launch and reflects external deletion", () => {
    expect(getStartOnLogin()).toBe(false)
    setStartOnLogin(true)
    expect(getStartOnLogin()).toBe(true)
    expect(readFileSync(entry, "utf8")).toContain('Exec="/opt/Life Board/life-board" "--hidden"')
    rmSync(entry)
    expect(getStartOnLogin()).toBe(false)
    setStartOnLogin(false)
  })

  it("unregisters the login item without deleting other applications", () => {
    setStartOnLogin(true)
    const other = join(directory, "autostart/other.desktop")
    writeFileSync(other, "other")
    setStartOnLogin(false)
    expect(getStartOnLogin()).toBe(false)
    expect(readFileSync(other, "utf8")).toBe("other")
  })

  it.each(["Hidden=true", "X-GNOME-Autostart-enabled=false"])("reflects an OS-disabled entry (%s)", (flag) => {
    setStartOnLogin(true)
    const original = readFileSync(entry, "utf8").replace("X-GNOME-Autostart-enabled=true\n", "")
    writeFileSync(entry, `${original}${flag}\n`)
    expect(getStartOnLogin()).toBe(false)
  })

  it("prefers the persistent AppImage path and preserves the required sandbox argument", () => {
    vi.stubEnv("APPIMAGE", "/home/user/Apps/Life Board.AppImage")
    process.argv.push("--no-sandbox")
    setStartOnLogin(true)
    expect(readFileSync(entry, "utf8")).toContain('Exec="/home/user/Apps/Life Board.AppImage" "--no-sandbox" "--hidden"')
  })

  it("includes the application path for development launches", () => {
    native.isPackaged = false
    setStartOnLogin(true)
    expect(readFileSync(entry, "utf8")).toContain('Exec="/opt/Life Board/life-board" "/opt/Life Board" "--hidden"')
  })

  it("falls back to ~/.config for a missing or relative XDG_CONFIG_HOME", () => {
    vi.stubEnv("XDG_CONFIG_HOME", "relative")
    setStartOnLogin(true)
    expect(readFileSync(join(directory, ".config/autostart/dev.nathanmota.lifeboard.desktop"), "utf8")).toContain("[Desktop Entry]")
    expect(getStartOnLogin()).toBe(true)
  })

  it("escapes reserved characters in an AppImage path", () => {
    vi.stubEnv("APPIMAGE", '/apps/Life "Board" $`\\ 100%.AppImage')
    setStartOnLogin(true)
    const contents = readFileSync(entry, "utf8")
    expect(contents).toContain('Exec="/usr/bin/env" ')
    expect(contents).toContain('\\\\"Board\\\\"')
    expect(contents).toContain("100%%.AppImage")
    expect(contents).toContain("\\\\\\\\")
  })

  it("does not treat a malformed entry as registered", () => {
    setStartOnLogin(true)
    writeFileSync(entry, "[Other Section]\nType=Application\nExec=other\n")
    expect(getStartOnLogin()).toBe(false)
  })
})

describe("native login items", () => {
  it("sets and queries matching Windows arguments and respects OS disablement", () => {
    vi.stubGlobal("process", { ...process, platform: "win32" })
    native.getLoginItemSettings.mockReturnValue({ openAtLogin: true, executableWillLaunchAtLogin: true })
    setStartOnLogin(true)
    expect(native.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true, path: process.execPath, args: ["--hidden"], enabled: true })
    expect(getStartOnLogin()).toBe(true)
    expect(native.getLoginItemSettings).toHaveBeenCalledWith({ path: process.execPath, args: ["--hidden"] })
    native.getLoginItemSettings.mockReturnValue({ openAtLogin: true, executableWillLaunchAtLogin: false })
    expect(getStartOnLogin()).toBe(false)
    setStartOnLogin(false)
    expect(native.setLoginItemSettings).toHaveBeenLastCalledWith({ openAtLogin: false, path: process.execPath, args: ["--hidden"], enabled: false })
  })

  it("uses modern macOS login items and reports pending approval as off", () => {
    vi.stubGlobal("process", { ...process, platform: "darwin" })
    native.getLoginItemSettings.mockReturnValue({ openAtLogin: true, status: "enabled", wasOpenedAtLogin: true })
    setStartOnLogin(true)
    expect(native.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true })
    expect(getStartOnLogin()).toBe(true)
    expect(isHiddenStartup()).toBe(true)
    native.getLoginItemSettings.mockReturnValue({ openAtLogin: true, status: "requires-approval" })
    expect(getStartOnLogin()).toBe(false)
    setStartOnLogin(false)
    expect(native.setLoginItemSettings).toHaveBeenLastCalledWith({ openAtLogin: false })
  })

  it("opens normally unless launched with --hidden", () => {
    expect(isHiddenStartup()).toBe(false)
    process.argv.push("--hidden")
    expect(isHiddenStartup()).toBe(true)
  })
})

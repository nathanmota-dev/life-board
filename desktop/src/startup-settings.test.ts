import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getStartupSettings, keepInBackground, registerStartupSettings, updateStartupSettings } from "./startup-settings"

const mocks = vi.hoisted(() => ({ handle: vi.fn(), getStartOnLogin: vi.fn(), setStartOnLogin: vi.fn() }))
vi.mock("electron", () => ({ ipcMain: { handle: mocks.handle } }))
vi.mock("./login-item", () => ({ getStartOnLogin: mocks.getStartOnLogin, setStartOnLogin: mocks.setStartOnLogin }))

let directory: string
let enabled: boolean
beforeEach(() => {
  vi.clearAllMocks()
  directory = mkdtempSync(join(tmpdir(), "life-board-startup-"))
  enabled = false
  mocks.getStartOnLogin.mockImplementation(() => enabled)
  mocks.setStartOnLogin.mockImplementation((value: boolean) => { enabled = value })
  registerStartupSettings(directory)
})
afterEach(() => { rmSync(directory, { recursive: true, force: true }) })

describe("startup settings", () => {
  it("defaults both options to off and exposes them through IPC", () => {
    expect(getStartupSettings()).toEqual({ startOnLogin: false, keepInBackground: false })
    expect(mocks.handle.mock.calls.map(([channel]) => channel)).toEqual(["app:get-startup-settings", "app:update-startup-settings"])
    const update = mocks.handle.mock.calls[1][1]
    expect(update({}, { keepInBackground: true }).keepInBackground).toBe(true)
  })

  it("persists both options and reloads the background preference", () => {
    expect(updateStartupSettings({ startOnLogin: true, keepInBackground: true })).toEqual({ startOnLogin: true, keepInBackground: true })
    expect(JSON.parse(readFileSync(join(directory, "startup-settings.json"), "utf8"))).toEqual({ startOnLogin: true, keepInBackground: true })
    registerStartupSettings(directory)
    expect(keepInBackground()).toBe(true)
    updateStartupSettings({ keepInBackground: false })
    expect(keepInBackground()).toBe(false)
    expect(mocks.setStartOnLogin).toHaveBeenCalledTimes(1)
  })

  it("respects external login-item removal on reads and restart", () => {
    updateStartupSettings({ startOnLogin: true })
    enabled = false
    expect(getStartupSettings().startOnLogin).toBe(false)
    registerStartupSettings(directory)
    expect(getStartupSettings().startOnLogin).toBe(false)
    updateStartupSettings({ keepInBackground: true })
    expect(mocks.setStartOnLogin).toHaveBeenCalledTimes(1)
  })

  it("ignores malformed stored settings and untrusted IPC fields", () => {
    writeFileSync(join(directory, "startup-settings.json"), "null")
    registerStartupSettings(directory)
    expect(updateStartupSettings({ startOnLogin: "true", keepInBackground: 1, extra: true })).toEqual({ startOnLogin: false, keepInBackground: false })
    expect(updateStartupSettings(null)).toEqual({ startOnLogin: false, keepInBackground: false })
    writeFileSync(join(directory, "startup-settings.json"), "{broken")
    registerStartupSettings(directory)
    expect(keepInBackground()).toBe(false)
  })

  it("rejects failed OS changes without persisting them", () => {
    mocks.setStartOnLogin.mockImplementation(() => { throw new Error("denied") })
    expect(() => updateStartupSettings({ startOnLogin: true, keepInBackground: true })).toThrow("denied")
    expect(keepInBackground()).toBe(false)
    expect(getStartupSettings().startOnLogin).toBe(false)
  })

  it("rejects persistence errors without changing the background preference", () => {
    rmSync(directory, { recursive: true })
    expect(() => updateStartupSettings({ keepInBackground: true })).toThrow()
    expect(keepInBackground()).toBe(false)
  })
})

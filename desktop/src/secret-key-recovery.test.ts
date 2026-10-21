import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  showErrorBox: vi.fn(), showMessageBoxSync: vi.fn(), loadSecretKey: vi.fn(), resetSecretKey: vi.fn(),
}))

vi.mock("electron", () => ({
  dialog: { showErrorBox: mocks.showErrorBox, showMessageBoxSync: mocks.showMessageBoxSync },
}))
vi.mock("./locale", () => ({ t: (key: string) => key }))
vi.mock("./secret-key", () => ({
  loadSecretKey: mocks.loadSecretKey,
  resetSecretKey: mocks.resetSecretKey,
  UnreadableSecretKeyError: class UnreadableSecretKeyError extends Error {},
}))

const { openSecretKey } = await import("./secret-key-recovery")
const { UnreadableSecretKeyError } = await import("./secret-key")

const events: string[] = []
beforeEach(() => {
  vi.clearAllMocks()
  events.length = 0
  vi.spyOn(console, "error").mockImplementation(() => events.push("log"))
  vi.spyOn(console, "warn").mockImplementation(() => {})
  mocks.showErrorBox.mockImplementation(() => events.push("dialog"))
  mocks.showMessageBoxSync.mockImplementation(() => {
    events.push("dialog")
    return 1
  })
})

describe("openSecretKey", () => {
  it("returns the stored key without any dialog", () => {
    const secretKey = { key: Buffer.alloc(32), resetSecrets: false }
    mocks.loadSecretKey.mockReturnValue(secretKey)
    expect(openSecretKey("/data")).toBe(secretKey)
    expect(mocks.showMessageBoxSync).not.toHaveBeenCalled()
    expect(mocks.showErrorBox).not.toHaveBeenCalled()
  })

  it("logs a missing keyring before the error box and quits", () => {
    mocks.loadSecretKey.mockImplementation(() => { throw new Error("Keychain unavailable") })
    expect(openSecretKey("/data")).toBeNull()
    expect(mocks.showErrorBox).toHaveBeenCalledWith("Life Board", "Keychain unavailable")
    expect(events).toEqual(["log", "dialog"])
    expect(mocks.resetSecretKey).not.toHaveBeenCalled()
  })

  it("logs an unreadable key and quits when the user keeps it", () => {
    mocks.loadSecretKey.mockImplementation(() => { throw new UnreadableSecretKeyError("unreadable") })
    expect(openSecretKey("/data")).toBeNull()
    expect(events).toEqual(["log", "dialog"])
    expect(mocks.showMessageBoxSync).toHaveBeenCalledWith(expect.objectContaining({
      message: "secretKey.unreadable",
      detail: "secretKey.unreadableDetail",
      buttons: ["secretKey.reset", "secretKey.quit"],
      defaultId: 1,
      cancelId: 1,
    }))
    expect(mocks.resetSecretKey).not.toHaveBeenCalled()
  })

  it("resets the key and asks the backend to drop old secrets when the user chooses to", () => {
    const key = Buffer.alloc(32, 7)
    mocks.loadSecretKey.mockImplementation(() => { throw new UnreadableSecretKeyError("unreadable") })
    mocks.showMessageBoxSync.mockReturnValue(0)
    mocks.resetSecretKey.mockReturnValue(key)
    expect(openSecretKey("/data")).toEqual({ key, resetSecrets: true })
    expect(mocks.resetSecretKey).toHaveBeenCalledWith("/data")
  })
})

import { describe, expect, it, vi } from "vitest"

vi.mock("electron", () => ({ app: { isPackaged: true } }))
const { secureWebPreferences } = await import("./renderer")

describe("secureWebPreferences", () => {
  it("keeps the renderer isolated and sandboxed", () => {
    expect(secureWebPreferences).toMatchObject({ contextIsolation: true, nodeIntegration: false, sandbox: true })
  })

  it("enables the built-in PDF viewer for File Board previews", () => {
    expect(secureWebPreferences.plugins).toBe(true)
  })
})

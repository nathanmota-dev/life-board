import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { applyChromiumSwitches } from "./chromium-switches"

const commandLine = vi.hoisted(() => ({ getSwitchValue: vi.fn(), appendSwitch: vi.fn() }))
vi.mock("electron", () => ({ app: { commandLine } }))

beforeEach(() => {
  vi.clearAllMocks()
  commandLine.getSwitchValue.mockReturnValue("")
  vi.stubGlobal("process", { ...process, platform: "linux" })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("applyChromiumSwitches", () => {
  it("runs the network service inside the browser process on Linux", () => {
    applyChromiumSwitches()
    expect(commandLine.appendSwitch).toHaveBeenCalledExactlyOnceWith("enable-features", "NetworkServiceInProcess2")
  })

  it("keeps features already enabled on the command line", () => {
    commandLine.getSwitchValue.mockReturnValue("WaylandWindowDecorations,NetworkServiceInProcess2")
    applyChromiumSwitches()
    expect(commandLine.getSwitchValue).toHaveBeenCalledWith("enable-features")
    expect(commandLine.appendSwitch).toHaveBeenCalledExactlyOnceWith(
      "enable-features", "WaylandWindowDecorations,NetworkServiceInProcess2",
    )
  })

  it.each(["win32", "darwin"])("leaves %s unchanged", (platform) => {
    vi.stubGlobal("process", { ...process, platform })
    applyChromiumSwitches()
    expect(commandLine.appendSwitch).not.toHaveBeenCalled()
  })
})

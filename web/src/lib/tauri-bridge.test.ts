import { afterEach, describe, expect, it, vi } from "vitest"
import { createDesktopBridge, ENABLED_GROUPS, installTauriBridge } from "@/lib/tauri-bridge"
import type { DesktopBridge, DesktopBridgeGroup, TauriEvent, TauriGlobal, Unsubscribe } from "@/types/desktop"

type Handler = (event: TauriEvent<unknown>) => void

/** A fake `window.__TAURI__` whose `listen` resolves only when the test says so. */
function fakeTauri() {
  const handlers = new Map<string, Handler[]>()
  const pending: (() => void)[] = []
  const unlisten = vi.fn<Unsubscribe>()
  const invoke = vi.fn(async (_command: string, _args?: Record<string, unknown>): Promise<unknown> => "result")
  const listen = vi.fn((event: string, handler: Handler) =>
    new Promise<Unsubscribe>((resolve) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler])
      pending.push(() => resolve(unlisten))
    }))
  const tauri = { core: { invoke }, event: { listen } } as unknown as TauriGlobal
  return {
    tauri,
    invoke,
    listen,
    unlisten,
    emit: (event: string, payload: unknown) => handlers.get(event)?.forEach((handler) => handler({ event, id: 1, payload })),
    /** Resolves every pending `listen` and lets its `.then` run. */
    resolveListen: async () => {
      pending.splice(0).forEach((resolve) => resolve())
      await Promise.resolve()
      await Promise.resolve()
    },
  }
}

const ALL_GROUPS: DesktopBridgeGroup[] = ["core", "app", "notifications", "pomodoro", "capture"]

function fullBridge() {
  const fake = fakeTauri()
  return { ...fake, bridge: createDesktopBridge(fake.tauri, ALL_GROUPS) as Required<DesktopBridge> }
}

describe("createDesktopBridge", () => {
  it("calls the listed command with the listed argument names", async () => {
    const { bridge, invoke } = fullBridge()
    const calls: [() => unknown, string, Record<string, unknown>?][] = [
      [() => bridge.getVersion(), "get_version"],
      [() => bridge.getApiBaseUrl(), "get_api_base_url"],
      [() => bridge.openExternal("https://github.com/x"), "open_external", { url: "https://github.com/x" }],
      [() => bridge.setLanguage("pt"), "set_language", { language: "pt" }],
      [() => bridge.app.getStartupSettings(), "get_startup_settings"],
      [() => bridge.app.updateStartupSettings({ startOnLogin: true }), "update_startup_settings", { patch: { startOnLogin: true } }],
      [() => bridge.app.pickDirectory?.(), "pick_directory"],
      [() => bridge.notifications.show({ title: "Hi" }), "show_notification", { notification: { title: "Hi" } }],
      [() => bridge.pomodoro.getState(), "pomodoro_get_state"],
      [() => bridge.pomodoro.dispatch({ type: "start" }), "pomodoro_dispatch", { command: { type: "start" } }],
      [() => bridge.pomodoro.updateSettings({ sound: false }), "pomodoro_update_settings", { patch: { sound: false } }],
      [() => bridge.capture.getShortcut(), "capture_get_shortcut"],
      [() => bridge.capture.close(), "capture_close"],
      [() => bridge.capture.notifySaved(), "capture_notify_saved"],
    ]

    for (const [call, command, args] of calls) {
      invoke.mockClear()
      call()
      expect(invoke).toHaveBeenCalledTimes(1)
      expect(invoke).toHaveBeenCalledWith(command, args)
    }
  })

  it("resolves with what the command returns", async () => {
    const { bridge, invoke } = fullBridge()
    invoke.mockResolvedValueOnce("http://127.0.0.1:4321")

    await expect(bridge.getApiBaseUrl()).resolves.toBe("http://127.0.0.1:4321")
  })

  it("rejects when a command fails, except the fire-and-forget ones", async () => {
    const { bridge, invoke } = fullBridge()
    invoke.mockRejectedValue("only https://github.com/ links can be opened")

    await expect(bridge.openExternal("file:///etc/passwd")).rejects.toBe("only https://github.com/ links can be opened")
    expect(bridge.setLanguage("es")).toBeUndefined()
    expect(bridge.capture.close()).toBeUndefined()
    expect(bridge.capture.notifySaved()).toBeUndefined()
    // Let the swallowed rejections settle; an unhandled one fails the run.
    await Promise.resolve()
  })

  it("subscribes each event to the listed Tauri event", () => {
    const { bridge, listen } = fullBridge()
    bridge.onNavigate(() => {})
    bridge.pomodoro.onState(() => {})
    bridge.pomodoro.onCompleted(() => {})
    bridge.capture.onSaved(() => {})

    expect(listen.mock.calls.map(([event]) => event)).toEqual(["app:navigate", "pomodoro:state", "pomodoro:completed", "capture:saved"])
  })

  it("leaves out every disabled group", () => {
    const bridge = createDesktopBridge(fakeTauri().tauri, ["core"])

    for (const group of ["app", "notifications", "pomodoro", "capture", "updates"]) {
      expect(group in bridge, group).toBe(false)
    }
    expect(Object.keys(bridge).sort()).toEqual(["getApiBaseUrl", "getVersion", "onNavigate", "openExternal", "setLanguage"])
  })

  it("enables only the listed groups", () => {
    const bridge = createDesktopBridge(fakeTauri().tauri, ["core", "pomodoro"])

    expect("pomodoro" in bridge).toBe(true)
    expect("app" in bridge).toBe(false)
    expect("capture" in bridge).toBe(false)
  })

  it("starts with the core group only and never adds updates", () => {
    expect(ENABLED_GROUPS).toEqual(["core"])
    expect("updates" in createDesktopBridge(fakeTauri().tauri, ALL_GROUPS)).toBe(false)
  })
})

describe("event subscriptions", () => {
  it("deliver the payload, not the event", async () => {
    const { bridge, emit, resolveListen } = fullBridge()
    const navigate = vi.fn()
    const completed = vi.fn()
    bridge.onNavigate(navigate)
    bridge.pomodoro.onCompleted(completed)
    await resolveListen()

    emit("app:navigate", "/pomodoro")
    emit("pomodoro:completed", { phase: "focus", next: "shortBreak", sound: true })

    expect(navigate).toHaveBeenCalledWith("/pomodoro")
    expect(completed).toHaveBeenCalledWith({ phase: "focus", next: "shortBreak", sound: true })
  })

  it("call unlisten when unsubscribed after listen resolves", async () => {
    const { bridge, emit, unlisten, resolveListen } = fullBridge()
    const callback = vi.fn()
    const unsubscribe = bridge.onNavigate(callback)
    await resolveListen()

    unsubscribe()
    emit("app:navigate", "/tasks")

    expect(unlisten).toHaveBeenCalledTimes(1)
    expect(callback).not.toHaveBeenCalled()
  })

  it("call unlisten once listen resolves when unsubscribed before it", async () => {
    const { bridge, emit, unlisten, resolveListen } = fullBridge()
    const callback = vi.fn()
    const unsubscribe = bridge.pomodoro.onState(callback)

    unsubscribe()
    expect(unlisten).not.toHaveBeenCalled()
    emit("pomodoro:state", { status: "running" })
    await resolveListen()
    emit("pomodoro:state", { status: "paused" })

    expect(unlisten).toHaveBeenCalledTimes(1)
    expect(callback).not.toHaveBeenCalled()
  })

  it("ignore a second unsubscribe", async () => {
    const { bridge, unlisten, resolveListen } = fullBridge()
    const early = bridge.capture.onSaved(() => {})
    early()
    early()
    await resolveListen()
    const late = bridge.onNavigate(() => {})
    await resolveListen()
    late()
    late()

    expect(unlisten).toHaveBeenCalledTimes(2)
  })

  it("log a listen that fails", async () => {
    const { tauri, listen } = fakeTauri()
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    listen.mockRejectedValueOnce(new Error("not allowed"))

    const unsubscribe = createDesktopBridge(tauri).onNavigate!(() => {})
    await Promise.resolve()
    await Promise.resolve()

    expect(error).toHaveBeenCalledWith("listening to app:navigate failed", expect.any(Error))
    expect(unsubscribe).not.toThrow()
    error.mockRestore()
  })
})

describe("installTauriBridge", () => {
  // Read through a function: TypeScript keeps `window.desktop` narrowed to `undefined` across the call.
  const installed = () => {
    if (!window.desktop) throw new Error("window.desktop is not defined")
    return window.desktop
  }
  const original = { desktop: window.desktop, tauri: window.__TAURI__ }
  afterEach(() => {
    window.desktop = original.desktop
    window.__TAURI__ = original.tauri
  })

  it("does nothing without __TAURI__", () => {
    window.desktop = undefined
    window.__TAURI__ = undefined

    installTauriBridge()

    expect(window.desktop).toBeUndefined()
  })

  it("doesn't replace an existing window.desktop (Electron)", () => {
    const preload = { getVersion: vi.fn() } as unknown as DesktopBridge
    const { tauri, invoke } = fakeTauri()
    window.desktop = preload
    window.__TAURI__ = tauri

    installTauriBridge()

    expect(window.desktop).toBe(preload)
    expect(invoke).not.toHaveBeenCalled()
  })

  it("defines a frozen core bridge in Tauri", async () => {
    const { tauri, invoke } = fakeTauri()
    window.desktop = undefined
    window.__TAURI__ = tauri
    invoke.mockResolvedValueOnce("1.2.1")

    installTauriBridge()
    const desktop = installed()

    expect(Object.isFrozen(desktop)).toBe(true)
    expect("pomodoro" in desktop).toBe(false)
    await expect(desktop.getVersion()).resolves.toBe("1.2.1")
    expect(invoke).toHaveBeenCalledWith("get_version", undefined)
  })
})

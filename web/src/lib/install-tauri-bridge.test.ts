import { afterEach, expect, it, vi } from "vitest"
import type { TauriGlobal } from "@/types/desktop"

afterEach(() => {
  window.desktop = undefined
  window.__TAURI__ = undefined
  vi.resetModules()
})

it("installs the bridge as soon as it is imported", async () => {
  const invoke = vi.fn(async () => "http://127.0.0.1:4321")
  window.__TAURI__ = { core: { invoke }, event: { listen: vi.fn() } } as unknown as TauriGlobal

  expect(window.desktop).toBeUndefined()

  await import("@/lib/install-tauri-bridge")

  await expect(window.desktop?.getApiBaseUrl()).resolves.toBe("http://127.0.0.1:4321")
  expect(invoke).toHaveBeenCalledWith("get_api_base_url", undefined)
})

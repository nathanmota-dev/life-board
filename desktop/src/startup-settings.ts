import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { ipcMain } from "electron"
import type { StartupSettings } from "../../web/src/types/settings"
import { getStartOnLogin, setStartOnLogin } from "./login-item"

const STATE_FILE = "startup-settings.json"
const DEFAULT_SETTINGS: StartupSettings = { startOnLogin: false, keepInBackground: false }

let dataDir = ""
let settings = { ...DEFAULT_SETTINGS }

function sanitizeSettings(input: unknown, base = DEFAULT_SETTINGS): StartupSettings {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  return {
    startOnLogin: typeof source.startOnLogin === "boolean" ? source.startOnLogin : base.startOnLogin,
    keepInBackground: typeof source.keepInBackground === "boolean" ? source.keepInBackground : base.keepInBackground,
  }
}

export function keepInBackground() {
  return settings.keepInBackground
}

export function getStartupSettings(): StartupSettings {
  // Never re-register a saved preference: the user may have disabled it in the OS.
  return { ...settings, startOnLogin: getStartOnLogin() }
}

export function updateStartupSettings(patch: unknown): StartupSettings {
  const next = sanitizeSettings(patch, getStartupSettings())
  if (next.startOnLogin !== getStartOnLogin()) setStartOnLogin(next.startOnLogin)
  next.startOnLogin = getStartOnLogin()
  writeFileSync(join(dataDir, STATE_FILE), JSON.stringify(next))
  settings = next
  return getStartupSettings()
}

export function registerStartupSettings(directory: string) {
  dataDir = directory
  try {
    settings = sanitizeSettings(JSON.parse(readFileSync(join(dataDir, STATE_FILE), "utf8")))
  } catch {
    settings = { ...DEFAULT_SETTINGS }
  }
  ipcMain.handle("app:get-startup-settings", getStartupSettings)
  ipcMain.handle("app:update-startup-settings", (_event, patch: unknown) => updateStartupSettings(patch))
}

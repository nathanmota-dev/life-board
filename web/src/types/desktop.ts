import type { AppNotification } from "@/types/notification"
import type { PomodoroCommand, PomodoroCompletion, PomodoroSettings, PomodoroState } from "@/types/pomodoro"
import type { StartupSettingsBridge } from "@/types/settings"
import type { UpdatesBridge } from "@/types/updates"

export type Unsubscribe = () => void

export type CaptureBridge = {
  getShortcut: () => Promise<string | null>
  close: () => void
  notifySaved: () => void
  onSaved: (callback: () => void) => Unsubscribe
}

export type NotificationsBridge = {
  show: (notification: AppNotification) => Promise<boolean>
}

export type PomodoroBridge = {
  getState: () => Promise<PomodoroState>
  dispatch: (command: PomodoroCommand) => Promise<PomodoroState>
  updateSettings: (patch: Partial<PomodoroSettings>) => Promise<PomodoroState>
  onState: (callback: (state: PomodoroState) => void) => Unsubscribe
  onCompleted: (callback: (completion: PomodoroCompletion) => void) => Unsubscribe
}

/** `window.desktop`: built by the Electron preload or, in Tauri, by `lib/tauri-bridge.ts`. */
export type DesktopBridge = {
  getVersion: () => Promise<string>
  getApiBaseUrl: () => Promise<string>
  openExternal: (url: string) => Promise<void>
  setLanguage?: (language: string) => void
  onNavigate?: (callback: (route: string) => void) => Unsubscribe
  updates?: UpdatesBridge
  app?: StartupSettingsBridge
  capture?: CaptureBridge
  notifications?: NotificationsBridge
  pomodoro?: PomodoroBridge
}

/** The Tauri bridge groups; `core` is the top-level methods and `onNavigate`. */
export type DesktopBridgeGroup = "core" | "app" | "notifications" | "pomodoro" | "capture"

export type TauriEvent<T> = { event: string; id: number; payload: T }

/** The two functions of `window.__TAURI__` (`withGlobalTauri`) the bridge uses. */
export type TauriGlobal = {
  core: { invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T> }
  event: { listen: <T>(event: string, handler: (event: TauriEvent<T>) => void) => Promise<Unsubscribe> }
}

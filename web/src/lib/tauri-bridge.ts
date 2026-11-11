import type { DesktopBridge, DesktopBridgeGroup, TauriGlobal, Unsubscribe } from "@/types/desktop"
import type { AppNotification } from "@/types/notification"
import type { PomodoroCommand, PomodoroCompletion, PomodoroSettings, PomodoroState } from "@/types/pomodoro"
import type { StartupSettings } from "@/types/settings"

// Builds `window.desktop` over Tauri's `invoke` and `listen`, with the same shape
// as the Electron preload, so the `desktop-*` wrappers don't know which shell runs.

/**
 * Groups whose Rust commands exist. #67 adds app, notifications and pomodoro; #68 adds capture.
 * `core` (the top-level methods) is always built: the API URL comes from it.
 */
export const ENABLED_GROUPS: readonly DesktopBridgeGroup[] = ["core"]

const ignore = () => {}

/**
 * Subscribes to a Tauri event and returns the unsubscribe function right away,
 * while `listen` resolves later. Unsubscribing first still calls its `unlisten`.
 */
function subscriber(tauri: TauriGlobal) {
  return function subscribe<T>(event: string, callback: (payload: T) => void): Unsubscribe {
    let active = true
    let unlisten: Unsubscribe | undefined
    tauri.event
      .listen<T>(event, ({ payload }) => {
        if (active) callback(payload)
      })
      .then((stop) => {
        if (active) unlisten = stop
        else stop()
      })
      .catch((error: unknown) => console.error(`listening to ${event} failed`, error))
    return () => {
      if (!active) return
      active = false
      unlisten?.()
    }
  }
}

/** A missing group stays absent, so its wrapper reports "not available" instead of calling a missing command. */
export function createDesktopBridge(tauri: TauriGlobal, groups: readonly DesktopBridgeGroup[] = ENABLED_GROUPS): DesktopBridge {
  const invoke = <T = void>(command: string, args?: Record<string, unknown>) => tauri.core.invoke<T>(command, args)
  // Electron's `send`: fire and forget.
  const send = (command: string, args?: Record<string, unknown>) => void invoke(command, args).catch(ignore)
  const subscribe = subscriber(tauri)
  const enabled = new Set(groups)

  return {
    getVersion: () => invoke<string>("get_version"),
    getApiBaseUrl: () => invoke<string>("get_api_base_url"),
    openExternal: (url) => invoke("open_external", { url }),
    setLanguage: (language) => send("set_language", { language }),
    onNavigate: (callback) => subscribe("app:navigate", callback),
    ...(enabled.has("app") && {
      app: {
        getStartupSettings: () => invoke<StartupSettings>("get_startup_settings"),
        updateStartupSettings: (patch: Partial<StartupSettings>) => invoke<StartupSettings>("update_startup_settings", { patch }),
        pickDirectory: () => invoke<string | null>("pick_directory"),
      },
    }),
    ...(enabled.has("notifications") && {
      notifications: {
        show: (notification: AppNotification) => invoke<boolean>("show_notification", { notification }),
      },
    }),
    ...(enabled.has("pomodoro") && {
      pomodoro: {
        getState: () => invoke<PomodoroState>("pomodoro_get_state"),
        dispatch: (command: PomodoroCommand) => invoke<PomodoroState>("pomodoro_dispatch", { command }),
        updateSettings: (patch: Partial<PomodoroSettings>) => invoke<PomodoroState>("pomodoro_update_settings", { patch }),
        onState: (callback: (state: PomodoroState) => void) => subscribe("pomodoro:state", callback),
        onCompleted: (callback: (completion: PomodoroCompletion) => void) => subscribe("pomodoro:completed", callback),
      },
    }),
    ...(enabled.has("capture") && {
      capture: {
        getShortcut: () => invoke<string | null>("capture_get_shortcut"),
        close: () => send("capture_close"),
        notifySaved: () => send("capture_notify_saved"),
        onSaved: (callback: () => void) => subscribe("capture:saved", callback),
      },
    }),
  }
}

/** Defines `window.desktop` in Tauri. Under Electron the preload already did, and a plain browser has neither. */
export function installTauriBridge() {
  if (!window.__TAURI__ || window.desktop) return
  window.desktop = Object.freeze(createDesktopBridge(window.__TAURI__))
}

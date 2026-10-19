// Main-process hooks that aren't tied to one feature; no-ops outside Electron.

/** Keeps the tray menu and native notifications in the language picked in Settings. */
export function syncDesktopLanguage(language: string) {
  window.desktop?.setLanguage?.(language.startsWith("pt") ? "pt" : "en")
}

/** Routes requested by the main process, e.g. from the tray menu or a notification click. */
export function onDesktopNavigate(callback: (route: string) => void) {
  return window.desktop?.onNavigate?.(callback) ?? (() => {})
}

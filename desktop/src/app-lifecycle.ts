import { app } from "electron"
import type { BrowserWindow } from "electron"
import { isPomodoroActive } from "./pomodoro"
import { keepInBackground } from "./startup-settings"

let quitting = false
let updating = false
const closingToTray = new WeakSet<BrowserWindow>()

export function prepareUpdateQuit() { updating = true }
export function cancelUpdateQuit() { updating = false; quitting = false }

function shouldKeepRunning() {
  return keepInBackground() || isPomodoroActive()
}

export function registerAppLifecycle() {
  app.on("before-quit", () => { quitting = true })
  app.on("window-all-closed", () => {
    if (!updating && !shouldKeepRunning()) app.quit()
  })
}

export function trackMainWindowClose(window: BrowserWindow) {
  window.on("close", (event) => {
    if (quitting || updating) return
    if (isPomodoroActive()) {
      // Only a live renderer can play the completion chime.
      event.preventDefault()
      window.hide()
      return
    }
    if (keepInBackground()) {
      closingToTray.add(window) // Destroyed on purpose: frees the renderer; the tray keeps the app alive.
      return
    }
    event.preventDefault()
    app.quit()
  })
}

/** True once `window` is being destroyed for the tray; a load it aborts is not a failure. */
export function isClosingToTray(window: BrowserWindow) {
  return closingToTray.has(window)
}

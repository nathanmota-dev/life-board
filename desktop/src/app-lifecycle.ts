import { app } from "electron"
import type { BrowserWindow } from "electron"
import { isPomodoroActive } from "./pomodoro"
import { keepInBackground } from "./startup-settings"

let quitting = false

function shouldKeepRunning() {
  return keepInBackground() || isPomodoroActive()
}

export function registerAppLifecycle() {
  app.on("before-quit", () => { quitting = true })
  app.on("window-all-closed", () => {
    if (!shouldKeepRunning()) app.quit()
  })
}

export function trackMainWindowClose(window: BrowserWindow) {
  window.on("close", (event) => {
    if (quitting) return
    event.preventDefault()
    if (shouldKeepRunning()) window.hide()
    else app.quit()
  })
}

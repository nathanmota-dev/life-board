import { join } from "node:path"
import { app } from "electron"
import type { BrowserWindow, WebPreferences } from "electron"

export const secureWebPreferences: WebPreferences = {
  preload: join(__dirname, "../preload/index.js"),
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
}

/** Loads the React app into `window`, optionally at a hash route such as "/capture". */
export function loadRenderer(window: BrowserWindow, route?: string) {
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  window.webContents.on("will-navigate", (event) => event.preventDefault())

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  return !app.isPackaged && rendererUrl
    ? window.loadURL(route ? `${rendererUrl}#${route}` : rendererUrl)
    : window.loadFile(join(__dirname, "../renderer/index.html"), route ? { hash: route } : undefined)
}

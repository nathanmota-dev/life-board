import { existsSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { app, BrowserWindow, ipcMain } from "electron"
import { AppUpdates } from "./app-updates"
import { t } from "./locale"
import { showNotification } from "./notifications"
import { cancelPomodoroUpdate, preservePomodoroForUpdate } from "./pomodoro"
import { prepareUpdateQuit, cancelUpdateQuit } from "./app-lifecycle"
import { createUpdateDriver } from "./update-driver"
import { UpdateFailure, updateStore } from "./update-state"
import type { UpdateState } from "../../web/src/types/updates"

export function installedFormat(): UpdateState["format"] {
  if (!app.isPackaged || !["x64", "arm64"].includes(process.arch)) return null
  if (process.platform === "win32") {
    if (process.arch !== "x64" || process.windowsStore || process.env.PORTABLE_EXECUTABLE_DIR) return null
    // An unpacked directory/portable executable isn't an installed NSIS app.
    return existsSync(join(process.resourcesPath, "app-update.yml"))
      && existsSync(join(dirname(process.execPath), "Uninstall Life Board.exe")) ? "nsis" : null
  }
  if (process.platform === "darwin") {
    return !process.mas && /\.app[/\\]Contents[/\\]Resources$/.test(process.resourcesPath)
      && existsSync(join(process.resourcesPath, "app-update.yml")) ? "mac" : null
  }
  if (process.platform !== "linux" || process.env.SNAP || process.env.FLATPAK_ID) return null
  if (process.env.APPIMAGE) return "AppImage"
  try { return readFileSync(join(process.resourcesPath, "package-type"), "utf8").trim() === "deb" ? "deb" : null }
  catch { return null }
}

export function registerUpdates() {
  const format = installedFormat()
  const driver = format ? createUpdateDriver(format, app.getVersion(), {
    prepare() {
      try { preservePomodoroForUpdate() } catch { throw new UpdateFailure("storage") }
      // Squirrel closes windows before before-quit; permit that native sequence.
      prepareUpdateQuit()
    },
    cancel() { cancelUpdateQuit(); cancelPomodoroUpdate() },
    restart(executable) {
      app.relaunch({ ...(executable ? { execPath: executable } : {}), args: process.argv.slice(1).filter((arg) => arg !== "--hidden") })
      app.quit()
    },
  }) : null
  const updates = new AppUpdates({
    installedVersion: app.getVersion(), format, driver, store: updateStore(app.getPath("userData")),
    broadcast: (state) => {
      for (const window of BrowserWindow.getAllWindows()) if (!window.isDestroyed()) window.webContents.send("updates:state", state)
    },
    notify: (version) => {
      showNotification({ title: t("notify.updateTitle"), body: t("notify.updateBody", { version }), route: "/settings?tab=updates" })
    },
  })
  const handlers = {
    "updates:get-state": updates.getState,
    "updates:check": updates.check,
    "updates:download": updates.download,
    "updates:install": updates.install,
  }
  for (const [channel, action] of Object.entries(handlers)) {
    ipcMain.handle(channel, (event) => {
      const sender = BrowserWindow.fromWebContents(event.sender)
      if (!sender || event.senderFrame !== event.sender.mainFrame) throw new Error("Untrusted update request")
      return action()
    })
  }
  app.once("will-quit", () => {
    updates.dispose()
    for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel)
  })
  return updates
}

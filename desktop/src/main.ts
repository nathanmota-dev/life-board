import { app, BrowserWindow, ipcMain, shell } from "electron"
import icon from "../resources/icon.png?asset"
import { isClosingToTray, registerAppLifecycle, trackMainWindowClose } from "./app-lifecycle"
import { startBackend } from "./backend"
import type { Backend } from "./backend"
import { applyChromiumSwitches } from "./chromium-switches"
import { registerCaptureShortcut, unregisterCaptureShortcut } from "./capture-window"
import { registerDirectoryPicker } from "./directory-picker"
import { registerGpuRelease } from "./gpu-release"
import { registerLocale } from "./locale"
import { isHiddenStartup } from "./login-item"
import { registerNotifications } from "./notifications"
import { registerUpdates } from "./register-updates"
import { registerPomodoro } from "./pomodoro"
import { loadRenderer, secureWebPreferences } from "./renderer"
import { confirmSecretsReset } from "./secret-key"
import type { SecretKey } from "./secret-key"
import { openSecretKey } from "./secret-key-recovery"
import { registerStartupSettings } from "./startup-settings"
import { createTray } from "./tray"
import { defaultBounds, loadWindowState, trackWindowState } from "./window-state"

applyChromiumSwitches()

let backend: Backend | null = null
let apiBaseUrl: Promise<string> | null = null
let mainWindow: BrowserWindow | null = null

function createWindow(route?: string) {
  const dataDir = app.getPath("userData")
  const state = loadWindowState(dataDir)
  const window = new BrowserWindow({
    title: "Life Board",
    icon,
    ...(state.bounds ?? defaultBounds()),
    minWidth: 640,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    webPreferences: secureWebPreferences,
  })
  mainWindow = window
  trackMainWindowClose(window)
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null
  })

  window.once("ready-to-show", () => {
    if (state.fullScreen) window.setFullScreen(true)
    else if (state.maximized) window.maximize()
    window.show()
    trackWindowState(window, dataDir)
  })
  void loadRenderer(window, route).catch((error: unknown) => {
    // The load rejects before the window reports being destroyed.
    if (isClosingToTray(window)) return
    console.error("Não foi possível carregar a interface:", error)
    app.quit()
  })
}

/** Brings the main window to the front (reopening it if it was closed), optionally at `route`. */
function showMainWindow(route?: string) {
  if (!mainWindow || mainWindow.isDestroyed()) return createWindow(route)
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
  if (route) mainWindow.webContents.send("app:navigate", route)
}

function launchBackend({ key, resetSecrets }: SecretKey) {
  backend = startBackend({
    isPackaged: app.isPackaged, appPath: app.getAppPath(), resourcesPath: process.resourcesPath, platform: process.platform,
    dataDir: app.getPath("userData"), key, resetSecrets,
  })
  return backend.url
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  let initialized = false
  let openRequested = false

  app.on("second-instance", (_event, argv) => {
    if (argv.includes("--hidden")) return
    if (initialized) showMainWindow()
    else openRequested = true
  })

  void app.whenReady().then(() => {
    if (process.platform === "darwin") app.dock?.setIcon(icon)
    if (process.platform === "win32") app.setAppUserModelId("dev.nathanmota.lifeboard")

    ipcMain.handle("app:get-version", () => app.getVersion())

    ipcMain.handle("api:get-base-url", () => apiBaseUrl)
    // Only GitHub links leave the app (PRs, profiles); everything else is refused.
    ipcMain.handle("app:open-external", (_event, url: string) => {
      if (typeof url === "string" && url.startsWith("https://github.com/")) return shell.openExternal(url)
    })
    const secretKey = openSecretKey(app.getPath("userData"))
    if (!secretKey) {
      app.quit()
      return
    }
    apiBaseUrl = launchBackend(secretKey)
    apiBaseUrl.then(
      () => { if (secretKey.resetSecrets) confirmSecretsReset(app.getPath("userData")) },
      (error: unknown) => console.error(error),
    )

    registerLocale()
    registerNotifications(icon, showMainWindow)
    registerPomodoro(app.getPath("userData"))
    registerStartupSettings(app.getPath("userData"))
    registerDirectoryPicker()
    registerAppLifecycle()
    registerGpuRelease()
    registerUpdates()
    registerCaptureShortcut(icon)
    createTray(icon, showMainWindow)
    if (!isHiddenStartup() || openRequested) showMainWindow()
    initialized = true

    app.on("activate", () => {
      showMainWindow()
    })
  })

  app.on("before-quit", () => {
    backend?.stop()
    backend = null
  })

  app.on("will-quit", unregisterCaptureShortcut)
}

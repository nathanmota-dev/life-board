import { join } from "node:path"
import { app, BrowserWindow, ipcMain, shell, utilityProcess } from "electron"
import type { UtilityProcess } from "electron"
import backendPath from "./backend-process?modulePath"
import icon from "../resources/icon.png?asset"
import { registerAppLifecycle, trackMainWindowClose } from "./app-lifecycle"
import { registerCaptureShortcut, unregisterCaptureShortcut } from "./capture-window"
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

let backend: UtilityProcess | null = null
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

function startBackend({ key, resetSecrets }: SecretKey) {
  const migrationsDir = app.isPackaged
    ? join(process.resourcesPath, "migrations")
    : join(app.getAppPath(), "api/drizzle")

  backend = utilityProcess.fork(backendPath, [], {
    serviceName: "Life Board Backend",
    env: {
      ...process.env,
      LIFE_BOARD_DATA_DIR: app.getPath("userData"),
      LIFE_BOARD_MIGRATIONS_DIR: migrationsDir,
    },
  })
  // Sent over the message port rather than env, which other processes can read.
  backend.postMessage({ type: "secret-key", key: key.toString("base64"), resetSecrets })

  return new Promise<string>((resolve, reject) => {
    backend?.on("message", (message: { type?: string; url?: string }) => {
      if (message?.type === "ready" && message.url) resolve(message.url)
    })
    backend?.on("exit", (code) => {
      backend = null
      if (code !== 0) console.error(`O backend encerrou com código ${code}.`)
      reject(new Error("O backend encerrou antes de ficar pronto."))
    })
  })
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
    apiBaseUrl = startBackend(secretKey)
    apiBaseUrl.then(
      () => { if (secretKey.resetSecrets) confirmSecretsReset(app.getPath("userData")) },
      (error: unknown) => console.error(error),
    )

    registerLocale()
    registerNotifications(icon, showMainWindow)
    registerPomodoro(app.getPath("userData"))
    registerStartupSettings(app.getPath("userData"))
    registerAppLifecycle()
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
    backend?.kill()
    backend = null
  })

  app.on("will-quit", unregisterCaptureShortcut)
}

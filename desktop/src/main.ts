import { join } from "node:path"
import { app, BrowserWindow, dialog, ipcMain, shell, utilityProcess } from "electron"
import type { UtilityProcess } from "electron"
import backendPath from "./backend-process?modulePath"
import { loadSecretKey } from "./secret-key"
import { defaultBounds, loadWindowState, trackWindowState } from "./window-state"

let backend: UtilityProcess | null = null
let apiBaseUrl: Promise<string> | null = null

function createWindow() {
  const dataDir = app.getPath("userData")
  const state = loadWindowState(dataDir)
  const window = new BrowserWindow({
    title: "Life Board",
    ...(state.bounds ?? defaultBounds()),
    minWidth: 640,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.once("ready-to-show", () => {
    if (state.fullScreen) window.setFullScreen(true)
    else if (state.maximized) window.maximize()
    window.show()
    trackWindowState(window, dataDir)
  })
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }))
  window.webContents.on("will-navigate", (event) => event.preventDefault())

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  const load = !app.isPackaged && rendererUrl
    ? window.loadURL(rendererUrl)
    : window.loadFile(join(__dirname, "../renderer/index.html"))

  void load.catch((error: unknown) => {
    console.error("Não foi possível carregar a interface:", error)
    app.quit()
  })
}

function startBackend(secretKey: Buffer) {
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
  backend.postMessage({ type: "secret-key", key: secretKey.toString("base64") })

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

void app.whenReady().then(() => {
  ipcMain.handle("app:get-version", () => app.getVersion())

  ipcMain.handle("api:get-base-url", () => apiBaseUrl)
  // Only GitHub links leave the app (PRs, profiles); everything else is refused.
  ipcMain.handle("app:open-external", (_event, url: string) => {
    if (typeof url === "string" && url.startsWith("https://github.com/")) return shell.openExternal(url)
  })
  let secretKey: Buffer
  try {
    secretKey = loadSecretKey(app.getPath("userData"))
  } catch (error) {
    dialog.showErrorBox("Life Board", (error as Error).message)
    app.quit()
    return
  }
  apiBaseUrl = startBackend(secretKey)
  apiBaseUrl.catch((error: unknown) => console.error(error))

  createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on("before-quit", () => {
  backend?.kill()
  backend = null
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit()
})

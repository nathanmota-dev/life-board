import { join } from "node:path"
import { app, BrowserWindow, ipcMain, utilityProcess } from "electron"
import type { UtilityProcess } from "electron"
import backendPath from "./backend-process?modulePath"

let backend: UtilityProcess | null = null
let apiBaseUrl: Promise<string> | null = null

function createWindow() {
  const window = new BrowserWindow({
    title: "Life Board",
    width: 1200,
    height: 800,
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

  window.once("ready-to-show", () => window.show())
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

function startBackend() {
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
  apiBaseUrl = startBackend()
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

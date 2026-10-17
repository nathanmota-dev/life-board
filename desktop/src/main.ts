import { join } from "node:path"
import { app, BrowserWindow, ipcMain, utilityProcess } from "electron"
import type { UtilityProcess } from "electron"
import backendPath from "./backend-process?modulePath"

let backend: UtilityProcess | null = null

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

void app.whenReady().then(() => {
  ipcMain.handle("app:get-version", () => app.getVersion())

  backend = utilityProcess.fork(backendPath, [], {
    serviceName: "Life Board Backend",
  })
  backend.on("exit", (code) => {
    backend = null
    if (code !== 0) console.error(`O backend encerrou com código ${code}.`)
  })

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

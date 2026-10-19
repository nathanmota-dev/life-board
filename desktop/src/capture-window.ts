import { BrowserWindow, globalShortcut, ipcMain } from "electron"
import { loadRenderer, secureWebPreferences } from "./renderer"

const ACCELERATOR = "CommandOrControl+Shift+Space"

let captureWindow: BrowserWindow | null = null
let shortcutLabel: string | null = null

function openCaptureWindow(icon: string) {
  if (captureWindow && !captureWindow.isDestroyed()) {
    captureWindow.show()
    captureWindow.focus()
    return
  }

  const window = new BrowserWindow({
    title: "Life Board",
    icon,
    width: 560,
    height: 200,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: "#ffffff",
    webPreferences: secureWebPreferences,
  })
  captureWindow = window
  // Above full-screen apps too, and on whichever desktop is active.
  window.setAlwaysOnTop(true, "floating")
  window.setVisibleOnAllWorkspaces(true)
  window.once("ready-to-show", () => {
    window.show()
    window.focus()
  })
  window.on("closed", () => {
    if (captureWindow === window) captureWindow = null
  })

  void loadRenderer(window, "/capture").catch((error: unknown) => {
    console.error("Não foi possível abrir a janela de captura:", error)
    window.destroy()
  })
}

/**
 * Registers the global capture shortcut and the IPC the capture window uses.
 * A shortcut taken by another app is logged and the app keeps working without it.
 */
export function registerCaptureShortcut(icon: string) {
  ipcMain.handle("capture:get-shortcut", () => shortcutLabel)
  ipcMain.on("capture:close", (event) => {
    if (captureWindow && event.sender === captureWindow.webContents) captureWindow.close()
  })
  // Lets the main window refresh its inbox without a restart.
  ipcMain.on("capture:saved", (event) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.webContents !== event.sender) window.webContents.send("capture:saved")
    }
  })

  try {
    if (globalShortcut.register(ACCELERATOR, () => openCaptureWindow(icon))) {
      shortcutLabel = process.platform === "darwin" ? "Cmd+Shift+Space" : "Ctrl+Shift+Space"
    } else {
      console.error(`Não foi possível registrar o atalho ${ACCELERATOR}; ele pode estar em uso por outro aplicativo.`)
    }
  } catch (error) {
    console.error(`Não foi possível registrar o atalho ${ACCELERATOR}:`, error)
  }
}

export function unregisterCaptureShortcut() {
  globalShortcut.unregisterAll()
}

export function isCaptureWindow(window: BrowserWindow) {
  return window === captureWindow
}

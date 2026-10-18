import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { screen } from "electron"
import type { BrowserWindow, Rectangle } from "electron"

const STATE_FILE = "window-state.json"
const SAVE_DELAY_MS = 500

export type WindowState = {
  bounds?: Rectangle
  maximized: boolean
  fullScreen: boolean
}

// First run: maximized on the primary display.
const DEFAULT_STATE: WindowState = { maximized: true, fullScreen: false }

function isValidBounds(value: unknown): value is Rectangle {
  const rect = value as Rectangle
  return ["x", "y", "width", "height"].every((key) => Number.isFinite(rect?.[key as keyof Rectangle]))
}

// A monitor may have been unplugged since the last run; drop bounds that no longer fit any display.
function isVisible(bounds: Rectangle) {
  return screen.getAllDisplays().some(({ workArea }) => {
    const width = Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x)
    const height = Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y)
    return width >= 100 && height >= 100
  })
}

/** Reads the saved window state. Must be called after `app` is ready. */
export function loadWindowState(dataDir: string): WindowState {
  try {
    const saved = JSON.parse(readFileSync(join(dataDir, STATE_FILE), "utf8")) as Partial<WindowState>
    return {
      bounds: isValidBounds(saved.bounds) && isVisible(saved.bounds) ? saved.bounds : undefined,
      maximized: saved.maximized === true,
      fullScreen: saved.fullScreen === true,
    }
  } catch {
    return DEFAULT_STATE
  }
}

/** Places the window on the primary display when there are no saved bounds. */
export function defaultBounds(): Rectangle {
  const { workArea } = screen.getPrimaryDisplay()
  const width = Math.min(1200, workArea.width)
  const height = Math.min(800, workArea.height)
  return {
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height,
  }
}

/** Saves size, position and maximized/full-screen flags whenever the user changes them. */
export function trackWindowState(window: BrowserWindow, dataDir: string) {
  let timer: NodeJS.Timeout | undefined

  const save = () => {
    clearTimeout(timer)
    if (window.isDestroyed() || window.isMinimized()) return
    const state: WindowState = {
      // Normal bounds are what the window returns to when un-maximized.
      bounds: window.getNormalBounds(),
      maximized: window.isMaximized(),
      fullScreen: window.isFullScreen(),
    }
    try {
      writeFileSync(join(dataDir, STATE_FILE), JSON.stringify(state))
    } catch (error) {
      console.error("Não foi possível salvar o estado da janela:", error)
    }
  }
  const scheduleSave = () => {
    clearTimeout(timer)
    timer = setTimeout(save, SAVE_DELAY_MS)
  }

  window.on("resize", scheduleSave)
  window.on("move", scheduleSave)
  window.on("maximize", scheduleSave)
  window.on("unmaximize", scheduleSave)
  window.on("enter-full-screen", scheduleSave)
  window.on("leave-full-screen", scheduleSave)
  window.on("close", save)
}

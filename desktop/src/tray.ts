import { app, Menu, Tray } from "electron"
import { onLanguageChange, t } from "./locale"
import { dispatchPomodoro, getPomodoroState, onPomodoroChange } from "./pomodoro"
import { remainingAt } from "./pomodoro-timer"
import type { PomodoroState } from "./pomodoro-timer"
import { appTrayIcon, ringIcon } from "./tray-icon"

// The top-bar icon: shows the pomodoro's progress as a ring, its time left on
// hover, and quick controls in its menu.

const FOCUS_COLOR = "#FF892B"
const BREAK_COLOR = "#34C759"
// The ring redraws in steps rather than every second; Linux re-sends the icon over D-Bus.
const RING_STEPS = 60

let tray: Tray | null = null
let ticker: NodeJS.Timeout | undefined
let iconKey = ""
let menuKey = ""

function formatTime(ms: number) {
  const total = Math.ceil(ms / 1000)
  const minutes = Math.floor(total / 60)
  return `${String(minutes).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}

function statusLabel(state: PomodoroState, remaining: number, forMenu: boolean) {
  const phase = t(`phase.${state.phase}`)
  const time = formatTime(remaining)
  if (state.status === "idle") return t("tray.idle", { time })
  if (state.status === "paused") return t("tray.paused", { phase, time })
  return forMenu ? t("tray.menuRunning", { phase, minutes: Math.ceil(remaining / 60_000) }) : t("tray.running", { phase, time })
}

function updateIcon(state: PomodoroState, remaining: number, iconPath: string) {
  const progress = state.durationMs ? 1 - remaining / state.durationMs : 0
  const step = Math.floor(progress * RING_STEPS)
  const key = state.status === "idle" ? "idle" : `${state.phase}:${state.status}:${step}`
  if (!tray || key === iconKey) return
  iconKey = key
  tray.setImage(
    state.status === "idle"
      ? appTrayIcon(iconPath)
      : ringIcon(step / RING_STEPS, state.phase === "focus" ? FOCUS_COLOR : BREAK_COLOR, state.status === "paused"),
  )
}

// Linux only picks up menu changes through a new menu, so it's rebuilt when its text changes.
function updateMenu(state: PomodoroState, remaining: number, openRoute: (route?: string) => void) {
  const status = statusLabel(state, remaining, true)
  const key = `${status}:${state.status}`
  if (!tray || key === menuKey) return
  menuKey = key
  const toggleLabel = state.status === "running" ? t("tray.pause") : state.status === "paused" ? t("tray.resume") : t("tray.start")

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: status, enabled: false },
      { type: "separator" },
      { label: toggleLabel, click: () => dispatchPomodoro({ type: "toggle" }) },
      { label: t("tray.skip"), click: () => dispatchPomodoro({ type: "skip" }) },
      { label: t("tray.reset"), enabled: state.status !== "idle", click: () => dispatchPomodoro({ type: "reset" }) },
      { type: "separator" },
      { label: t("tray.openPomodoro"), click: () => openRoute("/pomodoro") },
      { label: t("tray.open"), click: () => openRoute() },
      { type: "separator" },
      { label: t("tray.quit"), click: () => app.quit() },
    ]),
  )
}

export function createTray(iconPath: string, openRoute: (route?: string) => void) {
  tray = new Tray(appTrayIcon(iconPath))

  const render = () => {
    const state = getPomodoroState()
    const remaining = remainingAt(state, Date.now())
    tray?.setToolTip(state.status === "idle" ? "Life Board" : statusLabel(state, remaining, false))
    updateIcon(state, remaining, iconPath)
    updateMenu(state, remaining, openRoute)
  }

  const sync = (state: PomodoroState) => {
    clearInterval(ticker)
    if (state.status === "running") ticker = setInterval(render, 1000)
    render()
  }

  onPomodoroChange(sync)
  onLanguageChange(() => {
    menuKey = ""
    render()
  })
  // Windows opens the app on a click; Linux and macOS show the menu instead.
  if (process.platform === "win32") tray.on("click", () => openRoute("/pomodoro"))
  sync(getPomodoroState())
}

import { readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { BrowserWindow, ipcMain, powerMonitor } from "electron"
import { t } from "./locale"
import { showNotification } from "./notifications"
import {
  advance,
  applyCommand,
  createState,
  DEFAULT_SETTINGS,
  emptyDay,
  isPomodoroCommand,
  phaseMinutes,
  rollDay,
  remainingAt,
  sanitizeSettings,
  updateSettings,
} from "./pomodoro-timer"
import type { PomodoroCommand, PomodoroPhase, PomodoroState } from "./pomodoro-timer"

// The timer lives here rather than in a window, so it keeps counting (and
// notifying) from the tray after the main window is closed.

const STATE_FILE = "pomodoro.json"

export type PomodoroCompletion = { phase: PomodoroPhase; next: PomodoroPhase; sound: boolean }

let dataDir = ""
let state: PomodoroState = createState(DEFAULT_SETTINGS, emptyDay(Date.now()))
let timer: NodeJS.Timeout | undefined
const listeners = new Set<(state: PomodoroState) => void>()

function load(): PomodoroState {
  const now = Date.now()
  try {
    const saved = JSON.parse(readFileSync(join(dataDir, STATE_FILE), "utf8")) as Partial<PomodoroState>
    const today = saved.today
    const validToday =
      today && Number.isInteger(today.sessions) && Number.isInteger(today.focusMinutes) && typeof today.day === "string"
    const cycle = typeof saved.cycle === "number" && Number.isInteger(saved.cycle) && saved.cycle >= 0 ? saved.cycle : 0
    const base = rollDay(createState(sanitizeSettings(saved.settings), validToday ? today : emptyDay(now), cycle), now)
    try {
      const path = join(dataDir, "pomodoro-update.json")
      const snapshot = JSON.parse(readFileSync(path, "utf8")) as PomodoroState
      rmSync(path, { force: true })
      if (["running", "paused"].includes(snapshot.status) && ["focus", "shortBreak", "longBreak"].includes(snapshot.phase)
        && Number.isFinite(snapshot.remainingMs) && snapshot.remainingMs >= 0 && snapshot.remainingMs <= 180 * 60_000
        && Number.isFinite(snapshot.durationMs) && snapshot.durationMs > 0 && snapshot.durationMs <= 180 * 60_000) {
        return { ...base, phase: snapshot.phase, status: snapshot.status, durationMs: snapshot.durationMs,
          remainingMs: snapshot.remainingMs, endsAt: snapshot.status === "running" ? now + snapshot.remainingMs : null }
      }
    } catch { /* Ordinary launches start idle; only an explicit update writes a snapshot. */ }
    return base
  } catch {
    return createState(DEFAULT_SETTINGS, emptyDay(now))
  }
}

// Only preferences and today's stats persist; a running timer starts over as idle after a restart.
function save() {
  try {
    writeFileSync(join(dataDir, STATE_FILE), JSON.stringify({ settings: state.settings, today: state.today, cycle: state.cycle }))
  } catch (error) {
    console.error("Não foi possível salvar o pomodoro:", error)
  }
}

function schedule() {
  clearTimeout(timer)
  if (state.status !== "running" || state.endsAt === null) return
  timer = setTimeout(complete, Math.max(0, state.endsAt - Date.now()))
}

function commit(next: PomodoroState, completion?: PomodoroCompletion) {
  state = next
  save()
  schedule()
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("pomodoro:state", state)
    if (completion) window.webContents.send("pomodoro:completed", completion)
  }
  for (const listener of listeners) listener(state)
}

function completionMessage(finished: PomodoroPhase, next: PomodoroState) {
  const minutes = phaseMinutes(next.phase, next.settings)
  const autoStarted = next.status === "running" ? ` ${t("notify.autoStarted")}` : ""
  if (finished !== "focus") return { title: t("notify.breakDone"), body: t("notify.backToFocus", { minutes }) + autoStarted }
  const body = next.phase === "focus" ? t("notify.noBreak") : t("notify.takeBreak", { minutes, phase: t(`phase.${next.phase}`).toLowerCase() })
  return { title: t("notify.focusDone"), body: body + autoStarted }
}

function complete() {
  // Timers can fire late or early around system sleep; trust the wall clock.
  if (state.status !== "running" || state.endsAt === null) return
  if (state.endsAt > Date.now()) return schedule()

  const finished = state.phase
  const next = advance(state, Date.now(), true)
  commit(next, { phase: finished, next: next.phase, sound: next.settings.sound })
  showNotification({ ...completionMessage(finished, next), route: "/pomodoro" })
}

export function getPomodoroState() {
  const rolled = rollDay(state, Date.now())
  if (rolled !== state) commit(rolled)
  return state
}

export function dispatchPomodoro(command: PomodoroCommand) {
  commit(applyCommand(rollDay(state, Date.now()), command, Date.now()))
  return state
}

export function onPomodoroChange(listener: (state: PomodoroState) => void) {
  listeners.add(listener)
}

/** True while a session is running or paused, so closing the window shouldn't quit the app. */
export function isPomodoroActive() {
  return state.status !== "idle"
}

/** Fail the update restart if the active timer cannot be preserved. */
export function preservePomodoroForUpdate() {
  save()
  writeFileSync(join(dataDir, "pomodoro-update.json"), JSON.stringify({ ...state, remainingMs: remainingAt(state, Date.now()) }), { mode: 0o600 })
}

/** A failed native handoff must not resume an obsolete timer on an ordinary launch. */
export function cancelPomodoroUpdate() {
  rmSync(join(dataDir, "pomodoro-update.json"), { force: true })
}

export function registerPomodoro(directory: string) {
  dataDir = directory
  state = load()
  schedule()

  ipcMain.handle("pomodoro:get-state", () => getPomodoroState())
  ipcMain.handle("pomodoro:dispatch", (_event, command: unknown) =>
    isPomodoroCommand(command) ? dispatchPomodoro(command) : state,
  )
  ipcMain.handle("pomodoro:update-settings", (_event, patch: unknown) => {
    commit(updateSettings(state, patch))
    return state
  })
  powerMonitor.on("resume", complete)
}

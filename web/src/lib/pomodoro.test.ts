import { describe, expect, it } from "vitest"
import {
  advance,
  applyCommand,
  createState,
  DEFAULT_SETTINGS,
  emptyDay,
  isPomodoroCommand,
  rollDay,
  sanitizeSettings,
  updateSettings,
} from "../../../desktop/src/pomodoro-timer"
import { cyclePosition, formatCountdown, matchesPreset, phaseProgress, POMODORO_PRESETS, remainingMs, sessionsUntilLongBreak } from "@/lib/pomodoro"

const MINUTE = 60_000
const NOW = new Date(2026, 9, 19, 15, 0).getTime()
const WITH_BREAKS = { ...DEFAULT_SETTINGS, breaksEnabled: true }

function freshState(settings = DEFAULT_SETTINGS) {
  return createState(settings, emptyDay(NOW))
}

describe("pomodoro state machine (main process)", () => {
  it("starts, pauses and resumes keeping the time left", () => {
    const running = applyCommand(freshState(), { type: "start" }, NOW)
    expect(running).toMatchObject({ status: "running", endsAt: NOW + 25 * MINUTE })

    const paused = applyCommand(running, { type: "pause" }, NOW + 10 * MINUTE)
    expect(paused).toMatchObject({ status: "paused", remainingMs: 15 * MINUTE, endsAt: null })

    const resumed = applyCommand(paused, { type: "toggle" }, NOW + 20 * MINUTE)
    expect(resumed).toMatchObject({ status: "running", endsAt: NOW + 35 * MINUTE })
  })

  it("chains focus sessions by default, since breaks start off", () => {
    expect(DEFAULT_SETTINGS.breaksEnabled).toBe(false)
    expect(advance(freshState(), NOW, true)).toMatchObject({ phase: "focus", status: "idle", cycle: 1 })
  })

  it("credits a finished focus session and moves to a short break", () => {
    const next = advance(applyCommand(freshState(WITH_BREAKS), { type: "start" }, NOW), NOW + 25 * MINUTE, true)
    expect(next).toMatchObject({ phase: "shortBreak", status: "idle", cycle: 1, durationMs: 5 * MINUTE })
    expect(next.today).toMatchObject({ sessions: 1, focusMinutes: 25 })
  })

  it("takes a long break after the set and starts a new set after it", () => {
    const state = { ...freshState(WITH_BREAKS), cycle: 3 }
    const longBreak = advance(state, NOW, true)
    expect(longBreak).toMatchObject({ phase: "longBreak", cycle: 4, durationMs: 15 * MINUTE })
    expect(advance(longBreak, NOW, true)).toMatchObject({ phase: "focus", cycle: 0 })
  })

  it("auto-starts the next session when asked", () => {
    const next = advance(freshState({ ...DEFAULT_SETTINGS, autoStart: true }), NOW, true)
    expect(next).toMatchObject({ phase: "focus", status: "running", endsAt: NOW + 25 * MINUTE })
  })

  it("does not count skipped sessions or auto-start after a skip", () => {
    const next = applyCommand(freshState({ ...WITH_BREAKS, autoStart: true }), { type: "skip" }, NOW)
    expect(next).toMatchObject({ phase: "shortBreak", status: "idle" })
    expect(next.today.sessions).toBe(0)
  })

  it("applies new durations right away only while idle", () => {
    expect(updateSettings(freshState(), { focusMinutes: 50 })).toMatchObject({ durationMs: 50 * MINUTE, remainingMs: 50 * MINUTE })

    const running = applyCommand(freshState(), { type: "start" }, NOW)
    const updated = updateSettings(running, { focusMinutes: 50 })
    expect(updated).toMatchObject({ durationMs: 25 * MINUTE, endsAt: running.endsAt })
    expect(updated.settings.focusMinutes).toBe(50)
  })

  it("falls back to focus when breaks are turned off during an idle break", () => {
    const onBreak = applyCommand(freshState(WITH_BREAKS), { type: "select-phase", phase: "shortBreak" }, NOW)
    expect(updateSettings(onBreak, { breaksEnabled: false })).toMatchObject({ phase: "focus", durationMs: 25 * MINUTE })
  })

  it("clamps untrusted settings and ignores unknown fields", () => {
    expect(sanitizeSettings({ focusMinutes: 999, shortBreakMinutes: -3, longBreakEvery: 2.6, sound: "yes", extra: 1 })).toEqual({
      ...DEFAULT_SETTINGS,
      focusMinutes: 180,
      shortBreakMinutes: 1,
      longBreakEvery: 3,
    })
  })

  it("validates commands coming over IPC", () => {
    expect(isPomodoroCommand({ type: "start" })).toBe(true)
    expect(isPomodoroCommand({ type: "select-phase", phase: "longBreak" })).toBe(true)
    expect(isPomodoroCommand({ type: "select-phase", phase: "nap" })).toBe(false)
    expect(isPomodoroCommand({ type: "explode" })).toBe(false)
    expect(isPomodoroCommand(null)).toBe(false)
  })

  it("resets today's stats on a new day", () => {
    const state = { ...freshState(), today: { day: "2026-10-18", sessions: 6, focusMinutes: 150 } }
    expect(rollDay(state, NOW).today).toEqual({ day: "2026-10-19", sessions: 0, focusMinutes: 0 })
  })
})

describe("pomodoro helpers", () => {
  it("formats the countdown, rounding up to the next second", () => {
    expect(formatCountdown(25 * MINUTE)).toBe("25:00")
    expect(formatCountdown(61_001)).toBe("01:02")
    expect(formatCountdown(90 * MINUTE)).toBe("1:30:00")
    expect(formatCountdown(-5)).toBe("00:00")
  })

  it("derives the time left and progress of a running timer", () => {
    const running = applyCommand(freshState(), { type: "start" }, NOW)
    const remaining = remainingMs(running, NOW + 5 * MINUTE)
    expect(remaining).toBe(20 * MINUTE)
    expect(phaseProgress(running, remaining)).toBeCloseTo(0.2)
  })

  it("tracks the position within a set", () => {
    const state = freshState()
    expect(cyclePosition({ ...state, cycle: 0 })).toEqual({ filled: 0, current: 1, total: 4 })
    expect(cyclePosition({ ...state, cycle: 2 })).toEqual({ filled: 2, current: 3, total: 4 })
    expect(cyclePosition({ ...state, phase: "longBreak", cycle: 4 })).toEqual({ filled: 4, current: 4, total: 4 })
    expect(sessionsUntilLongBreak(3, 4)).toBe(1)
    expect(sessionsUntilLongBreak(0, 4)).toBe(4)
  })

  it("recognises the active preset", () => {
    expect(POMODORO_PRESETS.filter((preset) => matchesPreset(DEFAULT_SETTINGS, preset)).map(({ id }) => id)).toEqual(["classic"])
  })
})

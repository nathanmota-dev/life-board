import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_SETTINGS, createState, emptyDay } from "../../../desktop/src/pomodoro-timer"
import { usePomodoro } from "./use-pomodoro"

afterEach(() => {
  delete window.desktop
  vi.useRealTimers()
})

describe("usePomodoro", () => {
  it("counts down running sessions using the shared clock's dates", async () => {
    vi.useFakeTimers()
    const now = Date.now()
    const state = {
      ...createState(DEFAULT_SETTINGS, emptyDay(now)),
      status: "running" as const,
      endsAt: now + 60_000,
      durationMs: 60_000,
    }
    window.desktop = {
      pomodoro: {
        getState: vi.fn().mockResolvedValue(state),
        onState: vi.fn(() => () => {}),
      },
    } as unknown as Window["desktop"]
    const { result, unmount } = renderHook(() => usePomodoro())

    await act(async () => {})
    expect(result.current?.remainingMs).toBe(60_000)

    act(() => vi.advanceTimersByTime(1250))
    expect(result.current?.remainingMs).toBe(58_750)
    expect(result.current?.progress).toBeCloseTo(1250 / 60_000)

    act(() => vi.advanceTimersByTime(60_000))
    expect(result.current?.remainingMs).toBe(0)
    expect(result.current?.progress).toBe(1)

    unmount()
  })
})

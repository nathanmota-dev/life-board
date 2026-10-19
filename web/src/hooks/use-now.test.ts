import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useNow } from "./use-now"

describe("useNow", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("provides dates to dashboard consumers every thirty seconds by default", () => {
    const { result, unmount } = renderHook(() => useNow())
    const initial = result.current.getTime()

    act(() => vi.advanceTimersByTime(29_000))
    expect(result.current.getTime()).toBe(initial)
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.toISOString()).toBe("2026-10-19T12:00:30.000Z")

    unmount()
  })

  it("supports the pomodoro clock cadence, pausing and resuming", () => {
    const { result, rerender, unmount } = renderHook(
      (interval: number | null) => useNow(interval),
      { initialProps: 1000 as number | null },
    )
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.toISOString()).toBe("2026-10-19T12:00:01.000Z")

    rerender(null)
    act(() => {
      vi.advanceTimersByTime(5000)
      window.dispatchEvent(new Event("focus"))
    })
    expect(result.current.toISOString()).toBe("2026-10-19T12:00:01.000Z")

    rerender(1000)
    expect(result.current.toISOString()).toBe("2026-10-19T12:00:06.000Z")
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current.toISOString()).toBe("2026-10-19T12:00:07.000Z")

    unmount()
  })

  it("refreshes when the window regains focus and cleans up on unmount", () => {
    const { result, unmount } = renderHook(() => useNow())

    act(() => {
      vi.setSystemTime(new Date("2026-10-20T09:00:00Z"))
      window.dispatchEvent(new Event("focus"))
    })
    expect(result.current.toISOString()).toBe("2026-10-20T09:00:00.000Z")

    const removeListener = vi.spyOn(window, "removeEventListener")
    unmount()
    expect(removeListener).toHaveBeenCalledWith("focus", expect.any(Function))
    expect(vi.getTimerCount()).toBe(0)
    removeListener.mockRestore()
  })
})

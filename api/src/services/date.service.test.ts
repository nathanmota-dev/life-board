import { describe, expect, it } from "vitest"
import { addDays, fromDayKey, startOfWeek, toDayKey } from "./date.service"

describe("date service", () => {
  it("converts between dates and local day keys", () => {
    expect(toDayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05")
    expect(fromDayKey("2026-01-05")).toEqual(new Date(2026, 0, 5))
    expect(toDayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("adds days across month boundaries", () => {
    expect(toDayKey(addDays(new Date(2026, 0, 31), 1))).toBe("2026-02-01")
    expect(toDayKey(addDays(new Date(2026, 2, 1), -1))).toBe("2026-02-28")
  })

  it("finds the Sunday that starts the week", () => {
    expect(startOfWeek(new Date(2026, 9, 17, 15))).toEqual(new Date(2026, 9, 11))
    expect(startOfWeek(new Date(2026, 9, 11, 1))).toEqual(new Date(2026, 9, 11))
    expect(startOfWeek().getDay()).toBe(0)
  })
})

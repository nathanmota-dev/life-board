import { describe, expect, it } from "vitest"
import {
  addDays,
  formatRelativeDay,
  fromDateInput,
  fromDayKey,
  lastDays,
  startOfWeek,
  toDateInput,
  toDateTimeInput,
  toDayKey,
} from "@/lib/dates"

describe("dates", () => {
  it("converts between dates and day keys", () => {
    expect(toDayKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05")
    expect(fromDayKey("2026-01-05")).toEqual(new Date(2026, 0, 5))
    expect(toDayKey(addDays(new Date(2026, 0, 31), 1))).toBe("2026-02-01")
  })

  it("finds the Sunday that starts the week and lists recent days", () => {
    expect(startOfWeek(new Date(2026, 9, 17, 15))).toEqual(new Date(2026, 9, 11))
    expect(lastDays(3, new Date(2026, 9, 17))).toEqual(["2026-10-15", "2026-10-16", "2026-10-17"])
  })

  it("round-trips form input values", () => {
    const iso = new Date(2026, 9, 17, 9, 5).toISOString()
    expect(toDateInput(iso)).toBe("2026-10-17")
    expect(toDateInput(null)).toBe("")
    expect(fromDateInput("2026-10-17")).toBe(new Date(2026, 9, 17).toISOString())
    expect(fromDateInput("")).toBeNull()
    expect(toDateTimeInput(iso)).toBe("2026-10-17T09:05")
  })

  it("describes days relative to now", () => {
    const now = new Date(2026, 9, 17, 12)
    expect(formatRelativeDay(new Date(2026, 9, 17, 8), now)).toMatch(/today/i)
    expect(formatRelativeDay(new Date(2026, 9, 18), now)).toMatch(/tomorrow/i)
  })
})

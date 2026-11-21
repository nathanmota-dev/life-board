import { afterEach, describe, expect, it } from "vitest"
import {
  addDays,
  DATE_FORMAT_STORAGE_KEY,
  formatDate,
  formatDateTime,
  formatTime,
  getDateFormat,
  formatRelativeDay,
  fromDateInput,
  fromDayKey,
  lastDays,
  setDateFormat,
  startOfWeek,
  toDateInput,
  toDateTimeInput,
  toDayKey,
} from "@/lib/dates"
import { i18n } from "@/lib/i18n"

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

describe("date format", () => {
  const date = new Date(2026, 10, 21, 17, 42)
  const numeric = { day: "2-digit", month: "2-digit", year: "numeric" } as const
  afterEach(() => localStorage.removeItem(DATE_FORMAT_STORAGE_KEY))

  it("follows the language until a format is chosen", async () => {
    expect(getDateFormat()).toBe("mdy")
    expect(formatDate(date, numeric)).toBe("11/21/2026")
    await i18n.changeLanguage("pt")
    expect(getDateFormat()).toBe("dmy")
    expect(formatDate(date, numeric)).toBe("21/11/2026")
  })

  it("shows day first in English, with English month names", () => {
    setDateFormat("dmy")
    expect(formatDate(date, numeric)).toBe("21/11/2026")
    expect(formatDate(date, { day: "numeric", month: "short" })).toBe("21 Nov")
    expect(formatDateTime(date)).toBe("21/11/2026, 17:42")
    expect(formatTime(date)).toBe("17:42")
  })

  it("shows month first in Portuguese and keeps month names", async () => {
    await i18n.changeLanguage("pt")
    setDateFormat("mdy")
    expect(formatDate(date, numeric)).toBe("11/21/2026")
    expect(formatDateTime(date)).toBe("11/21/2026, 17:42")
    expect(formatDate(date, { day: "numeric", month: "long" })).toBe("21 de novembro")
  })

  it("ignores invalid stored values", () => {
    localStorage.setItem(DATE_FORMAT_STORAGE_KEY, "ymd")
    expect(getDateFormat()).toBe("mdy")
  })
})

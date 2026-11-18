import { describe, expect, it } from "vitest"
import { enUS, ptBR } from "date-fns/locale"
import {
  calendarLocale,
  colorName,
  EVENT_COLOR_HEX,
  emptyEventValues,
  eventToValues,
  newCalendarItem,
  nextHourRange,
  toCalendarItem,
  toCalendarRange,
  toEventInput,
  valuesToEventInput,
} from "@/lib/calendar"
import type { CalendarEvent } from "@/types/calendar"

function event(id: string, start: Date, end: Date, allDay = false): CalendarEvent {
  return {
    id,
    title: id,
    description: null,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    allDay,
    location: null,
    color: "#FF892B",
    createdAt: "",
    updatedAt: "",
  }
}

describe("calendar form", () => {
  it("converts form values for timed and all-day events", () => {
    const values = { ...emptyEventValues(new Date(2026, 9, 12, 9)), title: " Gym " }
    expect(values.start).toBe("2026-10-12T09:00")
    expect(values.end).toBe("2026-10-12T10:00")
    expect(valuesToEventInput(values)).toMatchObject({ title: "Gym", allDay: false, location: null })

    const allDay = valuesToEventInput({ ...values, allDay: true, start: "2026-10-12T00:00", end: "2026-10-12T00:00" })
    expect(allDay.startAt).toBe(new Date(2026, 9, 12).toISOString())

    const stored = event("x", new Date(2026, 9, 12, 9), new Date(2026, 9, 12, 10))
    expect(eventToValues(stored)).toMatchObject({ title: "x", start: "2026-10-12T09:00", location: "" })
  })
})

describe("calendar view adapter", () => {
  it("maps stored hex colors to the closest named color and back", () => {
    expect(colorName("#FF892B")).toBe("orange")
    expect(colorName("#3b82f6")).toBe("blue")
    expect(colorName("#2563EB")).toBe("blue")
    expect(colorName("#000000")).toBe("gray")
    expect(EVENT_COLOR_HEX[colorName("#10B981")]).toBe("#10B981")
  })

  it("turns a stored event into a calendar item, under the id the view knows", () => {
    const stored = { ...event("x", new Date(2026, 9, 12, 9), new Date(2026, 9, 12, 10)), location: "Office", color: "#8B5CF6" }
    expect(toCalendarItem(stored)).toEqual({
      id: "x",
      title: "x",
      start: new Date(2026, 9, 12, 9),
      end: new Date(2026, 9, 12, 10),
      isAllDay: false,
      color: "purple",
      description: undefined,
      location: "Office",
    })
    expect(toCalendarItem(stored, "client-id").id).toBe("client-id")
  })

  it("builds the API body, naming untitled events and clearing blank fields", () => {
    const item = { id: "x", title: "  ", start: new Date(2026, 9, 12, 9), end: new Date(2026, 9, 12, 10), location: " ", description: " Notes " }
    expect(toEventInput(item)).toEqual({
      title: "Untitled event",
      startAt: new Date(2026, 9, 12, 9).toISOString(),
      endAt: new Date(2026, 9, 12, 10).toISOString(),
      allDay: false,
      location: null,
      description: "Notes",
      color: "#FF892B",
    })
    expect(toEventInput({ ...item, title: "Gym", isAllDay: true, color: "green" })).toMatchObject({ title: "Gym", allDay: true, color: "#10B981" })
  })

  it("asks the API for the visible days, end inclusive", () => {
    const range = toCalendarRange({ start: new Date(2026, 9, 11), end: new Date(2026, 9, 18) })
    expect(range).toEqual({ from: new Date(2026, 9, 11).toISOString(), to: new Date(new Date(2026, 9, 18).getTime() - 1).toISOString() })
  })

  it("creates new events in the next hour, named and orange", () => {
    const { start, end } = nextHourRange()
    expect(start.getMinutes()).toBe(0)
    expect(start.getTime()).toBeGreaterThan(Date.now())
    expect(end.getTime() - start.getTime()).toBe(60 * 60 * 1000)
    expect(newCalendarItem({ start, end })).toMatchObject({ title: "New event", start, end, color: "orange", id: expect.any(String) })
  })

  it("names days and months in the app's language", () => {
    expect(calendarLocale("pt")).toBe(ptBR)
    expect(calendarLocale("en")).toBe(enUS)
    expect(calendarLocale(undefined)).toBe(enUS)
  })
})

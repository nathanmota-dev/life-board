import { describe, expect, it } from "vitest"
import { emptyEventValues, eventToValues, layoutWeek, valuesToEventInput, weekDays, weekRange } from "@/lib/calendar"
import type { CalendarEvent } from "@/types/calendar"

const weekStart = new Date(2026, 9, 11)
const days = weekDays(weekStart)

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

describe("calendar layout", () => {
  it("covers the whole week", () => {
    expect(days).toHaveLength(7)
    const range = weekRange(weekStart)
    expect(new Date(range.to).getTime() - new Date(range.from).getTime()).toBe(7 * 24 * 60 * 60 * 1000 - 1)
  })

  it("places timed and all-day events on their day and skips other weeks", () => {
    const layout = layoutWeek(
      [
        event("standup", new Date(2026, 9, 12, 9), new Date(2026, 9, 12, 9, 15)),
        event("holiday", new Date(2026, 9, 14), new Date(2026, 9, 14), true),
        event("next-week", new Date(2026, 9, 20, 9), new Date(2026, 9, 20, 10)),
      ],
      days,
    )

    expect(layout.timed[1]).toEqual([expect.objectContaining({ startMinute: 540, endMinute: 560, lane: 0, lanes: 1 })])
    expect(layout.allDay[3].map((item) => item.id)).toEqual(["holiday"])
    expect(layout.timed.flat()).toHaveLength(1)
  })

  it("puts overlapping events side by side", () => {
    const layout = layoutWeek(
      [
        event("a", new Date(2026, 9, 13, 9), new Date(2026, 9, 13, 11)),
        event("b", new Date(2026, 9, 13, 10), new Date(2026, 9, 13, 12)),
        event("c", new Date(2026, 9, 13, 14), new Date(2026, 9, 13, 15)),
      ],
      days,
    )

    expect(layout.timed[2].map(({ event: item, lane, lanes }) => [item.id, lane, lanes])).toEqual([
      ["a", 0, 2],
      ["b", 1, 2],
      ["c", 0, 1],
    ])
  })

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

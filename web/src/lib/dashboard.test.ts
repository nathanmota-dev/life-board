import { afterEach, describe, expect, it, vi } from "vitest"
import {
  countdown,
  dayTimeline,
  daySummary,
  DASHBOARD_LAYOUT_STORAGE_KEY,
  defaultDashboardLayout,
  focusCandidates,
  isAloneOnRow,
  moveWidget,
  normalizeDashboardLayout,
  planFocusRollover,
  readDashboardLayout,
  saveDashboardLayout,
  sortHabitsForDay,
  todayRange,
  toggleQuickCapture,
  toggleWidget,
  unfinishedFocus,
  visibleWidgets,
} from "@/lib/dashboard"
import type { CalendarEvent } from "@/types/calendar"
import type { Habit } from "@/types/habit"
import type { Task } from "@/types/task"

const now = new Date(2026, 9, 19, 10, 0)

const event = (id: string, start: [number, number], end: [number, number], extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id,
  title: id,
  description: null,
  startAt: new Date(2026, 9, 19, ...start).toISOString(),
  endAt: new Date(2026, 9, 19, ...end).toISOString(),
  allDay: false,
  location: null,
  color: "#3B82F6",
  createdAt: "",
  updatedAt: "",
  ...extra,
})

const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id,
  title: id,
  description: null,
  status: "inbox",
  priority: "none",
  dueAt: null,
  completedAt: null,
  parentTaskId: null,
  tags: [],
  linkedThoughtIds: [],
  pinned: false,
  color: null,
  order: 0,
  archivedAt: null,
  focusDay: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...extra,
})

const habit = (id: string, doneToday: boolean): Habit => ({
  id,
  name: id,
  unit: "times",
  target: 1,
  step: 1,
  emoji: "🌱",
  todayCount: doneToday ? 1 : 0,
  doneToday,
  streak: 0,
  createdAt: "",
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe("day timeline", () => {
  it("orders timed events, keeps all-day ones apart and marks past, current and next", () => {
    const lunch = event("lunch", [12, 0], [13, 0], { location: "Cafe" })
    const standup = event("standup", [9, 0], [9, 15])
    const focus = event("focus", [9, 30], [11, 0])
    const gym = event("gym", [18, 0], [19, 0])
    const holiday = event("holiday", [0, 0], [0, 0], { allDay: true })

    const timeline = dayTimeline([gym, lunch, holiday, standup, focus], now)

    expect(timeline.allDay.map((item) => item.id)).toEqual(["holiday"])
    expect(timeline.items.map((item) => [item.event.id, item.state])).toEqual([
      ["standup", "past"],
      ["focus", "current"],
      ["lunch", "next"],
      ["gym", "upcoming"],
    ])
    // The "now" line goes right after the events that already started.
    expect(timeline.nowIndex).toBe(2)
  })

  it("puts the now line first before the day starts and last after it ends", () => {
    const early = new Date(2026, 9, 19, 6)
    const late = new Date(2026, 9, 19, 23)
    const events = [event("a", [9, 0], [10, 0]), event("b", [14, 0], [15, 0])]

    expect(dayTimeline(events, early).nowIndex).toBe(0)
    expect(dayTimeline(events, late)).toMatchObject({ nowIndex: 2 })
    expect(dayTimeline(events, late).items.every((item) => item.state === "past")).toBe(true)
  })

  it("counts down to the next event, rounding up to the minute", () => {
    const at = (hours: number, minutes: number, seconds = 0) => new Date(2026, 9, 19, hours, minutes, seconds)
    expect(countdown(at(10, 25), now)).toBe("in 25 min")
    expect(countdown(at(10, 0, 20), now)).toBe("in 1 min")
    expect(countdown(at(12, 0), now)).toBe("in 2 h")
    expect(countdown(at(11, 5), now)).toBe("in 1 h 5 min")
  })

  it("covers today from midnight to its last millisecond", () => {
    const range = todayRange(now)
    expect(new Date(range.from)).toEqual(new Date(2026, 9, 19))
    expect(new Date(range.to).getTime()).toBe(new Date(2026, 9, 20).getTime() - 1)
  })
})

describe("focus", () => {
  it("offers open tasks for today, overdue or upcoming that aren't in the focus yet", () => {
    const tasks = [
      task("today", { status: "today" }),
      task("overdue", { dueAt: new Date(2026, 9, 17).toISOString() }),
      task("upcoming", { status: "upcoming" }),
      task("picked", { status: "today" }),
      task("someday", { status: "someday" }),
      task("inbox"),
      task("done", { status: "done" }),
    ]

    expect(focusCandidates(tasks, ["picked"], "", now).map((item) => item.id)).toEqual(["today", "overdue", "upcoming"])
    expect(focusCandidates(tasks, [], "  OVER ", now).map((item) => item.id)).toEqual(["overdue"])
  })

  it("offers only yesterday's unfinished focus and keeps as many as fit today", () => {
    const yesterday = [task("a"), task("b", { status: "done" }), task("c"), task("d")]
    const unfinished = unfinishedFocus(yesterday)

    expect(unfinished.map((item) => item.id)).toEqual(["a", "c", "d"])
    expect(planFocusRollover(unfinished, 3)).toEqual({ keep: unfinished, drop: [] })
    const partial = planFocusRollover(unfinished, 1)
    expect([partial.keep.map((item) => item.id), partial.drop.map((item) => item.id)]).toEqual([["a"], ["c", "d"]])
    expect(planFocusRollover(unfinished, -1).keep).toEqual([])
  })
})

describe("habits and day summary", () => {
  it("moves met habits to the end, keeping each group's order", () => {
    const habits = [habit("a", true), habit("b", false), habit("c", true), habit("d", false)]
    expect(sortHabitsForDay(habits).map((item) => item.id)).toEqual(["b", "d", "a", "c"])
  })

  it("counts tasks completed today, habits met and events already held", () => {
    const done = [
      task("today", { status: "done", completedAt: new Date(2026, 9, 19, 8).toISOString() }),
      task("yesterday", { status: "done", completedAt: new Date(2026, 9, 18, 22).toISOString() }),
    ]
    const events = [event("held", [9, 0], [9, 30]), event("later", [15, 0], [16, 0]), event("allday", [0, 0], [0, 0], { allDay: true })]

    expect(daySummary(done, [habit("a", true), habit("b", false)], events, now)).toEqual({
      tasksCompleted: 1,
      habitsMet: 1,
      habitsTotal: 2,
      eventsHeld: 2,
    })
  })
})

describe("dashboard layout", () => {
  it("hides, shows and reorders widgets", () => {
    const layout = defaultDashboardLayout()
    const hidden = toggleWidget(layout, "mood")
    expect(visibleWidgets(hidden)).not.toContain("mood")
    expect(toggleWidget(hidden, "mood").hidden).toEqual([])

    expect(moveWidget(layout, "focus", -1).order.slice(0, 2)).toEqual(["focus", "myDay"])
    expect(moveWidget(layout, "goals", 1)).toBe(layout)
    expect(moveWidget(layout, "myDay", -1)).toBe(layout)
  })

  it("starts with the quick capture off and toggles it", () => {
    const layout = defaultDashboardLayout()
    expect(layout.quickCapture).toBe(false)
    expect(toggleQuickCapture(layout).quickCapture).toBe(true)
    expect(toggleQuickCapture(toggleQuickCapture(layout))).toEqual(layout)
  })

  it("gives the whole row to the last widget of an odd count", () => {
    expect([0, 1, 2, 3, 4].map((index) => isAloneOnRow(index, 5))).toEqual([false, false, false, false, true])
    expect([0, 1, 2, 3].map((index) => isAloneOnRow(index, 4))).toEqual([false, false, false, false])
    expect(isAloneOnRow(0, 1)).toBe(true)
  })

  it("drops unknown or repeated widgets from storage and appends missing ones", () => {
    // "github" was a widget once; saved layouts that still list it drop it.
    expect(normalizeDashboardLayout({ order: ["goals", "github", "nope", "goals", "mood"], hidden: ["focus", 4, "focus", "github"] })).toEqual({
      order: ["goals", "mood", "myDay", "focus", "habits"],
      hidden: ["focus"],
      quickCapture: false,
    })
    expect(normalizeDashboardLayout({ quickCapture: true }).quickCapture).toBe(true)
    expect(normalizeDashboardLayout(null)).toEqual(defaultDashboardLayout())
  })

  it("saves the layout and reads it back", () => {
    const layout = moveWidget(toggleWidget(defaultDashboardLayout(), "goals"), "mood", -1)
    saveDashboardLayout(layout)

    expect(JSON.parse(localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY) ?? "")).toEqual(layout)
    expect(readDashboardLayout()).toEqual(layout)
  })

  it("falls back to the default layout when storage is unavailable or corrupt", () => {
    localStorage.setItem(DASHBOARD_LAYOUT_STORAGE_KEY, "{not json")
    expect(readDashboardLayout()).toEqual(defaultDashboardLayout())

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked")
    })
    expect(readDashboardLayout()).toEqual(defaultDashboardLayout())
    expect(() => saveDashboardLayout(defaultDashboardLayout())).not.toThrow()
  })
})

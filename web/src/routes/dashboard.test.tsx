import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Dashboard } from "@/routes/dashboard"
import { DASHBOARD_LAYOUT_STORAGE_KEY } from "@/lib/dashboard"
import { mockApi, resetApiMock, type MockRequest } from "@/test/mock-api"
import { renderWithProviders } from "@/test/render-with-providers"
import type { CalendarEvent } from "@/types/calendar"
import type { Habit } from "@/types/habit"
import type { MoodEntry } from "@/types/mood"
import type { Task } from "@/types/task"

const TODAY = "2026-10-19"
const YESTERDAY = "2026-10-18"
const at = (hours: number, minutes = 0) => new Date(2026, 9, 19, hours, minutes).toISOString()

const baseTask: Task = {
  id: "t0",
  title: "Task",
  description: null,
  status: "today",
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
}

const baseEvent: CalendarEvent = {
  id: "e0",
  title: "Event",
  description: null,
  startAt: at(9),
  endAt: at(10),
  allDay: false,
  location: null,
  color: "#3B82F6",
  createdAt: "",
  updatedAt: "",
}

const water: Habit = {
  id: "h1",
  name: "Drink water",
  unit: "ml",
  target: 3000,
  step: 500,
  emoji: "💧",
  todayCount: 2500,
  doneToday: false,
  streak: 2,
  createdAt: "2026-10-01T00:00:00.000Z",
}

const stretch: Habit = { ...water, id: "h2", name: "Stretch", unit: "times", target: 1, step: 1, todayCount: 1, doneToday: true }

type World = { tasks: Task[]; events: CalendarEvent[]; habits: Habit[]; mood: MoodEntry | null }

/** A small in-memory API so mutations show up in the following reads. */
function mockDashboard(initial: Partial<World> = {}) {
  const world: World = { tasks: [], events: [], habits: [], mood: null, ...initial }
  const patchTask = ({ path, body }: MockRequest) => {
    const id = path.split("/").pop()
    const input = body as Partial<Task>
    if (input.focusDay && world.tasks.filter((task) => task.focusDay === input.focusDay && task.id !== id).length >= 3) {
      return [400, { error: "focus_limit", message: "A day can have at most 3 focus tasks." }]
    }
    const completedAt = input.status === "done" ? new Date().toISOString() : input.status ? null : undefined
    world.tasks = world.tasks.map((task) =>
      task.id === id ? { ...task, ...input, ...(completedAt !== undefined ? { completedAt } : {}) } : task,
    )
    return world.tasks.find((task) => task.id === id)
  }
  const handlers: Record<string, (request: MockRequest) => unknown> = {
    "GET /tasks": ({ query }) => ({
      items: world.tasks.filter(
        (task) =>
          task.archivedAt === null &&
          (!query.get("focusDay") || task.focusDay === query.get("focusDay")) &&
          (!query.get("status") || task.status === query.get("status")),
      ),
    }),
    "POST /tasks": ({ body }) => {
      const task = { ...baseTask, ...(body as Partial<Task>), id: `t${world.tasks.length + 100}` }
      world.tasks = [task, ...world.tasks]
      return task
    },
    "POST /thoughts": ({ body }) => ({ id: "th1", ...(body as object) }),
    "GET /calendar/events": () => ({ items: world.events }),
    "PATCH /calendar/events/e1": ({ body }) => {
      world.events = world.events.map((event) => (event.id === "e1" ? { ...event, ...(body as Partial<CalendarEvent>) } : event))
      return world.events.find((event) => event.id === "e1")
    },
    "GET /habits": () => ({ items: world.habits }),
    "GET /goals": () => ({ items: [] }),
    "GET /github/status": () => ({ connected: false, login: null, lastSyncAt: null, lastSyncError: null }),
    "GET /mood/today": () => ({ day: TODAY, entry: world.mood, nextAvailableAt: at(24) }),
    "POST /mood/entries": ({ body }) => {
      const input = body as { score: number; note: string | null }
      world.mood = { id: "m1", day: TODAY, ...input, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      return world.mood
    },
  }
  for (const task of world.tasks) handlers[`PATCH /tasks/${task.id}`] = patchTask
  for (const habit of world.habits) {
    handlers[`POST /habits/${habit.id}/logs`] = ({ body }) => {
      const delta = (body as { delta: number }).delta
      world.habits = world.habits.map((item) =>
        item.id === habit.id ? { ...item, todayCount: item.todayCount + delta, doneToday: item.todayCount + delta >= item.target } : item,
      )
      return { habitId: habit.id, day: TODAY, count: 0 }
    }
  }
  const api = mockApi(handlers)
  return { ...api, world, mutations: () => api.calls.filter((call) => call.method !== "GET").map(({ method, path, body }) => ({ method, path, body })) }
}

const widget = async (name: string) => (await screen.findByRole("heading", { name })).closest("div.rounded-2xl") as HTMLElement

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(2026, 9, 19, 10, 0))
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  resetApiMock()
  localStorage.clear()
})

describe("Dashboard timeline", () => {
  it("lists today's events in order with the now line, the next event's countdown and the dialog", async () => {
    const { mutations } = mockDashboard({
      events: [
        { ...baseEvent, id: "e3", title: "Gym", startAt: at(18), endAt: at(19) },
        { ...baseEvent, id: "e1", title: "Lunch with Ana", startAt: at(10, 25), endAt: at(11, 30), location: "Cafe Central" },
        { ...baseEvent, id: "e2", title: "Standup", startAt: at(9), endAt: at(9, 15) },
        { ...baseEvent, id: "e4", title: "Holiday", startAt: at(0), endAt: at(0), allDay: true },
      ],
    })
    renderWithProviders(<Dashboard />)

    const timeline = await screen.findByRole("list", { name: "Today's timeline" })
    const rows = within(timeline).getAllByRole("listitem").map((row) => row.textContent ?? "")
    expect(rows[0]).toContain("Standup")
    expect(rows[1]).toMatch(/^Now · /)
    expect(rows[2]).toContain("Lunch with Ana")
    expect(rows[2]).toContain("in 25 min")
    expect(rows[2]).toContain("Cafe Central")
    expect(rows[3]).toContain("Gym")
    expect(screen.getByRole("button", { name: "Holiday" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open Standup" })).toHaveClass("opacity-55")

    fireEvent.click(screen.getByRole("button", { name: "Open Lunch with Ana" }))
    expect(await screen.findByRole("dialog", { name: "Edit event" })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Lunch with Bia" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(await screen.findByRole("button", { name: "Open Lunch with Bia" })).toBeInTheDocument()
    expect(mutations()).toEqual([expect.objectContaining({ method: "PATCH", path: "/calendar/events/e1" })])
  })

  it("shows an empty state without events", async () => {
    mockDashboard()
    renderWithProviders(<Dashboard />)

    expect(await screen.findByText("No events today")).toBeInTheDocument()
  })
})

describe("Dashboard focus", () => {
  it("picks focus tasks up to the limit and completes them inline", async () => {
    const { mutations } = mockDashboard({
      tasks: [
        { ...baseTask, id: "t1", title: "Write report", focusDay: TODAY },
        { ...baseTask, id: "t2", title: "Call the bank", focusDay: TODAY },
        { ...baseTask, id: "t3", title: "Book dentist", status: "upcoming" },
        { ...baseTask, id: "t4", title: "Pay rent", status: "inbox", dueAt: new Date(2026, 9, 17).toISOString() },
        { ...baseTask, id: "t5", title: "Someday trip", status: "someday" },
      ],
    })
    renderWithProviders(<Dashboard />)

    expect(await screen.findByText("Write report")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /Choose focus/ }))
    const search = await screen.findByLabelText("Search tasks")
    expect(screen.getByText("1 slot left for today")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Add Someday trip to today's focus" })).not.toBeInTheDocument()
    fireEvent.change(search, { target: { value: "dent" } })
    expect(screen.queryByRole("button", { name: "Add Pay rent to today's focus" })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Add Book dentist to today's focus" }))

    expect(await screen.findByText(/You already have 3 focus tasks for today/)).toBeInTheDocument()
    fireEvent.change(search, { target: { value: "" } })
    expect(screen.getByRole("button", { name: "Add Pay rent to today's focus" })).toBeDisabled()
    expect(within(await widget("Focus of the day")).getByText("Book dentist")).toBeInTheDocument()

    expect(screen.getByText("3 tasks")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("checkbox", { name: "Complete Write report" }))
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Complete Write report" })).toBeChecked())
    expect(screen.getByText("2 tasks")).toBeInTheDocument()

    expect(mutations()).toEqual([
      { method: "PATCH", path: "/tasks/t3", body: { focusDay: TODAY } },
      { method: "PATCH", path: "/tasks/t1", body: { status: "done" } },
    ])
  })

  it("shows the API's refusal of a fourth focus task", async () => {
    mockDashboard({
      tasks: [
        { ...baseTask, id: "t1", title: "One", focusDay: TODAY },
        { ...baseTask, id: "t2", title: "Two", focusDay: TODAY },
        { ...baseTask, id: "t3", title: "Archived elsewhere", focusDay: TODAY, archivedAt: "2026-10-19T08:00:00.000Z", status: "someday" },
        { ...baseTask, id: "t4", title: "Four" },
      ],
    })
    renderWithProviders(<Dashboard />)

    fireEvent.click(await screen.findByRole("button", { name: /Choose focus/ }))
    fireEvent.click(await screen.findByRole("button", { name: "Add Four to today's focus" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("A day can have at most 3 focus tasks.")
  })

  it("offers yesterday's unfinished focus again instead of carrying it silently", async () => {
    const { mutations } = mockDashboard({
      tasks: [
        { ...baseTask, id: "t1", title: "Finish slides", focusDay: YESTERDAY },
        { ...baseTask, id: "t2", title: "Done yesterday", focusDay: YESTERDAY, status: "done", completedAt: "2026-10-18T15:00:00.000Z" },
        { ...baseTask, id: "t3", title: "Reply to Ana", focusDay: YESTERDAY },
      ],
    })
    renderWithProviders(<Dashboard />)

    const offer = await screen.findByRole("region", { name: "Keep yesterday's focus?" })
    expect(within(offer).getByText("2 focus tasks from yesterday are still open.")).toBeInTheDocument()
    expect(within(offer).queryByText("Done yesterday")).not.toBeInTheDocument()
    expect(screen.getByText("No focus chosen yet")).toBeInTheDocument()

    fireEvent.click(within(offer).getByRole("button", { name: "Keep them" }))

    await waitFor(() => expect(screen.queryByRole("region", { name: "Keep yesterday's focus?" })).not.toBeInTheDocument())
    expect(within(await widget("Focus of the day")).getByText("Finish slides")).toBeInTheDocument()
    expect(mutations()).toEqual([
      { method: "PATCH", path: "/tasks/t1", body: { focusDay: TODAY } },
      { method: "PATCH", path: "/tasks/t3", body: { focusDay: TODAY } },
    ])
  })

  it("starts fresh by taking yesterday's tasks out of the focus", async () => {
    const { mutations } = mockDashboard({ tasks: [{ ...baseTask, id: "t1", title: "Finish slides", focusDay: YESTERDAY }] })
    renderWithProviders(<Dashboard />)

    fireEvent.click(await screen.findByRole("button", { name: "Start fresh" }))

    await waitFor(() => expect(mutations()).toEqual([{ method: "PATCH", path: "/tasks/t1", body: { focusDay: null } }]))
    await waitFor(() => expect(screen.queryByText("Keep yesterday's focus?")).not.toBeInTheDocument())
  })
})

describe("Dashboard habits, mood and capture", () => {
  it("checks in and undoes habits like the Habits page, met ones last", async () => {
    const { mutations } = mockDashboard({ habits: [stretch, water] })
    renderWithProviders(<Dashboard />)

    const panel = await widget("Habits")
    expect(await within(panel).findByText("Drink water")).toBeInTheDocument()
    expect(within(panel).getAllByRole("listitem").map((row) => row.textContent)).toEqual([
      expect.stringContaining("Drink water"),
      expect.stringContaining("Stretch"),
    ])

    fireEvent.click(within(panel).getByRole("button", { name: "Log Drink water" }))
    expect(await within(panel).findByText("3000 / 3000 ml")).toBeInTheDocument()
    await waitFor(() => expect(within(panel).getAllByRole("listitem")[1]).toHaveTextContent("Drink water"))
    fireEvent.click(within(panel).getByRole("button", { name: "Undo Drink water" }))
    expect(await within(panel).findByText("2500 / 3000 ml")).toBeInTheDocument()

    expect(mutations().map((call) => call.body)).toEqual([{ delta: 500 }, { delta: -500 }])
  })

  it("saves the mood, then shows the day's summary and lets it change", async () => {
    const { mutations } = mockDashboard({
      habits: [stretch, water],
      tasks: [
        { ...baseTask, id: "t1", status: "done", completedAt: at(8) },
        { ...baseTask, id: "t2", status: "done", completedAt: "2026-10-10T08:00:00.000Z" },
      ],
      events: [{ ...baseEvent, id: "e2", title: "Standup", startAt: at(9), endAt: at(9, 15) }, { ...baseEvent, id: "e3", startAt: at(18), endAt: at(19) }],
    })
    renderWithProviders(<Dashboard />)

    const mood = await widget("Mood")
    fireEvent.click(await within(mood).findByRole("radio", { name: /Great/ }))
    fireEvent.click(within(mood).getByRole("button", { name: "Save mood" }))

    const change = await within(mood).findByRole("button", { name: "Change" })
    const summary = within(mood).getByText("Your day so far").parentElement as HTMLElement
    expect(await within(summary).findByText("Tasks done")).toBeInTheDocument()
    await waitFor(() => expect(within(summary).getAllByRole("definition").map((cell) => cell.textContent)).toEqual(["1", "1/2", "1"]))
    expect(mutations()).toEqual([{ method: "POST", path: "/mood/entries", body: { score: 5, note: null, day: TODAY } }])

    fireEvent.click(change)
    expect(within(mood).getByRole("radio", { name: /Great/ })).toHaveAttribute("aria-checked", "true")
    expect(within(mood).getByRole("button", { name: "Update" })).toBeInTheDocument()
  })

  it("captures tasks and thoughts with the Inbox parsing", async () => {
    const { mutations } = mockDashboard()
    renderWithProviders(<Dashboard />)

    const input = await screen.findByLabelText("Capture text")
    fireEvent.change(input, { target: { value: "Buy milk #home !high" } })
    fireEvent.click(screen.getByRole("button", { name: "Capture" }))
    await waitFor(() => expect(input).toHaveValue(""))

    fireEvent.click(screen.getByRole("tab", { name: "Thought" }))
    fireEvent.change(input, { target: { value: "Idea for the garden #home" } })
    fireEvent.click(screen.getByRole("button", { name: "Capture" }))

    await waitFor(() =>
      expect(mutations()).toEqual([
        { method: "POST", path: "/tasks", body: { title: "Buy milk", status: "inbox", tags: ["home"], priority: "high" } },
        { method: "POST", path: "/thoughts", body: { body: "Idea for the garden #home", tags: ["home"] } },
      ]),
    )
  })
})

describe("Dashboard layout", () => {
  const headings = () => screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)

  it("hides, shows and reorders widgets, keeps the layout after a reload and resets it", async () => {
    mockDashboard()
    const first = renderWithProviders(<Dashboard />)

    fireEvent.click(await screen.findByRole("button", { name: "Customize" }))
    fireEvent.click(await screen.findByRole("checkbox", { name: "Show Mood" }))
    fireEvent.click(screen.getByRole("button", { name: "Move Focus of the day up" }))
    await waitFor(() => expect(headings()).not.toContain("Mood"))
    expect(headings().indexOf("Focus of the day")).toBeLessThan(headings().indexOf("My day"))
    expect(JSON.parse(localStorage.getItem(DASHBOARD_LAYOUT_STORAGE_KEY) ?? "{}")).toMatchObject({
      order: ["focus", "myDay", "habits", "mood", "goals"],
      hidden: ["mood"],
    })

    first.unmount()
    renderWithProviders(<Dashboard />)
    expect(await screen.findByRole("heading", { name: "Focus of the day" })).toBeInTheDocument()
    expect(headings()).not.toContain("Mood")
    expect(headings().indexOf("Focus of the day")).toBeLessThan(headings().indexOf("My day"))

    fireEvent.click(screen.getByRole("button", { name: "Customize" }))
    fireEvent.click(await screen.findByRole("button", { name: "Reset layout" }))
    await waitFor(() => expect(headings()).toContain("Mood"))
    expect(headings().indexOf("My day")).toBeLessThan(headings().indexOf("Focus of the day"))
  })

  it("offers to reset when every widget is hidden", async () => {
    localStorage.setItem(DASHBOARD_LAYOUT_STORAGE_KEY, JSON.stringify({ order: [], hidden: ["myDay", "focus", "habits", "mood", "goals"] }))
    mockDashboard()
    renderWithProviders(<Dashboard />)

    expect(await screen.findByText("All widgets are hidden")).toBeInTheDocument()
    // The GitHub panel is a fixed section, not a widget.
    expect(screen.getByRole("heading", { name: "GitHub contributions" })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole("button", { name: "Reset layout" })[0])
    expect(await screen.findByRole("heading", { name: "My day" })).toBeInTheDocument()
  })

  it("renders the default layout when localStorage is unavailable", async () => {
    // Only the layout's reads and writes fail; the theme and language keep their own storage.
    const getItem = Storage.prototype.getItem
    const setItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
      if (key === DASHBOARD_LAYOUT_STORAGE_KEY) throw new Error("blocked")
      return getItem.call(this, key)
    })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === DASHBOARD_LAYOUT_STORAGE_KEY) throw new Error("blocked")
      setItem.call(this, key, value)
    })
    mockDashboard()
    renderWithProviders(<Dashboard />)

    expect(await screen.findByRole("heading", { name: "My day" })).toBeInTheDocument()
    for (const name of ["Focus of the day", "Habits", "Mood", "Active goals", "GitHub contributions"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument()
    }
    // Five widgets: the last one is alone on its row and takes all of it.
    const cell = (name: string) => screen.getByRole("heading", { name }).closest("div.rounded-2xl")?.parentElement
    expect(cell("Active goals")).toHaveClass("xl:col-span-2")
    expect(cell("Mood")).not.toHaveClass("xl:col-span-2")
    expect(headings().indexOf("GitHub contributions")).toBeLessThan(headings().indexOf("My day"))
    fireEvent.click(screen.getByRole("button", { name: "Customize" }))
    fireEvent.click(await screen.findByRole("checkbox", { name: "Show Habits" }))
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Habits" })).not.toBeInTheDocument())
  })
})

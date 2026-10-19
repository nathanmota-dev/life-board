import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { GOAL_LAYOUT_STORAGE_KEY } from "@/lib/goals"
import { GoalsPage } from "@/routes/goals"
import { goalFixture } from "@/test/goal-fixtures"
import { mockApi, resetApiMock } from "@/test/mock-api"
import { renderWithProviders } from "@/test/render-with-providers"
import type { Goal, Milestone } from "@/types/goal"
import type { Habit } from "@/types/habit"

const now = Date.now()
const day = 24 * 60 * 60 * 1000
const marathon = goalFixture({
  startAt: new Date(now - 30 * day).toISOString(),
  targetAt: new Date(now + 30 * day).toISOString(),
  risk: "at_risk",
  expectedProgress: 50,
  milestoneMarkers: [{ id: "m1", title: "Half marathon", dueAt: new Date(now + 10 * day).toISOString(), completedAt: null }],
})
const promotion = goalFixture({ id: "g2", title: "Get promoted", domain: "career", progress: 80, risk: "overdue", targetAt: new Date(now - day).toISOString(), breakdown: { milestones: null, tasks: null, habits: null } })
const journal = goalFixture({ id: "g3", title: "Keep a journal", domain: "personal", targetAt: null, progressMode: "manual", progress: 35, risk: null, expectedProgress: null })
const water: Habit = { id: "h1", name: "Drink water", unit: "ml", target: 2000, step: 250, emoji: "💧", todayCount: 0, doneToday: false, streak: 0, createdAt: "2026-09-01T00:00:00.000Z" }
const milestone: Milestone = { id: "m1", goalId: "g1", title: "Half marathon", dueAt: null, completedAt: null, order: 0 }

const routes = (goals: Goal[], extra: Record<string, Parameters<typeof mockApi>[0][string]> = {}) =>
  mockApi({
    "GET /goals": () => ({ items: goals }),
    "GET /habits": () => ({ items: [water] }),
    "GET /tasks": () => ({ items: [], nextCursor: null }),
    "POST /links/resolve": () => ({ items: [] }),
    ...extra,
  })

afterEach(() => {
  resetApiMock()
  localStorage.clear()
})

describe("GoalsPage", () => {
  it("shows risk badges, the at-risk count and filters by area", async () => {
    routes([marathon, promotion, journal])
    renderWithProviders(<GoalsPage />)

    expect(await screen.findByText("Run a marathon")).toBeInTheDocument()
    expect(screen.getAllByText("At risk").length).toBeGreaterThan(1)
    expect(screen.getByText("Overdue")).toBeInTheDocument()
    expect(screen.getByText("Behind schedule or overdue").previousSibling).toHaveTextContent("2")

    fireEvent.click(screen.getByRole("button", { name: "Career" }))
    expect(screen.queryByText("Run a marathon")).not.toBeInTheDocument()
    expect(screen.getByText("Get promoted")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "All areas" }))
    fireEvent.click(screen.getByRole("button", { name: "Group by area" }))
    expect(screen.getByRole("region", { name: "Health" })).toHaveTextContent("Run a marathon")
    expect(screen.getByRole("region", { name: "Personal" })).toHaveTextContent("Keep a journal")
  })

  it("shows the timeline with bars, markers and undated goals, and remembers the choice", async () => {
    routes([marathon, promotion, journal])
    const { unmount } = renderWithProviders(<GoalsPage />)

    fireEvent.click(await screen.findByRole("tab", { name: "Timeline" }))
    const timeline = screen.getByRole("region", { name: "Timeline" })
    expect(within(timeline).getByRole("group", { name: "Health" })).toHaveTextContent("Run a marathon")
    expect(within(timeline).getByRole("group", { name: "Career" })).toHaveTextContent("Get promoted")
    expect(within(timeline).getByRole("img", { name: /Half marathon, due/ })).toBeInTheDocument()
    expect(within(timeline).getByText("Today")).toBeInTheDocument()
    expect(within(timeline).queryByText("Keep a journal")).not.toBeInTheDocument()
    expect(within(screen.getByRole("region", { name: "Without a target date" })).getByText("Keep a journal")).toBeInTheDocument()
    expect(localStorage.getItem(GOAL_LAYOUT_STORAGE_KEY)).toBe("timeline")

    unmount()
    renderWithProviders(<GoalsPage />)
    expect(await screen.findByRole("region", { name: "Timeline" })).toBeInTheDocument()
  })

  it("opens a goal from the timeline with its breakdown, history and linked habits", async () => {
    localStorage.setItem(GOAL_LAYOUT_STORAGE_KEY, "timeline")
    const { calls } = routes([marathon], {
      "GET /goals/g1": () => ({ goal: marathon, milestones: [milestone] }),
      "GET /goals/g1/progress": () => ({ items: [{ day: "2026-10-10", progress: 20 }], startingProgress: 10 }),
      "PATCH /goals/g1": ({ body }) => ({ ...marathon, ...(body as object) }),
    })
    renderWithProviders(<GoalsPage />)

    fireEvent.click(await screen.findByRole("button", { name: /Run a marathon/ }))
    expect(await screen.findByText("Milestones 1/5")).toBeInTheDocument()
    expect(screen.getByText("Expected by now: 50%")).toBeInTheDocument()
    await waitFor(() => expect(calls.some((call) => call.path === "/goals/g1/progress" && call.query.get("from") && call.query.get("to"))).toBe(true))

    fireEvent.click(screen.getByRole("button", { name: "Link habits" }))
    fireEvent.click(await screen.findByRole("checkbox", { name: /Drink water/ }))
    await waitFor(() => expect(calls.find((call) => call.method === "PATCH")?.body).toEqual({ linkedHabitIds: ["h1"] }))
  })

  it("switches between auto and manual progress", async () => {
    const { calls } = routes([journal], {
      "GET /goals/g3": () => ({ goal: journal, milestones: [] }),
      "GET /goals/g3/progress": () => ({ items: [], startingProgress: null }),
      "PATCH /goals/g3": ({ body }) => ({ ...journal, ...(body as object) }),
    })
    renderWithProviders(<GoalsPage />)

    fireEvent.click(await screen.findByRole("button", { name: /Keep a journal/ }))
    const input = await screen.findByLabelText(/Progress typed by hand/)
    fireEvent.change(input, { target: { value: "120" } })
    fireEvent.blur(input)
    await waitFor(() => expect(calls.filter((call) => call.method === "PATCH").map((call) => call.body)).toEqual([{ progress: 100 }]))

    fireEvent.click(screen.getByRole("tab", { name: "Auto" }))
    await waitFor(() => expect(calls.filter((call) => call.method === "PATCH").at(-1)?.body).toEqual({ progressMode: "auto" }))
  })

  it("creates a goal with a start date and linked habits", async () => {
    const { calls } = routes([], { "POST /goals": ({ body }) => ({ goal: { ...marathon, ...(body as object) }, milestonesCreated: 0 }) })
    renderWithProviders(<GoalsPage />)

    fireEvent.click(await screen.findByRole("button", { name: "New goal" }))
    fireEvent.change(screen.getByLabelText("Goal"), { target: { value: "Hydrate" } })
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-10-01" } })
    fireEvent.click(screen.getByRole("button", { name: "Link habits" }))
    fireEvent.click(await screen.findByRole("checkbox", { name: /Drink water/ }))
    fireEvent.click(screen.getByRole("button", { name: "Create goal" }))

    await waitFor(() => expect(calls.find((call) => call.method === "POST" && call.path === "/goals")?.body).toMatchObject({
      title: "Hydrate",
      startAt: new Date(2026, 9, 1).toISOString(),
      linkedHabitIds: ["h1"],
    }))
  })
})

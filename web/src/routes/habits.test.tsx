import { fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { HabitsPage } from "@/routes/habits"
import { mockApi, resetApiMock } from "@/test/mock-api"
import { renderWithProviders } from "@/test/render-with-providers"
import { addDays, formatDate, startOfWeek, toDayKey } from "@/lib/dates"
import type { Habit } from "@/types/habit"

const water: Habit = {
  id: "h1",
  name: "Drink water",
  unit: "glasses",
  target: 8,
  step: 1,
  emoji: "💧",
  todayCount: 3,
  doneToday: false,
  streak: 4,
  createdAt: "2026-10-01T00:00:00.000Z",
}

afterEach(() => {
  resetApiMock()
  localStorage.clear()
})

describe("HabitsPage", () => {
  it("shows today's progress and logs a glass", async () => {
    const { calls } = mockApi({
      "GET /habits": () => ({ items: [water] }),
      "GET /habits/logs": () => ({ items: [] }),
      "POST /habits/h1/logs": () => ({ habitId: "h1", day: "2026-10-17", count: 4 }),
    })
    renderWithProviders(<HabitsPage />)

    expect(await screen.findByRole("heading", { name: "Drink water" })).toBeInTheDocument()
    expect(screen.getByText("3 / 8 glasses")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Log Drink water" }))

    await waitFor(() => expect(calls.some((call) => call.method === "POST" && call.path === "/habits/h1/logs")).toBe(true))
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({ delta: 1 })
  })

  it("creates a habit from the dialog", async () => {
    const { calls } = mockApi({
      "GET /habits": () => ({ items: [] }),
      "GET /habits/logs": () => ({ items: [] }),
      "POST /habits": ({ body }) => ({ ...water, ...(body as object), id: "h2" }),
    })
    renderWithProviders(<HabitsPage />)

    fireEvent.click(await screen.findByRole("button", { name: "Add your first habit" }))
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Read" } })
    fireEvent.change(screen.getByLabelText("Daily goal"), { target: { value: "10" } })
    fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "pages" } })
    fireEvent.click(screen.getByRole("button", { name: "Add habit" }))

    await waitFor(() => expect(calls.find((call) => call.method === "POST")?.body).toEqual({ name: "Read", target: 10, unit: "pages", step: 1, emoji: "🌱" }))
  })

  it("shows an error when the API is unreachable", async () => {
    mockApi({ "GET /habits": () => [500, { error: "internal_error", message: "Database is locked" }], "GET /habits/logs": () => ({ items: [] }) })
    renderWithProviders(<HabitsPage />)

    expect(await screen.findByText("Something went wrong.")).toBeInTheDocument()
  })
})

describe("fractional daily goals", () => {
  it("creates a personalized water goal with six check-ins", async () => {
    const { calls } = mockApi({
      "GET /habits": () => ({ items: [] }), "GET /habits/logs": () => ({ items: [] }),
      "POST /habits": ({ body }) => ({ ...water, ...(body as object) }),
    })
    renderWithProviders(<HabitsPage />)
    fireEvent.click(await screen.findByRole("button", { name: "Add your first habit" }))
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Water" } })
    fireEvent.change(screen.getByLabelText("Daily goal"), { target: { value: "3000" } })
    fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "ml" } })
    fireEvent.change(screen.getByLabelText("Amount per check-in"), { target: { value: "500" } })
    fireEvent.click(screen.getByRole("button", { name: "🥤" }))
    expect(screen.getByText("6 check-ins to reach your daily goal")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Add habit" }))
    await waitFor(() => expect(calls.find((call) => call.method === "POST")?.body).toEqual({ name: "Water", target: 3000, unit: "ml", step: 500, emoji: "🥤" }))
  })

  it("refreshes progress on completion and allows undo with the configured amount", async () => {
    let count = 2500
    const { calls } = mockApi({
      "GET /habits": () => ({ items: [{ ...water, target: 3000, step: 500, unit: "ml", todayCount: count, doneToday: count >= 3000 }] }),
      "GET /habits/logs": () => ({ items: [] }),
      "POST /habits/h1/logs": ({ body }) => { count += (body as { delta: number }).delta; return { habitId: "h1", count } },
    })
    renderWithProviders(<HabitsPage />)
    fireEvent.click(await screen.findByRole("button", { name: "Log Drink water" }))
    expect(await screen.findByText("3000 / 3000 ml")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Undo Drink water" }))
    expect(await screen.findByText("2500 / 3000 ml")).toBeInTheDocument()
    expect(calls.filter((call) => call.method === "POST").map((call) => call.body)).toEqual([{ delta: 500 }, { delta: -500 }])
    fireEvent.click(screen.getByRole("tab", { name: /Completed/ }))
    expect(screen.getByText(/No habits in this view/)).toBeInTheDocument()
  })

  it("requests monthly and custom histories and filters by habit", async () => {
    const { calls } = mockApi({
      "GET /habits": () => ({ items: [water] }), "GET /habits/logs": () => ({ items: [] }),
    })
    renderWithProviders(<HabitsPage />)
    fireEvent.click(await screen.findByRole("tab", { name: "30 days" }))
    await waitFor(() => expect(calls.filter((call) => call.path === "/habits/logs").length).toBeGreaterThan(1))
    expect(await screen.findByText(/in these 30 days/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("tab", { name: "Custom" }))
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } })
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-07" } })
    await waitFor(() => expect(calls.some((call) => call.query.get("from") === "2026-10-01" && call.query.get("to") === "2026-10-07")).toBe(true))
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by habit" }), { target: { value: water.id } })
    expect(screen.getByRole("combobox", { name: "Filter by habit" })).toHaveValue(water.id)
  })

  it("shows a failed check-in without changing the displayed progress", async () => {
    mockApi({
      "GET /habits": () => ({ items: [water] }), "GET /habits/logs": () => ({ items: [] }),
      "POST /habits/h1/logs": () => [500, { message: "Unable to save progress" }],
    })
    renderWithProviders(<HabitsPage />)
    fireEvent.click(await screen.findByRole("button", { name: "Log Drink water" }))
    expect(await screen.findByRole("alert")).toHaveTextContent("The request failed. Try again.")
    expect(screen.getByText("3 / 8 glasses")).toBeInTheDocument()
  })
})

it("edits an existing habit with its saved emoji and check-in amount", async () => {
  const { calls } = mockApi({
    "GET /habits": () => ({ items: [{ ...water, target: 3000, step: 500, emoji: "🥤", unit: "ml" }] }),
    "GET /habits/logs": () => ({ items: [] }),
    "PATCH /habits/h1": ({ body }) => ({ ...water, ...(body as object) }),
  })
  renderWithProviders(<HabitsPage />)
  fireEvent.keyDown(await screen.findByRole("button", { name: "Drink water actions" }), { key: "Enter" })
  fireEvent.click(await screen.findByRole("menuitem", { name: "Edit" }))
  expect(screen.getByLabelText("Emoji")).toHaveValue("🥤")
  expect(screen.getByLabelText("Amount per check-in")).toHaveValue(500)
  fireEvent.change(screen.getByLabelText("Daily goal"), { target: { value: "2000" } })
  fireEvent.click(screen.getByRole("button", { name: "Save" }))
  await waitFor(() => expect(calls.find((call) => call.method === "PATCH")?.body).toEqual({ name: water.name, target: 2000, step: 500, emoji: "🥤", unit: "ml" }))
})

describe("editing past days", () => {
  const yesterday = toDayKey(addDays(new Date(), -1))
  const yesterdayLabel = `Edit Drink water on ${formatDate(addDays(new Date(), -1), { weekday: "long", day: "numeric", month: "long" })}`

  it("fixes a forgotten check-in from the card's last 7 days", async () => {
    const { calls } = mockApi({
      "GET /habits": () => ({ items: [water] }),
      "GET /habits/logs": () => ({ items: [{ habitId: "h1", day: yesterday, count: 5, target: 8 }] }),
      [`PUT /habits/h1/logs/${yesterday}`]: ({ body }) => ({ habitId: "h1", day: yesterday, ...(body as object) }),
    })
    renderWithProviders(<HabitsPage />)
    fireEvent.click(await screen.findByRole("button", { name: yesterdayLabel }))

    expect(screen.getByLabelText("Amount (glasses)")).toHaveValue(5)
    fireEvent.click(screen.getByRole("button", { name: "Add 1 glasses" }))
    expect(screen.getByLabelText("Amount (glasses)")).toHaveValue(6)
    expect(screen.getByText("Partial · 6 / 8 glasses")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Mark goal met" }))
    expect(screen.getByText("Completed · 8 / 8 glasses")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    await waitFor(() => expect(calls.find((call) => call.method === "PUT")?.body).toEqual({ count: 8 }))
    await waitFor(() => expect(screen.queryByLabelText("Amount (glasses)")).not.toBeInTheDocument())
  })

  it("rejects invalid amounts and clears a day", async () => {
    const { calls } = mockApi({
      "GET /habits": () => ({ items: [water] }),
      "GET /habits/logs": () => ({ items: [{ habitId: "h1", day: yesterday, count: 5, target: 8 }] }),
      [`PUT /habits/h1/logs/${yesterday}`]: ({ body }) => ({ habitId: "h1", day: yesterday, ...(body as object) }),
    })
    renderWithProviders(<HabitsPage />)
    fireEvent.click(await screen.findByRole("button", { name: yesterdayLabel }))
    fireEvent.change(screen.getByLabelText("Amount (glasses)"), { target: { value: "1.5" } })
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a whole amount")
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Clear day" }))
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(calls.find((call) => call.method === "PUT")?.body).toEqual({ count: 0 }))
  })

  it("browses previous weeks in the weekly tracker and edits a day", async () => {
    const weekStart = startOfWeek()
    const previous = toDayKey(addDays(weekStart, -7))
    const { calls } = mockApi({
      "GET /habits": () => ({ items: [water] }),
      "GET /habits/logs": () => ({ items: [] }),
      [`PUT /habits/h1/logs/${previous}`]: ({ body }) => ({ habitId: "h1", day: previous, ...(body as object) }),
    })
    renderWithProviders(<HabitsPage />)
    expect(await screen.findByRole("heading", { name: "Weekly tracker" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Next week" })).toBeDisabled()

    fireEvent.click(screen.getByRole("button", { name: "Previous week" }))
    await waitFor(() => expect(calls.some((call) => call.query.get("from") === previous)).toBe(true))
    expect(screen.getByRole("button", { name: "Next week" })).toBeEnabled()
    const label = `Edit Drink water on ${formatDate(addDays(weekStart, -7), { weekday: "long", day: "numeric", month: "long" })} · `
    fireEvent.click(await screen.findByRole("button", { name: (name) => name.startsWith(label) }))
    fireEvent.change(screen.getByLabelText("Amount (glasses)"), { target: { value: "3" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(calls.find((call) => call.method === "PUT")?.body).toEqual({ count: 3 }))
  })
})

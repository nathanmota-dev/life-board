import { fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { HabitsPage } from "@/routes/habits"
import { mockApi, resetApiMock } from "@/test/mock-api"
import { renderWithProviders } from "@/test/render-with-providers"
import type { Habit } from "@/types/habit"

const water: Habit = {
  id: "h1",
  name: "Drink water",
  unit: "glasses",
  target: 8,
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

    expect(await screen.findByText("Drink water")).toBeInTheDocument()
    expect(screen.getByText(/3 \/ 8 glasses · 4 day streak/)).toBeInTheDocument()

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

    await waitFor(() => expect(calls.find((call) => call.method === "POST")?.body).toEqual({ name: "Read", target: 10, unit: "pages" }))
  })

  it("shows an error when the API is unreachable", async () => {
    mockApi({ "GET /habits": () => [500, { error: "internal_error", message: "Database is locked" }], "GET /habits/logs": () => ({ items: [] }) })
    renderWithProviders(<HabitsPage />)

    expect(await screen.findByText("Something went wrong.")).toBeInTheDocument()
  })
})

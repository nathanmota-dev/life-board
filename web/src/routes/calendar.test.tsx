import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { CalendarPage } from "@/routes/calendar"
import { mockApi, resetApiMock } from "@/test/mock-api"
import { renderWithProviders } from "@/test/render-with-providers"
import type { CalendarEvent } from "@/types/calendar"

function todayAt(hour: number) {
  const date = new Date()
  date.setHours(hour, 0, 0, 0)
  return date
}

function stored(id: string, title: string, start: Date, end: Date): CalendarEvent {
  return {
    id,
    title,
    description: null,
    startAt: start.toISOString(),
    endAt: end.toISOString(),
    allDay: false,
    location: null,
    color: "#3B82F6",
    source: "local",
    externalUrl: null,
    recurringEventId: null,
    syncState: null,
    createdAt: "",
    updatedAt: "",
  }
}

afterEach(() => {
  resetApiMock()
})

describe("CalendarPage", () => {
  it("shows the week's events and loads the range on screen", async () => {
    const { calls } = mockApi({
      "GET /calendar/events": () => ({ items: [stored("e1", "Dentist", todayAt(10), todayAt(11))], nextCursor: null }),
    })
    renderWithProviders(<CalendarPage />)

    expect(await screen.findByRole("button", { name: /^Dentist,/ })).toBeInTheDocument()
    const list = calls.find((call) => call.method === "GET")!
    const from = new Date(list.query.get("from")!)
    const to = new Date(list.query.get("to")!)
    expect(from.getDay()).toBe(0)
    expect(to.getTime() - from.getTime()).toBe(7 * 24 * 60 * 60 * 1000 - 1)
    expect(screen.getByRole("button", { name: "Week" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Today" })).toBeInTheDocument()
  })

  it("creates an event from New event and saves its title as it is typed", async () => {
    const { calls } = mockApi({
      "GET /calendar/events": () => ({ items: [], nextCursor: null }),
      "POST /calendar/events": ({ body }) => ({ ...stored("server-1", "", todayAt(10), todayAt(11)), ...(body as object) }),
      "PATCH /calendar/events/server-1": ({ body }) => ({ ...stored("server-1", "", todayAt(10), todayAt(11)), ...(body as object) }),
    })
    renderWithProviders(<CalendarPage />)
    await screen.findByRole("button", { name: "Week" })

    fireEvent.click(screen.getByRole("button", { name: "New event" }))
    const details = await screen.findByRole("dialog", { name: "Event details" })
    await waitFor(() => expect(calls.some((call) => call.method === "POST")).toBe(true))
    expect(calls.find((call) => call.method === "POST")!.body).toMatchObject({ title: "New event", color: "#FF892B" })

    const title = within(details).getByRole("textbox", { name: "Title" })
    act(() => {
      fireEvent.change(title, { target: { value: "Gym" } })
    })
    await waitFor(() =>
      expect(calls.find((call) => call.method === "PATCH")?.body).toMatchObject({ title: "Gym" }),
    )
  })

  it("deletes an event from its details and offers to undo it", async () => {
    const { calls } = mockApi({
      "GET /calendar/events": () => ({ items: [stored("e1", "Dentist", todayAt(10), todayAt(11))], nextCursor: null }),
      "DELETE /calendar/events/e1": () => ({ ok: true }),
    })
    renderWithProviders(<CalendarPage />)

    fireEvent.click(await screen.findByRole("button", { name: /^Dentist,/ }))
    const details = await screen.findByRole("dialog", { name: "Event details" })
    fireEvent.pointerDown(within(details).getByRole("button", { name: "More actions" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: /Delete/ }))

    await waitFor(() => expect(calls.some((call) => call.method === "DELETE")).toBe(true))
    expect(await screen.findByText("Event deleted")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument()
  })

  it("shows the load error", async () => {
    mockApi({ "GET /calendar/events": () => [500, { error: "boom", message: "Server down" }] })
    renderWithProviders(<CalendarPage />)
    expect(await screen.findByText("Server down")).toBeInTheDocument()
  })
})

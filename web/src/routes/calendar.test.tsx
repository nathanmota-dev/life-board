import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CalendarPage } from "@/routes/calendar"
import { mockApi, resetApiMock } from "@/test/mock-api"
import { renderWithProviders } from "@/test/render-with-providers"
import type { CalendarEvent } from "@/types/calendar"
import type { GoogleStatus } from "@/types/google"

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

const GOOGLE_URL = "https://www.google.com/calendar/event?eid=g1"

function imported(id: string, title: string, start: Date, end: Date): CalendarEvent {
  return { ...stored(id, title, start, end), source: "google", externalUrl: GOOGLE_URL }
}

const connected: GoogleStatus = {
  connected: true, email: "me@gmail.com", hasCredentials: true, pending: false, reauthRequired: false, lastSyncAt: null, lastSyncError: null,
  pendingChanges: 0, lastConflict: null,
}

afterEach(() => {
  resetApiMock()
  delete window.desktop
})

describe("CalendarPage", () => {
  it("shows the week's events and loads the range on screen", async () => {
    const { calls } = mockApi({
      "GET /calendar/events": () => ({ items: [stored("e1", "Dentist", todayAt(10), todayAt(11))], nextCursor: null }),
    })
    renderWithProviders(<CalendarPage />)

    expect(await screen.findByRole("button", { name: /^Dentist,/ })).toBeInTheDocument()
    const list = calls.find((call) => call.method === "GET" && call.path === "/calendar/events")!
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

  it("lets a Google event be edited, with its source and a link back to Google", async () => {
    const openExternal = vi.fn()
    window.desktop = { getVersion: vi.fn(), getApiBaseUrl: vi.fn(), openExternal }
    const { calls } = mockApi({
      "GET /calendar/events": () => ({
        items: [imported("g1", "Standup", todayAt(10), todayAt(11))],
        nextCursor: null,
      }),
      "PATCH /calendar/events/g1": ({ body }) => ({ ...imported("g1", "Standup", todayAt(10), todayAt(11)), ...(body as object) }),
    })
    renderWithProviders(<CalendarPage />)

    fireEvent.click(await screen.findByRole("button", { name: /^Standup,/ }))
    const details = await screen.findByRole("dialog", { name: "Event details" })
    const title = within(details).getByRole("textbox", { name: "Title" })
    expect(title).not.toHaveAttribute("readonly")
    expect(within(details).getByText("Google Calendar")).toBeInTheDocument()
    fireEvent.click(within(details).getByRole("button", { name: /Open in Google Calendar/ }))
    expect(openExternal).toHaveBeenCalledWith(GOOGLE_URL)
    act(() => {
      fireEvent.change(title, { target: { value: "Daily" } })
    })
    await waitFor(() => expect(calls.find((call) => call.method === "PATCH")?.body).toMatchObject({ title: "Daily" }))
  })

  it("marks an event that Google doesn't have yet, until it is sent", async () => {
    let pending: CalendarEvent["syncState"] = "pending_create"
    mockApi({
      "GET /calendar/events": () => ({
        items: [{ ...stored("l1", "Dentist", todayAt(13), todayAt(14)), syncState: pending }],
        nextCursor: null,
      }),
    })
    const { queryClient } = renderWithProviders(<CalendarPage />)
    expect(await screen.findByTestId("event-sync-mark")).toHaveAttribute("aria-label", "Not synced yet")

    pending = null
    await queryClient.refetchQueries({ queryKey: ["calendar"] })
    await waitFor(() => expect(screen.queryByTestId("event-sync-mark")).not.toBeInTheDocument())
  })

  it("says in the details that an occurrence changes alone and that it isn't synced yet", async () => {
    mockApi({
      "GET /calendar/events": () => ({
        items: [{ ...imported("g1_20261012", "Standup", todayAt(10), todayAt(11)), recurringEventId: "g1", syncState: "pending_update" as const }],
        nextCursor: null,
      }),
    })
    renderWithProviders(<CalendarPage />)

    fireEvent.click(await screen.findByRole("button", { name: /^Standup,/ }))
    const details = await screen.findByRole("dialog", { name: "Event details" })
    expect(within(details).getByTestId("event-not-synced")).toHaveTextContent("Not synced yet")
    expect(within(details).getByTestId("event-occurrence-hint")).toHaveTextContent("Changes apply to this occurrence only.")
  })

  it("announces a conflict once, and not the one that was already there", async () => {
    let status: GoogleStatus = { ...connected, lastConflict: { title: "Old", at: "2026-10-21T10:00:00.000Z" } }
    mockApi({
      "GET /calendar/events": () => ({ items: [], nextCursor: null }),
      "GET /google/status": () => status,
    })
    const { queryClient } = renderWithProviders(<CalendarPage />)
    await screen.findByRole("button", { name: "Week" })
    await waitFor(() => expect(queryClient.getQueryData(["google", "status"])).toBeDefined())
    await queryClient.refetchQueries({ queryKey: ["google"] })
    expect(screen.queryByText(/Google had a newer version/)).not.toBeInTheDocument()

    status = { ...status, lastConflict: { title: "Dentist", at: "2026-10-21T12:00:00.000Z" } }
    await queryClient.refetchQueries({ queryKey: ["google"] })
    expect(await screen.findByText("Google had a newer version of “Dentist”, so it was kept.")).toBeInTheDocument()
  })

  it("keeps local events editable and without a source", async () => {
    mockApi({ "GET /calendar/events": () => ({ items: [stored("l1", "Dentist", todayAt(13), todayAt(14))], nextCursor: null }) })
    renderWithProviders(<CalendarPage />)

    fireEvent.click(await screen.findByRole("button", { name: /^Dentist,/ }))
    const details = await screen.findByRole("dialog", { name: "Event details" })
    expect(within(details).getByRole("textbox", { name: "Title" })).not.toHaveAttribute("readonly")
    expect(within(details).queryByText("Google Calendar")).not.toBeInTheDocument()
    expect(within(details).queryByRole("button", { name: /Open in Google Calendar/ })).not.toBeInTheDocument()
  })

  it("shows an untitled Google event as No title", async () => {
    mockApi({ "GET /calendar/events": () => ({ items: [imported("g1", "", todayAt(10), todayAt(11))], nextCursor: null }) })
    renderWithProviders(<CalendarPage />)
    expect(await screen.findByRole("button", { name: /^No title,/ })).toBeInTheDocument()
  })

  it.each([
    ["Google refused the authorization", { reauthRequired: true, connected: false }, "Google Calendar needs to be reconnected. Imported events may be out of date."],
    ["the last sync failed", { lastSyncError: "Google Calendar could not be reached: down" }, "Google Calendar could not sync. Events may be out of date."],
  ])("warns, with a link to Settings, when %s", async (_name, status, message) => {
    mockApi({
      "GET /calendar/events": () => ({ items: [], nextCursor: null }),
      "GET /google/status": () => ({ ...connected, ...status }),
    })
    renderWithProviders(<CalendarPage />)
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Open Settings" })).toBeInTheDocument()
  })

  it("doesn't warn while the sync is fine", async () => {
    const { calls } = mockApi({
      "GET /calendar/events": () => ({ items: [], nextCursor: null }),
      "GET /google/status": () => ({ ...connected, lastSyncAt: "2026-10-21T12:00:00.000Z" }),
    })
    renderWithProviders(<CalendarPage />)
    await waitFor(() => expect(calls.some((call) => call.path === "/google/status")).toBe(true))
    expect(screen.queryByText(/Google Calendar (needs|could not)/)).not.toBeInTheDocument()
  })

  it("reloads the events when a background sync finishes", async () => {
    let status: GoogleStatus = { ...connected, lastSyncAt: "2026-10-21T12:00:00.000Z" }
    let items: CalendarEvent[] = []
    const { calls } = mockApi({
      "GET /calendar/events": () => ({ items, nextCursor: null }),
      "GET /google/status": () => status,
    })
    const { queryClient } = renderWithProviders(<CalendarPage />)
    await waitFor(() => expect(calls.some((call) => call.path === "/google/status")).toBe(true))
    const loads = () => calls.filter((call) => call.path === "/calendar/events").length
    const before = loads()

    // The same sync time changes nothing
    await queryClient.refetchQueries({ queryKey: ["google"] })
    expect(loads()).toBe(before)

    status = { ...status, lastSyncAt: "2026-10-21T12:15:00.000Z" }
    items = [imported("g1", "Standup", todayAt(10), todayAt(11))]
    await queryClient.refetchQueries({ queryKey: ["google"] })
    expect(await screen.findByRole("button", { name: /^Standup,/ })).toBeInTheDocument()
    expect(loads()).toBeGreaterThan(before)
  })

  it("shows the load error", async () => {
    mockApi({ "GET /calendar/events": () => [500, { error: "boom", message: "Server down" }] })
    renderWithProviders(<CalendarPage />)
    expect(await screen.findByText("Server down")).toBeInTheDocument()
  })
})

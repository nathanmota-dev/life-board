import { fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GooglePanel } from "@/components/settings/google-panel"
import { i18n } from "@/lib/i18n"
import { mockApi, resetApiMock } from "@/test/mock-api"
import { renderWithProviders } from "@/test/render-with-providers"
import type { GoogleStatus } from "@/types/google"

const CLIENT_ID = "1234-abc.apps.googleusercontent.com"
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth?state=synthetic"
const empty: GoogleStatus = {
  connected: false, email: null, hasCredentials: false, pending: false, reauthRequired: false, lastSyncAt: null, lastSyncError: null,
  pendingChanges: 0, lastConflict: null,
}
const openExternal = vi.fn()
let current: GoogleStatus

function mockGoogle(overrides: Record<string, () => unknown> = {}) {
  return mockApi({
    "GET /google/status": () => current,
    "PUT /google/credentials": () => (current = { ...current, hasCredentials: true }),
    "DELETE /google/credentials": () => { current = empty; return { ok: true } },
    "POST /google/connect": () => { current = { ...current, pending: true }; return { authUrl: AUTH_URL } },
    "DELETE /google/connect": () => { current = { ...current, pending: false }; return { ok: true } },
    "DELETE /google/disconnect": () => { current = { ...current, connected: false, reauthRequired: false, email: null }; return { ok: true } },
    ...overrides,
  })
}

beforeEach(async () => {
  await i18n.changeLanguage("en")
  current = empty
  window.desktop = { getVersion: vi.fn(), getApiBaseUrl: vi.fn(), openExternal }
})
afterEach(() => {
  resetApiMock()
  vi.clearAllMocks()
  delete window.desktop
})

describe("GooglePanel", () => {
  it("validates and saves the client credentials without showing the secret again", async () => {
    const { calls } = mockGoogle()
    renderWithProviders(<GooglePanel />)

    const save = await screen.findByRole("button", { name: "Save credentials" })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText("Client ID"), { target: { value: "1234.example.com" } })
    fireEvent.change(screen.getByLabelText("Client secret"), { target: { value: "GOCSPX-secret" } })
    expect(screen.getByText("The client ID ends with .apps.googleusercontent.com.")).toBeInTheDocument()
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText("Client ID"), { target: { value: ` ${CLIENT_ID} ` } })
    expect(save).toBeEnabled()

    fireEvent.click(screen.getByRole("button", { name: "Open Google Cloud console" }))
    expect(openExternal).toHaveBeenCalledWith("https://console.cloud.google.com/apis/credentials")
    fireEvent.click(save)

    expect(await screen.findByRole("button", { name: "Connect Google Calendar" })).toBeInTheDocument()
    expect(calls.find((call) => call.method === "PUT")?.body).toEqual({ clientId: CLIENT_ID, clientSecret: "GOCSPX-secret" })
    expect(screen.queryByDisplayValue("GOCSPX-secret")).not.toBeInTheDocument()
  })

  it("shows why saving failed", async () => {
    mockGoogle({ "PUT /google/credentials": () => [400, { error: "validation_error", message: "bad" }] })
    renderWithProviders(<GooglePanel />)

    fireEvent.change(await screen.findByLabelText("Client ID"), { target: { value: CLIENT_ID } })
    fireEvent.change(screen.getByLabelText("Client secret"), { target: { value: "secret" } })
    fireEvent.click(screen.getByRole("button", { name: "Save credentials" }))
    expect(await screen.findByText("Check the fields and try again.")).toBeInTheDocument()
  })

  it("opens the login in the browser, waits and cancels", async () => {
    current = { ...empty, hasCredentials: true }
    const { calls } = mockGoogle()
    renderWithProviders(<GooglePanel />)

    fireEvent.click(await screen.findByRole("button", { name: "Connect Google Calendar" }))
    expect(await screen.findByText("Finish the login in your browser. This screen updates by itself.")).toBeInTheDocument()
    expect(openExternal).toHaveBeenCalledWith(AUTH_URL)
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))

    expect(await screen.findByRole("button", { name: "Connect Google Calendar" })).toBeInTheDocument()
    expect(calls.filter((call) => call.method === "DELETE").map((call) => call.path)).toEqual(["/google/connect"])
  })

  it("polls while the login is pending and shows the account once Google answers", async () => {
    current = { ...empty, hasCredentials: true, pending: true }
    const { calls } = mockGoogle()
    renderWithProviders(<GooglePanel />)

    expect(await screen.findByRole("status")).toHaveTextContent("Finish the login in your browser.")
    current = { ...current, pending: false, connected: true, email: "someone@gmail.com" }
    expect(await screen.findByText("someone@gmail.com", {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByText("Connected")).toBeInTheDocument()
    expect(screen.getByText("Never")).toBeInTheDocument()
    expect(calls.filter((call) => call.path === "/google/status").length).toBeGreaterThan(1)
  })

  it("shows the changes waiting for Google and the last conflict", async () => {
    current = { ...empty, hasCredentials: true, connected: true, email: "someone@gmail.com", pendingChanges: 2 }
    mockGoogle()
    renderWithProviders(<GooglePanel />)
    expect(await screen.findByText("Waiting to send")).toBeInTheDocument()
    expect(screen.getByText("2 changes")).toBeInTheDocument()
    expect(screen.queryByTestId("google-conflict")).not.toBeInTheDocument()
  })

  it("says when the Google version of an event was kept", async () => {
    current = {
      ...empty, hasCredentials: true, connected: true, email: "someone@gmail.com", pendingChanges: 1,
      lastConflict: { title: "Dentist", at: "2026-10-21T12:00:00.000Z" },
    }
    mockGoogle()
    renderWithProviders(<GooglePanel />)
    expect(await screen.findByText("1 change")).toBeInTheDocument()
    expect(screen.getByTestId("google-conflict")).toHaveTextContent("The Google version of “Dentist” was kept because it changed there too.")
  })

  it("disconnects and keeps the credentials", async () => {
    current = { ...empty, hasCredentials: true, connected: true, email: "someone@gmail.com", lastSyncAt: "2026-10-21T12:00:00.000Z" }
    mockGoogle()
    renderWithProviders(<GooglePanel />)

    expect(await screen.findByText(/2026|21/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }))
    expect(await screen.findByRole("button", { name: "Connect Google Calendar" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Change credentials" }))
    expect(await screen.findByRole("button", { name: "Save credentials" })).toBeInTheDocument()
  })

  it("syncs now, then reloads the calendar and the stats", async () => {
    current = { ...empty, hasCredentials: true, connected: true, email: "someone@gmail.com" }
    const { calls } = mockGoogle({
      "POST /google/sync": () => {
        current = { ...current, lastSyncAt: "2026-10-21T12:00:00.000Z" }
        return { imported: 3, updated: 0, removed: 0 }
      },
    })
    const { queryClient } = renderWithProviders(<GooglePanel />)
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")

    expect(await screen.findByText("Never")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }))
    await waitFor(() => expect(calls.some((call) => call.method === "POST" && call.path === "/google/sync")).toBe(true))
    await waitFor(() => {
      const roots = invalidate.mock.calls.map(([filters]) => (filters?.queryKey as string[])[0])
      expect(roots).toEqual(expect.arrayContaining(["calendar", "stats", "google"]))
    })
    expect(await screen.findByText(/2026|21/)).toBeInTheDocument()
    expect(screen.queryByText(/Last sync failed/)).not.toBeInTheDocument()
  })

  it("shows why the last sync failed, and why Sync now failed", async () => {
    current = { ...empty, hasCredentials: true, connected: true, email: "someone@gmail.com", lastSyncError: "Google Calendar answered 500." }
    mockGoogle({ "POST /google/sync": () => [502, { error: "google_unavailable", message: "down" }] })
    renderWithProviders(<GooglePanel />)

    expect(await screen.findByRole("alert")).toHaveTextContent("Last sync failed: Google Calendar answered 500.")
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }))
    expect(await screen.findByText(/Google is unavailable. Try again later./)).toBeInTheDocument()
  })

  it("offers no Sync now while Reconnect is needed", async () => {
    current = { ...empty, hasCredentials: true, reauthRequired: true, email: "someone@gmail.com" }
    mockGoogle()
    renderWithProviders(<GooglePanel />)
    expect(await screen.findByText("Reconnect needed")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Sync now" })).not.toBeInTheDocument()
  })

  it("offers Reconnect when Google refused the stored authorization", async () => {
    current = { ...empty, hasCredentials: true, reauthRequired: true, email: "someone@gmail.com" }
    const { calls } = mockGoogle({ "POST /google/connect": () => [502, { error: "google_unavailable", message: "down" }] })
    renderWithProviders(<GooglePanel />)

    expect(await screen.findByText("Reconnect needed")).toBeInTheDocument()
    expect(screen.getByText("Google no longer accepts the saved authorization. Reconnect to keep using this account.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Reconnect" }))
    expect(await screen.findByText("Google is unavailable. Try again later.")).toBeInTheDocument()
    expect(calls.some((call) => call.method === "POST" && call.path === "/google/connect")).toBe(true)
    expect(openExternal).not.toHaveBeenCalled()
  })

  it("shows the failures of cancel, disconnect and change credentials", async () => {
    const failing = () => [502, { error: "google_unavailable", message: "down" }]
    current = { ...empty, hasCredentials: true, pending: true }
    mockGoogle({ "DELETE /google/connect": failing, "DELETE /google/credentials": failing, "DELETE /google/disconnect": failing })
    const { unmount } = renderWithProviders(<GooglePanel />)
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.getAllByText("Google is unavailable. Try again later.")).toHaveLength(1))
    fireEvent.click(screen.getByRole("button", { name: "Change credentials" }))
    await waitFor(() => expect(screen.getAllByText("Google is unavailable. Try again later.")).toHaveLength(2))
    unmount()

    current = { ...empty, hasCredentials: true, connected: true, email: "someone@gmail.com" }
    renderWithProviders(<GooglePanel />)
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }))
    expect(await screen.findByText("Google is unavailable. Try again later.")).toBeInTheDocument()
  })
})

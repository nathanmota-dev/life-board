import { fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { LANGUAGE_STORAGE_KEY } from "@/lib/i18n"
import { SettingsPage } from "@/routes/settings"
import { mockApi, resetApiMock } from "@/test/mock-api"
import { renderWithProviders } from "@/test/render-with-providers"

afterEach(() => {
  resetApiMock()
  localStorage.clear()
  document.documentElement.classList.remove("light", "dark")
  document.documentElement.removeAttribute("style")
})

describe("SettingsPage", () => {
  it("shows the General and GitHub views without the empty Profile view or About panel", async () => {
    renderWithProviders(<SettingsPage />)
    expect(await screen.findByRole("tab", { name: "General" })).toHaveAttribute("aria-selected", "true")
    expect(screen.queryByRole("tab", { name: "Profile" })).not.toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "GitHub" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Startup and background" })).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "About Life Board" })).not.toBeInTheDocument()
  })

  it("includes an Updates tab and shows browser availability", async () => {
    renderWithProviders(<SettingsPage />)
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Updates" }))
    expect(await screen.findByRole("button", { name: "Check for updates" })).toBeDisabled()
    expect(screen.getByText(/Development, browser preview/)).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole("tab", { name: "General" }))
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Updates" }))
    expect(await screen.findByRole("heading", { name: "Updates" })).toBeInTheDocument()
  })

  it("switches the theme from the appearance panel", async () => {
    renderWithProviders(<SettingsPage />)
    const dark = await screen.findByRole("button", { name: /dark/i })
    fireEvent.click(dark)
    expect(dark).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: /light/i })).toHaveAttribute("aria-pressed", "false")
    expect(document.documentElement).toHaveClass("dark")
    expect(localStorage.getItem("life-board-theme")).toBe("dark")
  })

  it("switches languages immediately and saves the preference", async () => {
    renderWithProviders(<SettingsPage />)
    expect(await screen.findByRole("tablist", { name: "App language" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "EN" })).toHaveAttribute("aria-selected", "true")

    fireEvent.click(screen.getByRole("tab", { name: "PT" }))

    expect(await screen.findByRole("heading", { name: "Configurações", level: 1 })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Geral" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("heading", { name: "Aparência" })).toBeInTheDocument()
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("pt")
    expect(document.documentElement.lang).toBe("pt-BR")

    fireEvent.click(screen.getByRole("tab", { name: "EN" }))

    expect(await screen.findByRole("heading", { name: "Settings", level: 1 })).toBeInTheDocument()
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en")
    expect(document.documentElement.lang).toBe("en")

    fireEvent.click(screen.getByRole("button", { name: "Switch language" }))
    expect(await screen.findByRole("tab", { name: "PT" })).toHaveAttribute("aria-selected", "true")
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("pt")

    fireEvent.click(screen.getByRole("button", { name: "Trocar idioma" }))
    expect(await screen.findByRole("tab", { name: "EN" })).toHaveAttribute("aria-selected", "true")
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("en")
  })

  it("defaults the accent to orange and applies a new one everywhere", async () => {
    renderWithProviders(<SettingsPage />)
    expect(await screen.findByRole("button", { name: "Use #FF892B" })).toHaveAttribute("aria-pressed", "true")
    expect(document.documentElement.style.getPropertyValue("--brand")).toBe("#FF892B")

    fireEvent.click(screen.getByRole("button", { name: "Use #8B5CF6" }))
    expect(document.documentElement.style.getPropertyValue("--brand")).toBe("#8B5CF6")
    expect(localStorage.getItem("life-board-accent")).toBe("#8B5CF6")

    fireEvent.change(screen.getByLabelText("Accent hex code"), { target: { value: "#10B981" } })
    expect(document.documentElement.style.getPropertyValue("--brand")).toBe("#10B981")

    fireEvent.click(screen.getByRole("button", { name: "Reset" }))
    expect(document.documentElement.style.getPropertyValue("--brand")).toBe("#FF892B")
  })

  it("connects a GitHub token from the GitHub view", async () => {
    let connected = false
    const { calls } = mockApi({
      "GET /github/status": () => ({ connected, login: connected ? "octocat" : null, lastSyncAt: null, lastSyncError: null }),
      "POST /github/connect": () => {
        connected = true
        return { connected: true, login: "octocat" }
      },
    })
    renderWithProviders(<SettingsPage />)

    const tab = await screen.findByRole("tab", { name: "GitHub" })
    fireEvent.mouseDown(tab)
    fireEvent.change(await screen.findByLabelText("Personal access token"), { target: { value: "ghp_0123456789abcdefghij" } })
    fireEvent.click(screen.getByRole("button", { name: "Connect GitHub" }))

    expect(await screen.findByText("@octocat")).toBeInTheDocument()
    expect(calls.find((call) => call.method === "POST")?.body).toEqual({ token: "ghp_0123456789abcdefghij", orgFilter: null })
    await waitFor(() => expect(screen.getByRole("button", { name: "Sync now" })).toBeEnabled())
  })

  it("asks before disconnecting GitHub and deleting the token", async () => {
    let connected = true
    const { calls } = mockApi({
      "GET /github/status": () => ({ connected, login: connected ? "octocat" : null, lastSyncAt: null, lastSyncError: null }),
      "DELETE /github/disconnect": () => {
        connected = false
        return { ok: true }
      },
    })
    renderWithProviders(<SettingsPage />)

    fireEvent.mouseDown(await screen.findByRole("tab", { name: "GitHub" }))
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }))
    expect(await screen.findByRole("dialog", { name: "Disconnect GitHub?" })).toHaveTextContent("@octocat")

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(calls.some((call) => call.method === "DELETE")).toBe(false)

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }))
    fireEvent.click(await screen.findByRole("button", { name: "Disconnect and delete token" }))

    expect(await screen.findByLabelText("Personal access token")).toBeInTheDocument()
    expect(calls.filter((call) => call.method === "DELETE")).toHaveLength(1)
  })
})

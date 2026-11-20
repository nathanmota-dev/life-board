import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { FilesPanel } from "@/components/settings/files-panel"
import { i18n } from "@/lib/i18n"
import { mockApi, resetApiMock } from "@/test/mock-api"
import { renderWithProviders } from "@/test/render-with-providers"
import type { FilesSettings } from "@/types/settings"

const originalDesktop = window.desktop
const defaultUploadsDir = "/home/me/.config/life-board-app/uploads"
const defaultPagesDir = "/home/me/.config/life-board-app/pages"

/** The settings the API returns: pages live next to the uploads. */
function settingsFor(baseDir: string | null): FilesSettings {
  return {
    baseDir,
    uploadsDir: baseDir ? `${baseDir}/life-board-app/uploads` : defaultUploadsDir,
    defaultUploadsDir,
    pagesDir: baseDir ? `${baseDir}/life-board-app/pages` : defaultPagesDir,
    defaultPagesDir,
  }
}
let current: FilesSettings

function mockSettings(update?: (baseDir: string | null) => unknown) {
  return mockApi({
    "GET /settings/files": () => current,
    "PUT /settings/files": ({ body }) => {
      const { baseDir } = body as { baseDir: string | null }
      if (update) return update(baseDir)
      current = settingsFor(baseDir)
      return current
    },
  })
}

beforeEach(() => {
  current = settingsFor(null)
})
afterEach(() => {
  resetApiMock()
  window.desktop = originalDesktop
})

describe("FilesPanel", () => {
  it("shows the default folder and moves uploads to a typed one", async () => {
    const { calls } = mockSettings()
    renderWithProviders(<FilesPanel />)

    await waitFor(() => expect(screen.getByLabelText("Current folder")).toHaveTextContent(defaultUploadsDir))
    expect(screen.getByLabelText("Pages folder")).toHaveTextContent(defaultPagesDir)
    expect(screen.getByText("Default")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Restore default" })).toBeDisabled()
    expect(screen.queryByRole("button", { name: "Choose folder…" })).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("New location"), { target: { value: "/mnt/linux-data/apps" } })
    expect(screen.getByText(/Files will be saved in \/mnt\/linux-data\/apps\/life-board-app\/uploads/)).toHaveTextContent(
      "Pages will be saved in /mnt/linux-data/apps/life-board-app/pages",
    )
    fireEvent.click(screen.getByRole("button", { name: "Save and move files" }))

    await waitFor(() => expect(screen.getByLabelText("Current folder")).toHaveTextContent("/mnt/linux-data/apps/life-board-app/uploads"))
    expect(screen.getByLabelText("Pages folder")).toHaveTextContent("/mnt/linux-data/apps/life-board-app/pages")
    expect(calls.find((call) => call.method === "PUT")?.body).toEqual({ baseDir: "/mnt/linux-data/apps" })
    expect(screen.queryByText("Default")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save and move files" })).toBeDisabled()
  })

  it("restores the default folder", async () => {
    current = settingsFor("/mnt/linux-data/apps")
    const { calls } = mockSettings()
    renderWithProviders(<FilesPanel />)

    await waitFor(() => expect(screen.getByLabelText("New location")).toHaveValue("/mnt/linux-data/apps"))
    fireEvent.click(screen.getByRole("button", { name: "Restore default" }))

    await waitFor(() => expect(screen.getByLabelText("Current folder")).toHaveTextContent(defaultUploadsDir))
    expect(calls.find((call) => call.method === "PUT")?.body).toEqual({ baseDir: null })
    expect(screen.getByLabelText("New location")).toHaveValue("")
  })

  it("fills the field from the native folder picker", async () => {
    const pickDirectory = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce("/mnt/linux-data/apps")
    window.desktop = {
      getVersion: vi.fn(), getApiBaseUrl: vi.fn(), openExternal: vi.fn(),
      app: { getStartupSettings: vi.fn(), updateStartupSettings: vi.fn(), pickDirectory },
    }
    mockSettings()
    renderWithProviders(<FilesPanel />)

    const choose = await screen.findByRole("button", { name: "Choose folder…" })
    await waitFor(() => expect(choose).toBeEnabled())
    fireEvent.click(choose)
    await waitFor(() => expect(pickDirectory).toHaveBeenCalledOnce())
    expect(screen.getByLabelText("New location")).toHaveValue("")

    fireEvent.click(choose)
    await waitFor(() => expect(screen.getByLabelText("New location")).toHaveValue("/mnt/linux-data/apps"))
  })

  it("explains why a folder was refused and keeps the typed value", async () => {
    mockSettings(() => [400, { error: "invalid_dir", message: "nope" }])
    renderWithProviders(<FilesPanel />)

    await waitFor(() => expect(screen.getByLabelText("New location")).toBeEnabled())
    fireEvent.change(screen.getByLabelText("New location"), { target: { value: "/missing" } })
    fireEvent.click(screen.getByRole("button", { name: "Save and move files" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("This folder doesn't exist or Life Board can't write to it.")
    expect(screen.getByLabelText("New location")).toHaveValue("/missing")
    expect(screen.getByLabelText("Current folder")).toHaveTextContent(defaultUploadsDir)
  })

  it("is translated into Portuguese", async () => {
    mockSettings()
    renderWithProviders(<FilesPanel />)
    await waitFor(() => expect(screen.getByLabelText("Current folder")).toHaveTextContent(defaultUploadsDir))
    await act(async () => { await i18n.changeLanguage("pt") })
    expect(screen.getByRole("heading", { name: "Pasta de armazenamento" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Salvar e mover arquivos" })).toBeInTheDocument()
    expect(screen.getByLabelText("Pasta das páginas")).toHaveTextContent(defaultPagesDir)
    await act(async () => { await i18n.changeLanguage("en") })
  })
})

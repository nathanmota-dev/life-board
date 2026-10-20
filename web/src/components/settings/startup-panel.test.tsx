import { act, fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { StartupPanel } from "@/components/settings/startup-panel"
import { i18n } from "@/lib/i18n"
import { renderWithProviders } from "@/test/render-with-providers"
import type { StartupSettings } from "@/types/settings"

const originalDesktop = window.desktop
const getStartupSettings = vi.fn()
const updateStartupSettings = vi.fn()
const defaults: StartupSettings = { startOnLogin: false, keepInBackground: false }

beforeEach(() => {
  vi.resetAllMocks()
  getStartupSettings.mockResolvedValue({ ...defaults })
  updateStartupSettings.mockImplementation(async (patch: Partial<StartupSettings>) => ({ ...defaults, ...patch }))
  window.desktop = {
    getVersion: vi.fn(), getApiBaseUrl: vi.fn(), openExternal: vi.fn(),
    app: { getStartupSettings, updateStartupSettings },
  }
})
afterEach(() => { window.desktop = originalDesktop })

describe("StartupPanel", () => {
  it("loads the OS state and describes the pomodoro exception", async () => {
    getStartupSettings.mockResolvedValue({ startOnLogin: true, keepInBackground: false })
    renderWithProviders(<StartupPanel />)
    expect(await screen.findByRole("switch", { name: "Start Life Board when I log in" })).toBeChecked()
    expect(screen.getByRole("switch", { name: /Keep running/ })).not.toBeChecked()
    expect(screen.getByRole("switch", { name: /Keep running/ })).toHaveAccessibleDescription(/An active pomodoro always keeps the app running in the background, even when this is off/)
  })

  it.each([
    ["Start Life Board when I log in", "startOnLogin"],
    [/Keep running/, "keepInBackground"],
  ])("updates %s through the preload", async (name, key) => {
    renderWithProviders(<StartupPanel />)
    const toggle = await screen.findByRole("switch", { name })
    await waitFor(() => expect(toggle).toBeEnabled())
    expect(toggle).not.toBeChecked()
    fireEvent.click(toggle)
    await waitFor(() => expect(toggle).toBeChecked())
    expect(updateStartupSettings).toHaveBeenCalledExactlyOnceWith({ [String(key)]: true })
    updateStartupSettings.mockResolvedValue({ ...defaults })
    fireEvent.click(toggle)
    await waitFor(() => expect(toggle).not.toBeChecked())
  })

  it("locks both controls until loading and saving finish", async () => {
    let finishLoad!: (settings: StartupSettings) => void
    let finishSave!: (settings: StartupSettings) => void
    getStartupSettings.mockReturnValue(new Promise<StartupSettings>((resolve) => { finishLoad = resolve }))
    updateStartupSettings.mockReturnValue(new Promise<StartupSettings>((resolve) => { finishSave = resolve }))
    renderWithProviders(<StartupPanel />)
    const login = await screen.findByRole("switch", { name: "Start Life Board when I log in" })
    expect(login).toBeDisabled()
    await act(async () => finishLoad(defaults))
    fireEvent.click(login)
    expect(login).toBeDisabled()
    expect(screen.getByRole("switch", { name: /Keep running/ })).toBeDisabled()
    expect(login).not.toBeChecked()
    await act(async () => finishSave({ ...defaults, startOnLogin: true }))
    expect(login).toBeChecked()
    expect(login).toBeEnabled()
  })

  it("keeps the last confirmed state and reports a failed write", async () => {
    updateStartupSettings.mockRejectedValue(new Error("OS denied access"))
    renderWithProviders(<StartupPanel />)
    const login = await screen.findByRole("switch", { name: "Start Life Board when I log in" })
    await waitFor(() => expect(login).toBeEnabled())
    fireEvent.click(login)
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save startup settings")
    expect(login).not.toBeChecked()
    expect(login).toBeEnabled()
  })

  it("shows load errors and refreshes OS state when the window regains focus", async () => {
    getStartupSettings.mockRejectedValueOnce(new Error("unavailable"))
    renderWithProviders(<StartupPanel />)
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load startup settings")
    fireEvent(window, new Event("focus"))
    const login = screen.getByRole("switch", { name: "Start Life Board when I log in" })
    await waitFor(() => expect(login).toBeEnabled())
    getStartupSettings.mockResolvedValue({ ...defaults, startOnLogin: true })
    fireEvent(window, new Event("focus"))
    await waitFor(() => expect(login).toBeChecked())
    getStartupSettings.mockResolvedValue(defaults)
    fireEvent(window, new Event("focus"))
    await waitFor(() => expect(login).not.toBeChecked())
  })

  it("uses the OS response if a login item still needs approval", async () => {
    updateStartupSettings.mockResolvedValue(defaults)
    renderWithProviders(<StartupPanel />)
    const login = await screen.findByRole("switch", { name: "Start Life Board when I log in" })
    await waitFor(() => expect(login).toBeEnabled())
    fireEvent.click(login)
    await waitFor(() => expect(updateStartupSettings).toHaveBeenCalledOnce())
    expect(login).not.toBeChecked()
  })

  it("disables the settings outside Electron", async () => {
    window.desktop = undefined
    renderWithProviders(<StartupPanel />)
    expect(await screen.findByText("These settings are available in the desktop app.")).toBeInTheDocument()
    for (const toggle of screen.getAllByRole("switch")) expect(toggle).toBeDisabled()
  })

  it("translates both controls and the pomodoro helper into Portuguese", async () => {
    renderWithProviders(<StartupPanel />)
    await screen.findByRole("switch", { name: "Start Life Board when I log in" })
    await act(async () => { await i18n.changeLanguage("pt") })
    expect(screen.getByRole("switch", { name: "Iniciar o Life Board quando eu entrar no sistema" })).toBeInTheDocument()
    expect(screen.getByRole("switch", { name: "Continuar em segundo plano ao fechar a janela" }))
      .toHaveAccessibleDescription(/Um pomodoro ativo sempre mantém o app em segundo plano/)
  })
})

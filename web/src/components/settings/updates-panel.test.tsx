import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { UpdatesPanel } from "@/components/settings/updates-panel"
import { i18n } from "@/lib/i18n"
import type { UpdateState } from "@/types/updates"

let state: UpdateState
let send: (next: UpdateState) => void
const unsubscribe = vi.fn()
const check = vi.fn()
const download = vi.fn()
const install = vi.fn()
const getState = vi.fn()
const onState = vi.fn()
const release = { version: "1.1.0", releaseDate: "2026-10-20T00:00:00Z", notes: "Better updates", url: "https://github.com/nathanmota-dev/life-board/releases/tag/v1.1.0" }
beforeEach(() => {
  vi.clearAllMocks()
  void i18n.changeLanguage("en")
  state = { status: "idle", installedVersion: "1.0.0", format: "deb", lastAttempt: null, lastSuccess: null, release: null, progress: null, error: null, retryAction: "check" }
  getState.mockImplementation(async () => state)
  onState.mockImplementation((callback) => { send = callback; return unsubscribe })
  check.mockImplementation(async () => ({ ...state, status: "available", release }))
  download.mockImplementation(async () => ({ ...state, status: "ready", release, progress: 100 }))
  install.mockImplementation(async () => ({ ...state, status: "installing", release }))
  window.desktop = { getVersion: async () => "1.0.0", getApiBaseUrl: async () => "", openExternal: vi.fn(),
    updates: { getState, onState, check, download, install } }
})
afterEach(() => { delete window.desktop })

describe("Updates panel", () => {
  it("shows the installed version, manual discovery, release details and explicit download", async () => {
    render(<UpdatesPanel />)
    expect(await screen.findByText("1.0.0 (DEB)")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }))
    expect(await screen.findByText("1.1.0")).toBeInTheDocument()
    expect(screen.getByText("Better updates")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "View release on GitHub" })).toHaveAttribute("href", release.url)
    expect(download).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Download update" }))
    expect(await screen.findByRole("button", { name: "Install and restart" })).toBeInTheDocument()
    expect(install).not.toHaveBeenCalled()
  })

  it("requires restart confirmation and supports cancellation with keyboard-accessible controls", async () => {
    state = { ...state, status: "ready", release }
    render(<UpdatesPanel />)
    const button = await screen.findByRole("button", { name: "Install and restart" })
    fireEvent.click(button)
    const dialog = await screen.findByRole("dialog", { name: "Install update and restart?" })
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    expect(install).not.toHaveBeenCalled()
    fireEvent.click(button)
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Install and restart" }))
    await waitFor(() => expect(install).toHaveBeenCalledOnce())
  })

  it("shares one subscription, ignores stale initial requests and unsubscribes after the last consumer", async () => {
    let resolve!: (value: UpdateState) => void
    getState.mockReturnValue(new Promise((done) => { resolve = done }))
    const first = render(<UpdatesPanel />)
    const second = render(<UpdatesPanel />)
    expect(onState).toHaveBeenCalledOnce()
    act(() => send({ ...state, status: "downloading", progress: 37, release }))
    await act(async () => resolve(state))
    expect(screen.getAllByRole("progressbar")[0]).toHaveAttribute("value", "37")
    expect(screen.getAllByRole("button", { name: "Check for updates" })[0]).toBeDisabled()
    first.unmount()
    expect(unsubscribe).not.toHaveBeenCalled()
    second.unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it.each(["network", "metadata", "permission", "integrity", "installation", "storage"] as const)("shows recoverable %s errors with the last successful check", async (error) => {
    state = { ...state, status: "error", error, lastSuccess: Date.UTC(2026, 9, 19) }
    render(<UpdatesPanel />)
    expect(await screen.findByRole("alert")).not.toBeEmptyDOMElement()
    expect(screen.getByRole("button", { name: "Check for updates" })).toBeEnabled()
  })

  it("shows unavailable browser mode without a desktop bridge", async () => {
    delete window.desktop
    render(<UpdatesPanel />)
    expect(await screen.findByText(/Development, browser preview/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Check for updates" })).toBeDisabled()
  })

  it("localizes the interface in Portuguese", async () => {
    void i18n.changeLanguage("pt")
    render(<UpdatesPanel />)
    expect(await screen.findByRole("button", { name: "Verificar atualizações" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Atualizações" })).toBeInTheDocument()
  })

  it.each([
    ["en", "nsis", "Windows (NSIS)"], ["pt", "nsis", "Windows (NSIS)"],
    ["en", "mac", "macOS"], ["pt", "mac", "macOS"],
  ] as const)("shows %s %s native updates with explicit consent", async (language, format, label) => {
    await i18n.changeLanguage(language)
    state = { ...state, format, status: "ready", release }
    render(<UpdatesPanel />)
    expect(await screen.findByText(`1.0.0 (${label})`)).toBeInTheDocument()
    expect(install).not.toHaveBeenCalled()
  })
})

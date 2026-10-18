import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MainLayout } from "@/layout/main-layout"
import { createAppRouter } from "@/router"
import { i18n } from "@/lib/i18n"
import { navigationItems } from "@/routes/navigation-items"
import { mockApi } from "@/test/mock-api"

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {})
  vi.stubGlobal("matchMedia", vi.fn(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })))
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  HTMLElement.prototype.scrollIntoView = vi.fn()
  // Pages fetch data as they open; every request just gets an empty 404.
  mockApi({})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (originalScrollIntoView) HTMLElement.prototype.scrollIntoView = originalScrollIntoView
  else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView")
})

async function renderApp(initialPath = "/dashboard") {
  const router = createAppRouter(MainLayout)
  router.update({ history: createMemoryHistory({ initialEntries: [initialPath] }) })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  await screen.findByRole("button", { name: i18n.t("navigation.search") })
  return router
}

describe("Command palette", () => {
  it.each(navigationItems)("renders $titleKey in Portuguese at the existing URL", async (item) => {
    await i18n.changeLanguage("pt")
    const router = await renderApp(item.to)

    expect(await screen.findByRole("heading", { name: i18n.t(item.titleKey), level: 1 })).toBeInTheDocument()
    expect(screen.getByRole("navigation", { name: "Caminho da página" })).toHaveTextContent(i18n.t(item.titleKey))
    expect(router.state.location.pathname).toBe(item.to)
  })

  it("updates the sidebar, breadcrumbs and current page without changing the URL", async () => {
    const router = await renderApp()
    await act(() => i18n.changeLanguage("pt"))

    expect(screen.getByRole("heading", { name: "Painel", level: 1 })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Configurações" })).toBeInTheDocument()
    expect(screen.getByRole("navigation", { name: "Caminho da página" })).toHaveTextContent("Painel")
    expect(router.state.location.pathname).toBe("/dashboard")

    fireEvent.click(screen.getByRole("button", { name: "Buscar na navegação" }))
    const dialog = await screen.findByRole("dialog", { name: "Buscar páginas" })
    fireEvent.change(within(dialog).getByRole("combobox"), { target: { value: "Tarefas" } })
    expect(await within(dialog).findByRole("option", { name: "Tarefas" })).toBeInTheDocument()
  })

  it.each([
    { key: "k", ctrlKey: true },
    { key: "k", metaKey: true },
    { key: "K", metaKey: true },
  ])("opens with $key and a platform modifier", async (shortcut) => {
    await renderApp()
    fireEvent.keyDown(window, shortcut)
    const dialog = await screen.findByRole("dialog", { name: "Search pages" })
    expect(within(dialog).getByRole("combobox")).toHaveFocus()
    expect(within(dialog).getAllByRole("option")).toHaveLength(14)
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("opens from the collapsed sidebar without expanding it and restores focus", async () => {
    await renderApp()
    fireEvent.click(screen.getByRole("button", { name: "Toggle sidebar" }))
    const trigger = screen.getByRole("button", { name: "Search navigation" })
    trigger.focus()
    fireEvent.click(trigger)
    await screen.findByRole("dialog")
    expect(document.querySelector('[data-collapsible="icon"]')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" })
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it.each(navigationItems)("opens the registered $titleKey route from a search result", async (item) => {
    const router = await renderApp()
    fireEvent.click(screen.getByRole("button", { name: "Search navigation" }))
    const input = await screen.findByRole("combobox")
    fireEvent.change(input, { target: { value: i18n.t(item.titleKey) } })
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1))
    fireEvent.keyDown(input, { key: "Enter" })
    await waitFor(() => expect(router.state.location.pathname).toBe(item.to))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.getByRole("navigation", { name: "Page path" })).toHaveTextContent(i18n.t(item.titleKey))
  })

  it("supports arrow navigation and mouse selection", async () => {
    const router = await renderApp()
    fireEvent.click(screen.getByRole("button", { name: "Search navigation" }))
    const input = await screen.findByRole("combobox")
    fireEvent.keyDown(input, { key: "ArrowDown" })
    expect(screen.getByRole("option", { name: "Inbox" })).toHaveAttribute("aria-selected", "true")
    fireEvent.click(screen.getByRole("option", { name: "Settings" }))
    await waitFor(() => expect(router.state.location.pathname).toBe("/settings"))
  })

  it("shows an empty state and resets the search after closing", async () => {
    await renderApp()
    fireEvent.click(screen.getByRole("button", { name: "Search navigation" }))
    const input = await screen.findByRole("combobox")
    fireEvent.change(input, { target: { value: "no-such-page" } })
    expect(await screen.findByText("No pages found.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Close search" }))
    fireEvent.click(screen.getByRole("button", { name: "Search navigation" }))
    expect(await screen.findByRole("combobox")).toHaveValue("")
    expect(screen.getAllByRole("option")).toHaveLength(14)
  })
})

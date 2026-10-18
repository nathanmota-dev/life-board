import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MainLayout } from "@/layout/main-layout"
import { createAppRouter } from "@/router"
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

async function renderApp() {
  const router = createAppRouter(MainLayout)
  router.update({ history: createMemoryHistory({ initialEntries: ["/dashboard"] }) })
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  await screen.findByRole("button", { name: "Buscar na navegação" })
  return router
}

describe("Command palette", () => {
  it.each([
    { key: "k", ctrlKey: true },
    { key: "k", metaKey: true },
    { key: "K", metaKey: true },
  ])("opens with $key and a platform modifier", async (shortcut) => {
    await renderApp()
    fireEvent.keyDown(window, shortcut)
    const dialog = await screen.findByRole("dialog", { name: "Search pages" })
    expect(within(dialog).getByRole("combobox")).toHaveFocus()
    expect(within(dialog).getAllByRole("option")).toHaveLength(13)
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("opens from the collapsed sidebar without expanding it and restores focus", async () => {
    await renderApp()
    fireEvent.click(screen.getByRole("button", { name: "Alternar sidebar" }))
    const trigger = screen.getByRole("button", { name: "Buscar na navegação" })
    trigger.focus()
    fireEvent.click(trigger)
    await screen.findByRole("dialog")
    expect(document.querySelector('[data-collapsible="icon"]')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" })
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it.each(navigationItems)("opens the registered $title route from a search result", async (item) => {
    const router = await renderApp()
    fireEvent.click(screen.getByRole("button", { name: "Buscar na navegação" }))
    const input = await screen.findByRole("combobox")
    fireEvent.change(input, { target: { value: item.title } })
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1))
    fireEvent.keyDown(input, { key: "Enter" })
    await waitFor(() => expect(router.state.location.pathname).toBe(item.to))
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.getByRole("navigation", { name: "Caminho da página" })).toHaveTextContent(item.title)
  })

  it("supports arrow navigation and mouse selection", async () => {
    const router = await renderApp()
    fireEvent.click(screen.getByRole("button", { name: "Buscar na navegação" }))
    const input = await screen.findByRole("combobox")
    fireEvent.keyDown(input, { key: "ArrowDown" })
    expect(screen.getByRole("option", { name: "Inbox" })).toHaveAttribute("aria-selected", "true")
    fireEvent.click(screen.getByRole("option", { name: "Settings" }))
    await waitFor(() => expect(router.state.location.pathname).toBe("/settings"))
  })

  it("shows an empty state and resets the search after closing", async () => {
    await renderApp()
    fireEvent.click(screen.getByRole("button", { name: "Buscar na navegação" }))
    const input = await screen.findByRole("combobox")
    fireEvent.change(input, { target: { value: "no-such-page" } })
    expect(await screen.findByText("No pages found.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Close search" }))
    fireEvent.click(screen.getByRole("button", { name: "Buscar na navegação" }))
    expect(await screen.findByRole("combobox")).toHaveValue("")
    expect(screen.getAllByRole("option")).toHaveLength(13)
  })
})

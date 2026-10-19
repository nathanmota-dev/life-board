import { fireEvent, renderHook, screen, waitFor } from "@testing-library/react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CapturePage } from "@/routes/capture"
import { useCaptureSync } from "@/hooks/use-capture-sync"
import { mockApi, resetApiMock } from "@/test/mock-api"
import { renderWithProviders } from "@/test/render-with-providers"

function stubDesktop() {
  const listeners: (() => void)[] = []
  const capture = {
    getShortcut: vi.fn(async () => "Ctrl+Shift+Space"),
    close: vi.fn(),
    notifySaved: vi.fn(),
    onSaved: vi.fn((callback: () => void) => {
      listeners.push(callback)
      return () => listeners.splice(listeners.indexOf(callback), 1)
    }),
  }
  window.desktop = { getVersion: async () => "1", getApiBaseUrl: async () => "http://api.test", openExternal: async () => {}, capture }
  return { capture, listeners }
}

afterEach(() => {
  resetApiMock()
  delete window.desktop
})

describe("CapturePage", () => {
  it("saves with Enter, tells the main window and closes", async () => {
    const { capture } = stubDesktop()
    const { calls } = mockApi({ "POST /tasks": ({ body }) => ({ id: "t1", ...(body as object) }) })
    renderWithProviders(<CapturePage />)

    const input = await screen.findByLabelText("Capture text")
    expect(input).toHaveFocus()
    fireEvent.change(input, { target: { value: "Buy milk #home" } })
    fireEvent.submit(input.closest("form")!)

    await waitFor(() => expect(capture.close).toHaveBeenCalled())
    expect(capture.notifySaved).toHaveBeenCalledTimes(1)
    expect(calls[0].body).toEqual({ title: "Buy milk", status: "inbox", tags: ["home"] })
  })

  it("closes without saving on Escape", async () => {
    const { capture } = stubDesktop()
    const { calls } = mockApi({})
    renderWithProviders(<CapturePage />)

    const input = await screen.findByLabelText("Capture text")
    fireEvent.change(input, { target: { value: "Never mind" } })
    fireEvent.keyDown(input, { key: "Escape" })

    expect(capture.close).toHaveBeenCalledTimes(1)
    expect(capture.notifySaved).not.toHaveBeenCalled()
    expect(calls).toEqual([])
  })
})

describe("useCaptureSync", () => {
  it("refreshes tasks and thoughts when the capture window saves", () => {
    const { listeners } = stubDesktop()
    const queryClient = new QueryClient()
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    const { unmount } = renderHook(() => useCaptureSync(), {
      wrapper: ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
    })

    listeners.forEach((listener) => listener())
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([["tasks"], ["thoughts"], ["stats"], ["links"]])

    unmount()
    expect(listeners).toEqual([])
  })
})

describe("CaptureShortcutHint", () => {
  it("shows the global shortcut on the inbox when Electron registered it", async () => {
    stubDesktop()
    mockApi({ "GET /tasks": () => ({ items: [] }), "GET /thoughts": () => ({ items: [], nextCursor: null }) })
    const { InboxPage } = await import("@/routes/inbox")
    renderWithProviders(<InboxPage />)

    expect(await screen.findByText("Press Ctrl+Shift+Space to capture from anywhere, even with the window hidden.")).toBeInTheDocument()
  })
})

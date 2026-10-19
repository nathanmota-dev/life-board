import { screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { notify } from "@/lib/notifications"
import { renderWithProviders } from "@/test/render-with-providers"

afterEach(() => {
  delete window.desktop
  vi.unstubAllGlobals()
})

describe("notify", () => {
  it("hands the notification to the desktop app", async () => {
    const show = vi.fn().mockResolvedValue(true)
    window.desktop = { notifications: { show } } as unknown as Window["desktop"]

    await notify({ title: "Focus session complete", body: "Take a break", route: "/pomodoro" })

    expect(show).toHaveBeenCalledWith({ title: "Focus session complete", body: "Take a break", route: "/pomodoro" })
  })

  it("falls back to an in-app toast without native notifications", async () => {
    vi.stubGlobal("Notification", undefined)
    renderWithProviders(<p>page</p>)

    await notify({ title: "Notifications are on", body: "Hello" })

    expect(await screen.findByText("Notifications are on")).toBeInTheDocument()
  })
})

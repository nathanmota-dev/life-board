import { fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { ThemeProvider } from "@/components/theme-provider"
import { SettingsPage } from "@/routes/settings"

function renderSettings() {
  return render(
    <ThemeProvider>
      <SettingsPage />
    </ThemeProvider>,
  )
}

afterEach(() => {
  localStorage.clear()
  document.documentElement.classList.remove("light", "dark")
})

describe("SettingsPage", () => {
  it("shows the General and Profile views", () => {
    renderSettings()
    expect(screen.getByRole("tab", { name: "General" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tab", { name: "Profile" })).toBeInTheDocument()
  })

  it("switches the theme from the appearance panel", () => {
    renderSettings()
    const dark = screen.getByRole("button", { name: /dark/i })
    fireEvent.click(dark)
    expect(dark).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: /light/i })).toHaveAttribute("aria-pressed", "false")
    expect(document.documentElement).toHaveClass("dark")
    expect(localStorage.getItem("life-board-theme")).toBe("dark")
  })
})

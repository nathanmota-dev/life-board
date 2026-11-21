import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { LanguagePanel } from "@/components/settings/language-panel"
import { DATE_FORMAT_STORAGE_KEY, formatDate } from "@/lib/dates"
import { i18n } from "@/lib/i18n"

const date = new Date(2026, 10, 21)
const numeric = { day: "2-digit", month: "2-digit", year: "numeric" } as const

describe("LanguagePanel date format", () => {
  afterEach(() => localStorage.removeItem(DATE_FORMAT_STORAGE_KEY))

  it("defaults to the language order and stores the chosen format app-wide", async () => {
    render(<LanguagePanel />)
    const formats = screen.getByRole("tablist", { name: "Date format" })
    expect(formats.querySelector("[aria-selected=true]")).toHaveTextContent("MM/DD/YYYY")

    await act(async () => { fireEvent.click(screen.getByRole("tab", { name: "DD/MM/YYYY" })) })
    expect(localStorage.getItem(DATE_FORMAT_STORAGE_KEY)).toBe("dmy")
    expect(screen.getByRole("tab", { name: "DD/MM/YYYY" })).toHaveAttribute("aria-selected", "true")
    expect(formatDate(date, numeric)).toBe("21/11/2026")
  })

  it("follows a language change while no format was chosen", async () => {
    render(<LanguagePanel />)
    await act(() => i18n.changeLanguage("pt"))
    expect(screen.getByRole("tab", { name: "DD/MM/AAAA" })).toHaveAttribute("aria-selected", "true")
  })
})

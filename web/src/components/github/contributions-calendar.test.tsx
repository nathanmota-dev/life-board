import { screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { ContributionsCalendar } from "@/components/github/contributions-calendar"
import { mockApi, resetApiMock } from "@/test/mock-api"
import { renderWithProviders } from "@/test/render-with-providers"

afterEach(resetApiMock)

describe("ContributionsCalendar", () => {
  it("draws the contributions returned by the API", async () => {
    mockApi({
      "GET /github/contributions": () => ({
        login: "octocat",
        total: 7,
        days: [
          { date: "2026-10-15", count: 0, level: 0 },
          { date: "2026-10-16", count: 3, level: 2 },
          { date: "2026-10-17", count: 4, level: 4 },
        ],
      }),
    })
    const { container } = renderWithProviders(<ContributionsCalendar enabled />)

    expect(await screen.findByText(/7 contributions in the last year/)).toBeInTheDocument()
    expect(container.querySelectorAll("rect[data-date]")).toHaveLength(3)
  })

  it("explains when GitHub can't be reached", async () => {
    mockApi({ "GET /github/contributions": () => [502, { error: "github_unavailable", message: "GitHub 401 Unauthorized" }] })
    renderWithProviders(<ContributionsCalendar enabled />)

    expect(await screen.findByText("GitHub 401 Unauthorized")).toBeInTheDocument()
  })
})

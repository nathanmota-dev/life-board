import { fireEvent, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { RecentRepos } from "@/components/github/recent-repos"
import { openExternal } from "@/lib/external"
import { mockApi, resetApiMock } from "@/test/mock-api"
import { renderWithProviders } from "@/test/render-with-providers"

vi.mock("@/lib/external", () => ({ openExternal: vi.fn() }))

afterEach(resetApiMock)

describe("RecentRepos", () => {
  it("lists recent repositories and opens them on GitHub", async () => {
    mockApi({
      "GET /github/repos/recent": () => ({
        items: [
          {
            fullName: "me/app",
            url: "https://github.com/me/app",
            description: "My app",
            private: true,
            lastContributedAt: "2026-10-12T00:00:00Z",
            stars: 3,
            language: "TypeScript",
            languageColor: "#3178c6",
          },
        ],
      }),
    })
    renderWithProviders(<RecentRepos enabled />)

    fireEvent.click(await screen.findByText("app"))
    expect(screen.getByText("TypeScript")).toBeInTheDocument()
    expect(screen.getByLabelText("Private")).toBeInTheDocument()
    expect(openExternal).toHaveBeenCalledWith("https://github.com/me/app")
  })

  it("says when there are no recent repositories", async () => {
    mockApi({ "GET /github/repos/recent": () => ({ items: [] }) })
    renderWithProviders(<RecentRepos enabled />)

    expect(await screen.findByText("No recent repositories")).toBeInTheDocument()
  })
})

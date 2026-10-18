import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { GitHubPage } from "@/routes/github"
import { mockApi, resetApiMock } from "@/test/mock-api"
import { renderWithProviders } from "@/test/render-with-providers"

afterEach(() => resetApiMock())

const issue = {
  id: "me/app#7",
  number: 7,
  title: "Login is broken",
  state: "open",
  repoOwner: "me",
  repoName: "app",
  authorLogin: "me",
  authorAvatarUrl: null,
  url: "https://github.com/me/app/issues/7",
  kind: "assigned",
  labels: ["bug"],
  comments: 2,
  updatedAt: "2026-10-16T00:00:00Z",
}

function mockGithub(lastSyncAt: string | null) {
  return mockApi({
    "GET /github/status": () => ({ connected: true, login: "octocat", lastSyncAt, lastSyncError: null }),
    "POST /github/sync": () => ({ ok: true, count: 0, issues: 1, login: "octocat" }),
    "GET /github/prs": () => ({ items: [] }),
    "GET /github/contributions": () => ({ login: "octocat", total: 0, days: [{ date: "2026-10-17", count: 0, level: 0 }] }),
    "GET /github/issues": ({ query }) => ({ items: query.get("kind") === "authored" ? [] : [issue] }),
  })
}

describe("GitHubPage", () => {
  it("syncs on open, shows PRs first and switches to issues", async () => {
    const { calls } = mockGithub(null)
    renderWithProviders(<GitHubPage />)

    expect(await screen.findByText("No pull requests")).toBeInTheDocument()
    await waitFor(() => expect(calls.filter((call) => call.path === "/github/sync")).toHaveLength(1))
    expect(calls.some((call) => call.path === "/github/contributions")).toBe(true)

    fireEvent.click(screen.getByRole("tab", { name: "Issues" }))
    expect(await screen.findByText("Login is broken")).toBeInTheDocument()
    expect(screen.getByText("bug")).toBeInTheDocument()

    fireEvent.click(within(screen.getByRole("tablist", { name: "Issue views" })).getByRole("tab", { name: "Authored" }))
    expect(await screen.findByText("No issues")).toBeInTheDocument()
  })

  it("syncs once per visit and again only from the button", async () => {
    const { calls } = mockGithub(new Date().toISOString())
    renderWithProviders(<GitHubPage />)
    const syncs = () => calls.filter((call) => call.path === "/github/sync")

    await waitFor(() => expect(syncs()).toHaveLength(1))
    await waitFor(() => expect(screen.getByRole("button", { name: "Sync" })).toBeEnabled())
    // The status refetch after the sync doesn't trigger another one.
    expect(syncs()).toHaveLength(1)

    fireEvent.click(screen.getByRole("button", { name: "Sync" }))
    await waitFor(() => expect(syncs()).toHaveLength(2))
  })
})

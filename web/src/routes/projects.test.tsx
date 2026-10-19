import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { ProjectsPage } from "@/routes/projects"
import { mockApi, resetApiMock } from "@/test/mock-api"
import { renderWithProviders } from "@/test/render-with-providers"
import type { Project, ProjectStatus } from "@/types/project"

const project = (id: string, status: ProjectStatus, order = 0, extra: Partial<Project> = {}): Project => ({
  id,
  title: id,
  description: "",
  status,
  order,
  statusChangedAt: new Date().toISOString(),
  pauseReason: null,
  archivedAt: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  ...extra,
})

const budget = project("p1", "in_progress", 0, { title: "Budget app", description: "Track monthly expenses" })

const column = (name: string) => screen.getByRole("region", { name })

afterEach(() => {
  resetApiMock()
  localStorage.clear()
})

describe("ProjectsPage", () => {
  it("shows the five columns with their counts and the card details", async () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
    mockApi({
      "GET /projects": () => ({
        items: [budget, project("Blog", "idea", 0, { statusChangedAt: threeDaysAgo }), project("Garden", "paused", 0, { pauseReason: "Waiting for spring" })],
      }),
    })
    renderWithProviders(<ProjectsPage />)

    expect(await screen.findByText("Budget app")).toBeInTheDocument()
    const labels = screen.getAllByRole("region").map((region) => region.getAttribute("aria-label"))
    expect(labels.filter((label) => !label?.startsWith("Notifications"))).toEqual(["Idea", "Planned", "In progress", "Paused", "Done"])
    expect(within(column("Idea")).getByLabelText("1 project")).toBeInTheDocument()
    expect(within(column("Planned")).getByLabelText("0 projects")).toBeInTheDocument()
    expect(within(column("In progress")).getByText("Track monthly expenses")).toBeInTheDocument()
    expect(within(column("Idea")).getByText("3 days in this status")).toBeInTheDocument()
    expect(within(column("Paused")).getByText("Waiting for spring")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Move Blog" })).toBeInTheDocument()
    expect(screen.queryByText(/#\d/)).not.toBeInTheDocument()
  })

  it("creates an idea from the quick add input", async () => {
    const { calls } = mockApi({
      "GET /projects": () => ({ items: [budget] }),
      "POST /projects": ({ body }) => project("new", "idea", 0, body as Partial<Project>),
    })
    renderWithProviders(<ProjectsPage />)

    const input = await screen.findByRole("textbox", { name: "New idea" })
    fireEvent.change(input, { target: { value: "  Podcast  " } })
    fireEvent.submit(input)

    await waitFor(() => expect(calls.find((call) => call.method === "POST")?.body).toEqual({ title: "Podcast", status: "idea" }))
    await waitFor(() => expect(input).toHaveValue(""))
  })

  it("creates a project from the dialog", async () => {
    const { calls } = mockApi({
      "GET /projects": () => ({ items: [] }),
      "POST /projects": ({ body }) => ({ ...budget, ...(body as object), id: "p3" }),
    })
    renderWithProviders(<ProjectsPage />)

    expect(await screen.findByText("No projects yet")).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole("button", { name: "New project" })[0])
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: " Blog " } })
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Write about side projects" } })
    fireEvent.click(screen.getByRole("button", { name: "Add project" }))

    await waitFor(() =>
      expect(calls.find((call) => call.method === "POST")?.body).toEqual({ title: "Blog", description: "Write about side projects", status: "idea" }),
    )
  })

  it("warns when In progress holds more than the WIP limit", async () => {
    mockApi({ "GET /projects": () => ({ items: ["a", "b", "c"].map((id, order) => project(id, "in_progress", order)) }) })
    renderWithProviders(<ProjectsPage />)

    await screen.findByText("a")
    expect(within(column("In progress")).queryByRole("status")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Work-in-progress limit" }))
    fireEvent.change(await screen.findByRole("spinbutton"), { target: { value: "2" } })

    expect(within(column("In progress")).getByRole("status")).toHaveTextContent("Over the limit of 2 projects in progress")
    expect(localStorage.getItem("life-board-projects-wip-limit")).toBe("2")
  })

  it("shows at most 5 Done projects until Show all is used", async () => {
    mockApi({ "GET /projects": () => ({ items: Array.from({ length: 7 }, (_, order) => project(`done-${order}`, "done", order)) }) })
    renderWithProviders(<ProjectsPage />)

    await screen.findByText("done-0")
    expect(within(column("Done")).getAllByRole("article")).toHaveLength(5)
    fireEvent.click(screen.getByRole("button", { name: "Show all (7)" }))
    expect(within(column("Done")).getAllByRole("article")).toHaveLength(7)
    fireEvent.click(screen.getByRole("button", { name: "Show less" }))
    expect(within(column("Done")).getAllByRole("article")).toHaveLength(5)
  })

  it("opens the detail sheet with the status history and deletes with undo", async () => {
    const { calls } = mockApi({
      "GET /projects": () => ({ items: [budget] }),
      "GET /projects/p1/history": () => ({
        items: [
          { id: "h2", projectId: budget.id, status: "in_progress", pauseReason: null, changedAt: "2026-10-05T10:00:00.000Z" },
          { id: "h1", projectId: budget.id, status: "paused", pauseReason: "Holidays", changedAt: "2026-10-02T10:00:00.000Z" },
        ],
      }),
      "DELETE /projects/p1": () => ({ ok: true }),
      "POST /projects/p1/restore": () => budget,
    })
    renderWithProviders(<ProjectsPage />)

    fireEvent.click(await screen.findByRole("button", { name: "Budget app" }))
    const sheet = await screen.findByRole("dialog")
    expect(within(sheet).getByText("Status history")).toBeInTheDocument()
    expect(await within(sheet).findByText("Holidays")).toBeInTheDocument()

    fireEvent.click(within(sheet).getByRole("button", { name: "Delete" }))
    await waitFor(() => expect(calls.some((call) => call.method === "DELETE")).toBe(true))
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }))
    await waitFor(() => expect(calls.some((call) => call.path === "/projects/p1/restore")).toBe(true))
  })

  it("asks for a pause reason before moving a project to Paused", async () => {
    const { calls } = mockApi({
      "GET /projects": () => ({ items: [budget] }),
      "GET /projects/p1/history": () => ({ items: [] }),
      "PATCH /projects/p1/move": () => ({ items: [{ ...budget, status: "paused", pauseReason: "Too busy" }] }),
    })
    renderWithProviders(<ProjectsPage />)

    fireEvent.click(await screen.findByRole("button", { name: "Budget app" }))
    const sheet = await screen.findByRole("dialog")
    fireEvent.keyDown(within(sheet).getByRole("combobox"), { key: "ArrowDown" })
    fireEvent.click(await screen.findByRole("option", { name: "Paused" }))

    fireEvent.change(await screen.findByLabelText("Pause reason"), { target: { value: " Too busy " } })
    fireEvent.click(screen.getByRole("button", { name: "Pause" }))
    await waitFor(() =>
      expect(calls.find((call) => call.method === "PATCH")?.body).toEqual({ status: "paused", order: 0, pauseReason: "Too busy" }),
    )
  })

  it("lists archived projects and restores them", async () => {
    const archived = project("p9", "done", 0, { title: "Old blog", archivedAt: "2026-10-10T00:00:00.000Z" })
    const { calls } = mockApi({
      "GET /projects": ({ query }) => ({ items: query.get("archived") === "true" ? [archived] : [] }),
      "POST /projects/p9/restore": () => ({ ...archived, archivedAt: null }),
    })
    renderWithProviders(<ProjectsPage />)

    await screen.findByText("No projects yet")
    fireEvent.click(screen.getByRole("tab", { name: "Archived" }))
    fireEvent.click(await screen.findByRole("button", { name: "Restore Old blog" }))
    await waitFor(() => expect(calls.some((call) => call.path === "/projects/p9/restore")).toBe(true))
  })

  it("shows an empty state for the Archived view", async () => {
    mockApi({ "GET /projects": () => ({ items: [] }) })
    renderWithProviders(<ProjectsPage />)

    fireEvent.click(await screen.findByRole("tab", { name: "Archived" }))
    expect(await screen.findByText("No archived projects")).toBeInTheDocument()
  })
})

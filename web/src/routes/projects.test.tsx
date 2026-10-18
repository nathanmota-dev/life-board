import { fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { ProjectsPage } from "@/routes/projects"
import { mockApi, resetApiMock } from "@/test/mock-api"
import { renderWithProviders } from "@/test/render-with-providers"
import type { Project } from "@/types/project"

const budget: Project = {
  id: "p1",
  title: "Budget app",
  description: "Track monthly expenses",
  status: "in_progress",
  order: 0,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
}

afterEach(() => resetApiMock())

describe("ProjectsPage", () => {
  it("shows the projects as ordered cards", async () => {
    mockApi({ "GET /projects": () => ({ items: [budget, { ...budget, id: "p2", title: "Blog", description: "", status: "idea", order: 1 }] }) })
    renderWithProviders(<ProjectsPage />)

    expect(await screen.findByText("Budget app")).toBeInTheDocument()
    expect(screen.getByText("Track monthly expenses")).toBeInTheDocument()
    expect(screen.getByText("In progress")).toBeInTheDocument()
    expect(screen.getByText("No description yet.")).toBeInTheDocument()
    expect(screen.getByText("#2")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Reorder Blog" })).toBeInTheDocument()
  })

  it("creates a project from the dialog", async () => {
    const { calls } = mockApi({
      "GET /projects": () => ({ items: [] }),
      "POST /projects": ({ body }) => ({ ...budget, ...(body as object), id: "p3" }),
    })
    renderWithProviders(<ProjectsPage />)

    expect(await screen.findByText("No projects yet")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "New project" }))
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: " Blog " } })
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Write about side projects" } })
    fireEvent.click(screen.getByRole("button", { name: "Add project" }))

    await waitFor(() =>
      expect(calls.find((call) => call.method === "POST")?.body).toEqual({ title: "Blog", description: "Write about side projects", status: "idea" }),
    )
  })
})

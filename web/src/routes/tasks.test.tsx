import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { TasksPage } from "@/routes/tasks"
import { mockApi, resetApiMock } from "@/test/mock-api"
import { renderWithProviders } from "@/test/render-with-providers"
import type { Task } from "@/types/task"

const base: Task = {
  id: "t1",
  title: "Pay rent",
  description: null,
  status: "today",
  priority: "high",
  dueAt: null,
  completedAt: null,
  parentTaskId: null,
  tags: ["home"],
  linkedThoughtIds: [],
  createdAt: "2026-10-17T10:00:00.000Z",
  updatedAt: "2026-10-17T10:00:00.000Z",
}
const tasks = [base, { ...base, id: "t2", title: "Old invoice", status: "done" as const, priority: "none" as const, tags: [] }]

afterEach(resetApiMock)

describe("TasksPage", () => {
  it("lists tasks with per-status counts and filters by view", async () => {
    mockApi({ "GET /tasks": () => ({ items: tasks }) })
    renderWithProviders(<TasksPage />)

    expect(await screen.findByText("Pay rent")).toBeInTheDocument()
    const views = screen.getByRole("tablist", { name: "Task views" })
    expect(within(views).getByRole("tab", { name: /All\s*2/ })).toHaveAttribute("aria-selected", "true")

    fireEvent.click(within(views).getByRole("tab", { name: /Done\s*1/ }))
    expect(screen.queryByText("Pay rent")).not.toBeInTheDocument()
    expect(screen.getByText("Old invoice")).toBeInTheDocument()
  })

  it("completes a task from its checkbox", async () => {
    const { calls } = mockApi({
      "GET /tasks": () => ({ items: tasks }),
      "PATCH /tasks/t1": ({ body }) => ({ ...base, ...(body as object) }),
    })
    renderWithProviders(<TasksPage />)

    fireEvent.click(await screen.findByRole("checkbox", { name: "Complete Pay rent" }))

    await waitFor(() => expect(calls.find((call) => call.method === "PATCH")?.body).toEqual({ status: "done" }))
  })

  it("creates a task with tags from the dialog", async () => {
    const { calls } = mockApi({
      "GET /tasks": () => ({ items: [] }),
      "POST /tasks": ({ body }) => ({ ...base, ...(body as object), id: "t3" }),
    })
    renderWithProviders(<TasksPage />)

    fireEvent.click(await screen.findByRole("button", { name: "New task" }))
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Call the bank" } })
    fireEvent.change(screen.getByLabelText("Tags"), { target: { value: "Money, calls" } })
    fireEvent.click(screen.getByRole("button", { name: "Create task" }))

    await waitFor(() =>
      expect(calls.find((call) => call.method === "POST")?.body).toEqual({
        title: "Call the bank",
        description: null,
        status: "inbox",
        priority: "none",
        dueAt: null,
        tags: ["money", "calls"],
        linkedThoughtIds: [],
      }),
    )
  })
})

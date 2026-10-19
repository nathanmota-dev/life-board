import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { TasksPage } from "@/routes/tasks"
import { TASK_LAYOUT_STORAGE_KEY } from "@/lib/tasks"
import { mockApi, resetApiMock, type MockRequest } from "@/test/mock-api"
import { renderWithProviders } from "@/test/render-with-providers"
import type { BoardTask, Task } from "@/types/task"

const base: BoardTask = {
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
  pinned: true,
  color: null,
  order: 0,
  archivedAt: null,
  createdAt: "2026-10-17T10:00:00.000Z",
  updatedAt: "2026-10-17T10:00:00.000Z",
  children: [],
}
const item = (id: string, title: string, done = false): Task => ({
  ...base,
  id,
  title,
  parentTaskId: "t2",
  pinned: false,
  priority: "none",
  tags: [],
  status: done ? "done" : "inbox",
})
const tasks: BoardTask[] = [
  base,
  { ...base, id: "t2", title: "Groceries", pinned: false, priority: "none", tags: [], order: 1, children: [item("c1", "Eggs", true), item("c2", "Milk")] },
  { ...base, id: "t3", title: "Old invoice", status: "done", pinned: false, priority: "none", tags: [] },
]

const lastCall = (calls: MockRequest[], method: string, path: string) => calls.filter((call) => call.method === method && call.path === path).at(-1)

afterEach(() => {
  resetApiMock()
  localStorage.clear()
})

describe("TasksPage", () => {
  it("opens in board view with pinned and others, leaving done tasks to the Completed filter", async () => {
    const { calls } = mockApi({ "GET /tasks": () => ({ items: tasks }) })
    renderWithProviders(<TasksPage />)

    const pinned = await screen.findByRole("region", { name: "Pinned" })
    expect(within(pinned).getByText("Pay rent")).toBeInTheDocument()
    expect(within(screen.getByRole("region", { name: "Others" })).getByText("Groceries")).toBeInTheDocument()
    expect(calls[0].query.get("include")).toBe("children")

    // Subtasks only show up as checklist items on their card.
    expect(screen.getByRole("list", { name: "Checklist" })).toHaveTextContent("Milk")
    expect(screen.queryByRole("article", { name: "Milk" })).not.toBeInTheDocument()

    expect(screen.queryByText("Old invoice")).not.toBeInTheDocument()
    fireEvent.click(within(screen.getByRole("group", { name: "Task filters" })).getByRole("button", { name: "Completed" }))
    expect(screen.getByText("Old invoice")).toBeInTheDocument()
    expect(screen.queryByText("Pay rent")).not.toBeInTheDocument()
    expect(screen.queryByRole("textbox", { name: "Take a task…" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Mark as done" })).not.toBeInTheDocument()
  })

  it("marks a task as done straight from the card", async () => {
    const { calls } = mockApi({
      "GET /tasks": () => ({ items: tasks }),
      "PATCH /tasks/t1": ({ body }) => ({ ...base, ...(body as object) }),
    })
    renderWithProviders(<TasksPage />)

    const card = await screen.findByRole("article", { name: "Pay rent" })
    fireEvent.click(within(card).getByRole("button", { name: "Mark as done" }))
    await waitFor(() => expect(lastCall(calls, "PATCH", "/tasks/t1")?.body).toEqual({ status: "done" }))
  })

  it("creates plain and checklist tasks from the composer and drops empty drafts", async () => {
    const { calls } = mockApi({
      "GET /tasks": () => ({ items: [] }),
      "POST /tasks": ({ body }) => ({ ...base, ...(body as object), id: "t9" }),
    })
    renderWithProviders(<TasksPage />)
    const posts = () => calls.filter((call) => call.method === "POST").map((call) => call.body)

    const composer = await screen.findByRole("textbox", { name: "Take a task…" })
    fireEvent.focus(composer)
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Title" }), { key: "Escape" })
    fireEvent.focus(composer)
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), { target: { value: "Call the bank" } })
    fireEvent.change(screen.getByRole("textbox", { name: "Notes" }), { target: { value: "About the card" } })
    fireEvent.pointerDown(document.body)
    await waitFor(() => expect(posts()).toEqual([{ title: "Call the bank", description: "About the card" }]))

    fireEvent.click(screen.getByRole("button", { name: "New checklist" }))
    fireEvent.change(screen.getByRole("textbox", { name: "Title" }), { target: { value: "Groceries" } })
    fireEvent.change(screen.getByRole("textbox", { name: "Checklist item 1" }), { target: { value: "Eggs" } })
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Checklist item 1" }), { key: "Enter" })
    expect(screen.getByRole("textbox", { name: "Checklist item 2" })).toHaveFocus()
    fireEvent.change(screen.getByRole("textbox", { name: "Checklist item 2" }), { target: { value: "Milk" } })
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Checklist item 2" }), { key: "Enter" })
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Checklist item 3" }), { key: "Backspace" })
    expect(screen.queryByRole("textbox", { name: "Checklist item 3" })).not.toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "Checklist item 2" })).toHaveFocus()
    fireEvent.click(screen.getByRole("button", { name: "Close" }))

    await waitFor(() => expect(posts()).toHaveLength(2))
    expect(posts()[1]).toEqual({ title: "Groceries", description: null, items: ["Eggs", "Milk"] })
  })

  it("ticks checklist items on the card and offers completing the task", async () => {
    let items = tasks
    const { calls } = mockApi({
      "GET /tasks": () => ({ items }),
      "PATCH /tasks/c2": ({ body }) => {
        items = items.map((task) => ({ ...task, children: task.children.map((child) => (child.id === "c2" ? { ...child, ...(body as object) } : child)) }))
        return item("c2", "Milk", true)
      },
      "PATCH /tasks/t2": ({ body }) => ({ ...tasks[1], ...(body as object) }),
    })
    renderWithProviders(<TasksPage />)

    expect(screen.queryByRole("button", { name: "Complete task" })).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole("checkbox", { name: "Complete Milk" }))
    await waitFor(() => expect(lastCall(calls, "PATCH", "/tasks/c2")?.body).toEqual({ status: "done" }))

    fireEvent.click(await screen.findByRole("button", { name: "Complete task" }))
    await waitFor(() => expect(lastCall(calls, "PATCH", "/tasks/t2")?.body).toEqual({ status: "done" }))
  })

  it("opens the editor from anywhere on the card except its controls", async () => {
    mockApi({
      "GET /tasks": () => ({ items: tasks }),
      "PATCH /tasks/c2": () => item("c2", "Milk", true),
    })
    renderWithProviders(<TasksPage />)

    const groceries = await screen.findByRole("article", { name: "Groceries" })
    fireEvent.click(within(groceries).getByRole("button", { name: "Move Groceries" }))
    fireEvent.click(within(groceries).getByRole("checkbox", { name: "Complete Milk" }))
    fireEvent.click(within(groceries).getByRole("button", { name: "Color" }))
    expect(screen.queryByRole("dialog", { name: "Edit task" })).not.toBeInTheDocument()

    fireEvent.click(within(groceries).getByText("Eggs"))
    expect(await screen.findByRole("dialog", { name: "Edit task" })).toBeInTheDocument()
  })

  it("keeps the board layout while dragging so the card stays under the pointer", async () => {
    mockApi({ "GET /tasks": () => ({ items: tasks.map((task) => ({ ...task, pinned: false })) }) })
    renderWithProviders(<TasksPage />)

    const grip = await screen.findByRole("button", { name: "Move Groceries" })
    fireEvent.keyDown(grip, { code: "Space" })
    await waitFor(() => expect(grip).toHaveAttribute("aria-pressed", "true"))
    expect(screen.queryByRole("region", { name: "Pinned" })).not.toBeInTheDocument()
    expect(screen.queryByText("Drop a card here")).not.toBeInTheDocument()
  })

  it("pins, archives and deletes from the card, with Undo", async () => {
    const { calls } = mockApi({
      "GET /tasks": () => ({ items: tasks }),
      "PATCH /tasks/t1": ({ body }) => ({ ...base, ...(body as object) }),
      "PATCH /tasks/t2": ({ body }) => ({ ...tasks[1], ...(body as object) }),
      "DELETE /tasks/t2": () => ({ ok: true }),
      "POST /tasks/t2/restore": () => tasks[1],
    })
    renderWithProviders(<TasksPage />)

    const rent = await screen.findByRole("article", { name: "Pay rent" })
    fireEvent.click(within(rent).getByRole("button", { name: "Unpin" }))
    await waitFor(() => expect(lastCall(calls, "PATCH", "/tasks/t1")?.body).toEqual({ pinned: false }))

    const groceries = screen.getByRole("article", { name: "Groceries" })
    fireEvent.click(within(groceries).getByRole("button", { name: "Archive" }))
    await waitFor(() => expect(lastCall(calls, "PATCH", "/tasks/t2")?.body).toEqual({ archivedAt: expect.any(String) }))
    fireEvent.click(await screen.findByRole("button", { name: "Undo" }))
    await waitFor(() => expect(lastCall(calls, "PATCH", "/tasks/t2")?.body).toEqual({ archivedAt: null }))

    fireEvent.keyDown(within(groceries).getByRole("button", { name: "Groceries actions" }), { key: "Enter" })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }))
    await waitFor(() => expect(lastCall(calls, "DELETE", "/tasks/t2")).toBeDefined())
    const deleted = (await screen.findByText("Deleted “Groceries”")).closest("li")!
    fireEvent.click(within(deleted).getByRole("button", { name: "Undo" }))
    await waitFor(() => expect(lastCall(calls, "POST", "/tasks/t2/restore")).toBeDefined())
  })

  it("combines filter chips and shows the archived tasks on request", async () => {
    const overdue = { ...tasks[1], dueAt: "2020-01-01T00:00:00.000Z" }
    const { calls } = mockApi({
      "GET /tasks": ({ query }) => ({ items: query.get("archived") === "true" ? [{ ...base, title: "Old plan", archivedAt: "2026-10-01T00:00:00.000Z" }] : [base, overdue] }),
    })
    renderWithProviders(<TasksPage />)
    const filters = await screen.findByRole("group", { name: "Task filters" })

    await screen.findByText("Pay rent")
    fireEvent.click(within(filters).getByRole("button", { name: "Overdue" }))
    expect(screen.queryByText("Pay rent")).not.toBeInTheDocument()
    expect(screen.getByText("Groceries")).toBeInTheDocument()

    fireEvent.click(within(filters).getByRole("button", { name: "Someday" }))
    expect(screen.getByText("No tasks match these filters")).toBeInTheDocument()

    fireEvent.click(within(filters).getByRole("button", { name: "Archived" }))
    expect(await screen.findByText("Old plan")).toBeInTheDocument()
    expect(calls.at(-1)?.query.get("archived")).toBe("true")
    expect(screen.getByRole("button", { name: "Unarchive" })).toBeInTheDocument()
    expect(screen.queryByRole("textbox", { name: "Take a task…" })).not.toBeInTheDocument()
  })

  it("shows an empty state when there are no tasks", async () => {
    mockApi({ "GET /tasks": () => ({ items: [] }) })
    renderWithProviders(<TasksPage />)

    expect(await screen.findByText("Nothing here")).toBeInTheDocument()
  })

  it("switches to the list view, remembers it and completes from the checkbox", async () => {
    const { calls } = mockApi({
      "GET /tasks": () => ({ items: tasks }),
      "PATCH /tasks/t1": ({ body }) => ({ ...base, ...(body as object) }),
    })
    const { unmount } = renderWithProviders(<TasksPage />)

    fireEvent.click(await screen.findByRole("tab", { name: "List" }))
    expect(localStorage.getItem(TASK_LAYOUT_STORAGE_KEY)).toBe("list")
    unmount()

    renderWithProviders(<TasksPage />)
    expect(await screen.findByRole("table")).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "List" })).toHaveAttribute("aria-selected", "true")
    expect(screen.queryByText("Milk")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("checkbox", { name: "Complete Pay rent" }))
    await waitFor(() => expect(lastCall(calls, "PATCH", "/tasks/t1")?.body).toEqual({ status: "done" }))
  })

  it("creates a task with tags from the dialog", async () => {
    const { calls } = mockApi({
      "GET /tasks": () => ({ items: [] }),
      "POST /tasks": ({ body }) => ({ ...base, ...(body as object), id: "t3" }),
    })
    renderWithProviders(<TasksPage />)

    fireEvent.click(await screen.findByRole("button", { name: "New task" }))
    fireEvent.change(screen.getByLabelText("Title", { selector: "#task-title" }), { target: { value: "Call the bank" } })
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

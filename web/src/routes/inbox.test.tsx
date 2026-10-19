import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { InboxPage } from "@/routes/inbox"
import { fromDateInput } from "@/lib/dates"
import { mockApi, resetApiMock, type MockRequest } from "@/test/mock-api"
import { renderWithProviders } from "@/test/render-with-providers"
import type { Task, TaskInput } from "@/types/task"

const base: Task = {
  id: "t1",
  title: "Pay rent",
  description: null,
  status: "inbox",
  priority: "none",
  dueAt: null,
  completedAt: null,
  parentTaskId: null,
  tags: ["home"],
  linkedThoughtIds: [],
  pinned: false,
  color: null,
  order: 0,
  archivedAt: null,
  createdAt: "2026-10-17T10:00:00.000Z",
  updatedAt: "2026-10-17T10:00:00.000Z",
}

/** An API with a real inbox: decisions move tasks out of it and the list follows. */
function mockInbox(titles: string[]) {
  let tasks: Task[] = titles.map((title, index) => ({ ...base, id: `t${index + 1}`, title }))
  let next = titles.length + 1
  const byId: Record<string, (request: MockRequest) => unknown> = {}
  for (let index = 1; index <= 9; index++) {
    const id = `t${index}`
    byId[`PATCH /tasks/${id}`] = ({ body }) => {
      tasks = tasks.map((task) => (task.id === id ? { ...task, ...(body as Partial<Task>) } : task))
      return tasks.find((task) => task.id === id)
    }
    byId[`DELETE /tasks/${id}`] = () => {
      tasks = tasks.filter((task) => task.id !== id)
      return { ok: true }
    }
  }
  const api = mockApi({
    ...byId,
    "GET /tasks": ({ query }) => ({ items: tasks.filter((task) => task.status === (query.get("status") ?? task.status)) }),
    "GET /thoughts": () => ({ items: [], nextCursor: null }),
    "POST /tasks": ({ body }) => {
      const task = { ...base, ...(body as TaskInput), id: `t${next++}` } as Task
      tasks = [task, ...tasks]
      return task
    },
    "POST /thoughts": ({ body }) => ({ id: "th1", ...(body as object) }),
    "DELETE /thoughts/th1": () => ({ ok: true }),
  })
  return { ...api, mutations: () => api.calls.filter((call) => call.method !== "GET").map(({ method, path, body }) => ({ method, path, body })) }
}

const press = (key: string, target: Element | Window = window) => fireEvent.keyDown(target, { key })

async function startTriage() {
  renderWithProviders(<InboxPage />)
  await screen.findByText("Pay rent")
  fireEvent.click(screen.getByRole("button", { name: "Triage" }))
  return screen.findByRole("heading", { name: "Pay rent" })
}

afterEach(resetApiMock)

describe("InboxPage triage", () => {
  it("disables triage when the inbox is empty", async () => {
    mockInbox([])
    renderWithProviders(<InboxPage />)

    expect(await screen.findByText("Everything you capture lands here until you plan it.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Triage" })).toBeDisabled()
  })

  it("shows one task at a time with progress and resolves it with number keys", async () => {
    const api = mockInbox(["Pay rent", "Book dentist", "Read book"])
    await startTriage()
    expect(screen.getByText("1 of 3")).toBeInTheDocument()

    press("1")
    expect(await screen.findByRole("heading", { name: "Book dentist" })).toBeInTheDocument()
    expect(screen.getByText("2 of 3")).toBeInTheDocument()

    press("3")
    expect(await screen.findByRole("heading", { name: "Read book" })).toBeInTheDocument()
    expect(api.mutations()).toEqual([
      { method: "PATCH", path: "/tasks/t1", body: { status: "today" } },
      { method: "PATCH", path: "/tasks/t2", body: { status: "someday" } },
    ])
  })

  it("asks for a date for upcoming and ignores keys while typing in it", async () => {
    const api = mockInbox(["Pay rent", "Book dentist"])
    await startTriage()

    press("2")
    const date = await screen.findByLabelText("Due date")
    press("1", date)
    press("3", date)
    fireEvent.change(date, { target: { value: "2026-11-02" } })
    fireEvent.submit(date.closest("form")!)

    expect(await screen.findByRole("heading", { name: "Book dentist" })).toBeInTheDocument()
    expect(api.mutations()).toEqual([
      { method: "PATCH", path: "/tasks/t1", body: { status: "upcoming", dueAt: fromDateInput("2026-11-02") } },
    ])
  })

  it("closes the date picker with Escape without leaving triage", async () => {
    const api = mockInbox(["Pay rent"])
    await startTriage()

    press("2")
    press("Escape", await screen.findByLabelText("Due date"))

    expect(screen.queryByLabelText("Due date")).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Pay rent" })).toBeInTheDocument()
    expect(api.mutations()).toEqual([])
  })

  it("turns a task into a thought, creating it before deleting the task, and undoes it", async () => {
    const api = mockInbox(["Pay rent", "Book dentist"])
    await startTriage()

    press("4")
    expect(await screen.findByRole("heading", { name: "Book dentist" })).toBeInTheDocument()
    press("z")

    expect(await screen.findByRole("heading", { name: "Pay rent" })).toBeInTheDocument()
    await waitFor(() => expect(api.mutations()).toHaveLength(4))
    expect(api.mutations()).toEqual([
      { method: "POST", path: "/thoughts", body: { body: "Pay rent", tags: ["home"] } },
      { method: "DELETE", path: "/tasks/t1", body: undefined },
      {
        method: "POST",
        path: "/tasks",
        body: { title: "Pay rent", description: null, status: "inbox", priority: "none", dueAt: null, tags: ["home"], linkedThoughtIds: [] },
      },
      { method: "DELETE", path: "/thoughts/th1", body: undefined },
    ])
    expect(screen.getByText("1 of 2")).toBeInTheDocument()
  })

  it("deletes with the Delete key and brings the task back with undo", async () => {
    const api = mockInbox(["Pay rent", "Book dentist"])
    await startTriage()

    press("Delete")
    expect(await screen.findByRole("heading", { name: "Book dentist" })).toBeInTheDocument()
    press("Z")

    expect(await screen.findByRole("heading", { name: "Pay rent" })).toBeInTheDocument()
    expect(api.mutations().map(({ method, path }) => `${method} ${path}`)).toEqual(["DELETE /tasks/t1", "POST /tasks"])
  })

  it("undoes a status decision by moving the task back to the inbox", async () => {
    const api = mockInbox(["Pay rent", "Book dentist"])
    await startTriage()

    press("1")
    await screen.findByRole("heading", { name: "Book dentist" })
    fireEvent.click(screen.getByRole("button", { name: "Undo" }))

    expect(await screen.findByRole("heading", { name: "Pay rent" })).toBeInTheDocument()
    expect(api.mutations().at(-1)).toEqual({ method: "PATCH", path: "/tasks/t1", body: { status: "inbox", dueAt: null } })
  })

  it("skips with the arrow key or S and leaves with Escape", async () => {
    const api = mockInbox(["Pay rent", "Book dentist"])
    await startTriage()

    press("ArrowRight")
    expect(await screen.findByRole("heading", { name: "Book dentist" })).toBeInTheDocument()
    press("s")
    expect(await screen.findByRole("heading", { name: "Pay rent" })).toBeInTheDocument()
    press("Escape")

    expect(await screen.findByText("To triage")).toBeInTheDocument()
    expect(api.mutations()).toEqual([])
  })

  it("opens the edit dialog with E and ignores triage keys while typing in it", async () => {
    const api = mockInbox(["Pay rent"])
    await startTriage()

    press("e")
    const title = await screen.findByLabelText("Title")
    press("1", title)
    press("Delete", title)
    fireEvent.change(title, { target: { value: "Pay rent and water" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))

    expect(await screen.findByRole("heading", { name: "Pay rent and water" })).toBeInTheDocument()
    expect(api.mutations()).toHaveLength(1)
    expect(api.mutations()[0]).toMatchObject({ method: "PATCH", path: "/tasks/t1", body: { title: "Pay rent and water", status: "inbox" } })
  })

  it("does the same from the on-screen buttons and ends at inbox zero", async () => {
    const api = mockInbox(["Pay rent", "Book dentist"])
    await startTriage()
    const actions = screen.getByRole("group", { name: "Triage actions" })

    fireEvent.click(within(actions).getByRole("button", { name: "Today" }))
    await screen.findByRole("heading", { name: "Book dentist" })
    fireEvent.click(within(actions).getByRole("button", { name: "Delete" }))

    expect(await screen.findByText("You triaged 2 items in this session.")).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Inbox zero" })).toBeInTheDocument()
    expect(api.mutations().map(({ method, path }) => `${method} ${path}`)).toEqual(["PATCH /tasks/t1", "DELETE /tasks/t2"])

    press("z")
    expect(await screen.findByRole("heading", { name: "Book dentist" })).toBeInTheDocument()
    expect(screen.getByText("2 of 2")).toBeInTheDocument()
  })

  it("keeps the task and shows the error when a decision fails", async () => {
    const api = mockInbox(["Pay rent"])
    const handlers = api.fetchMock.getMockImplementation()!
    api.fetchMock.mockImplementation(async (input, init) =>
      init?.method === "PATCH" ? Response.json({ error: "internal_error", message: "boom" }, { status: 500 }) : handlers(input, init),
    )
    await startTriage()

    press("1")

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong.")
    expect(screen.getByRole("heading", { name: "Pay rent" })).toBeInTheDocument()
  })
})

describe("InboxPage quick capture", () => {
  it("shows recognized chips and saves the parsed task", async () => {
    const api = mockInbox([])
    renderWithProviders(<InboxPage />)
    const input = await screen.findByLabelText("Capture text")

    fireEvent.change(input, { target: { value: "pagar luz amanhã #casa !alta" } })
    const chips = screen.getByRole("list", { name: "Recognized in the capture" })
    expect(within(chips).getByText("casa")).toBeInTheDocument()
    expect(within(chips).getByText("High priority")).toBeInTheDocument()
    expect(within(chips).getByText(/^Due /)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Capture" }))

    await waitFor(() => expect(api.mutations()).toHaveLength(1))
    const body = api.mutations()[0].body as TaskInput
    expect(body).toMatchObject({ title: "pagar luz", status: "inbox", tags: ["casa"], priority: "high" })
    expect(new Date(body.dueAt!).getDate()).toBe(new Date(Date.now() + 24 * 60 * 60 * 1000).getDate())
    await waitFor(() => expect(input).toHaveValue(""))
  })

  it("keeps a removed chip's token in the title", async () => {
    const api = mockInbox([])
    renderWithProviders(<InboxPage />)
    const input = await screen.findByLabelText("Capture text")

    fireEvent.change(input, { target: { value: "Watch today show #tv" } })
    fireEvent.click(screen.getByRole("button", { name: "Keep “today” as text" }))
    expect(screen.queryByText(/^Due /)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Capture" }))

    await waitFor(() => expect(api.mutations()[0]?.body).toEqual({ title: "Watch today show", status: "inbox", tags: ["tv"] }))
  })

  it("saves plain text unchanged and keeps the raw text for thoughts", async () => {
    const api = mockInbox([])
    renderWithProviders(<InboxPage />)
    const input = await screen.findByLabelText("Capture text")

    fireEvent.change(input, { target: { value: "Call the bank" } })
    fireEvent.click(screen.getByRole("button", { name: "Capture" }))
    await waitFor(() => expect(api.mutations()[0]?.body).toEqual({ title: "Call the bank", status: "inbox" }))

    fireEvent.click(screen.getByRole("tab", { name: "Thought" }))
    fireEvent.change(input, { target: { value: "ideia amanhã !alta #produto" } })
    expect(screen.queryByText("High priority")).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Capture" }))
    await waitFor(() => expect(api.mutations()[1]?.body).toEqual({ body: "ideia amanhã !alta #produto", tags: ["produto"] }))
  })
})

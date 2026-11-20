import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import type { TiptapEditorHTMLElement } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { PageRoute } from "@/routes/pages"
import { mockApi, resetApiMock, type MockRequest } from "@/test/mock-api"
import { pageFixture } from "@/test/page-fixtures"
import { renderWithProviders } from "@/test/render-with-providers"

const groceries = pageFixture({ title: "Groceries" })
const GROCERIES = "# Groceries\n\n- milk\n"
const TABLE = "| item | qty |\n|---|---|\n| milk | 1 |\n"
const AFTER_AUTOSAVE = { timeout: 4000 }

function routes(content: string) {
  return mockApi({
    "GET /pages": () => ({ items: [groceries] }),
    "GET /pages/p1/content": () => ({ content, updatedAt: groceries.updatedAt }),
    "PUT /pages/p1/content": ({ body }: MockRequest) => ({ ...groceries, sizeBytes: (body as { content: string }).content.length }),
  })
}

const puts = (calls: MockRequest[]) => calls.filter((call) => call.method === "PUT").map((call) => call.body)

function openPage() {
  const view = renderWithProviders(<PageRoute />, { route: "/pages/$pageId", url: "/pages/p1" })
  return { ...view, ready: screen.findByRole("button", { name: "Edit" }) }
}

/** Opens the page and switches to its editor. */
async function openEditor() {
  const view = openPage()
  fireEvent.click(await view.ready)
  return { ...view, editor: await screen.findByRole("textbox", { name: "Contents of Groceries" }) }
}

/** jsdom can't type into a contenteditable, so edits go through the editor the element carries. */
function richEditor(element: HTMLElement) {
  const { editor } = element as TiptapEditorHTMLElement
  if (!editor) throw new Error("The element isn't a Tiptap editor")
  return editor
}

// Radix tabs switch on mouse down.
const chooseTab = (name: string) => fireEvent.mouseDown(screen.getByRole("tab", { name }))

afterEach(resetApiMock)

describe("a page in read mode", () => {
  it("opens rendered, with no editor and nothing to save", async () => {
    routes(GROCERIES + "\n" + TABLE)
    await openPage().ready

    expect(screen.getByRole("heading", { name: "Groceries", level: 1 })).toBeInTheDocument()
    expect(screen.getByRole("table")).toBeInTheDocument()
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(screen.queryByRole("tab")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Groceries", level: 2 })).toBeInTheDocument()
  })

  it("shows where the page is in the tree", async () => {
    mockApi({
      "GET /pages": () => ({
        items: [
          pageFixture({ id: "d1", kind: "folder", title: "VBL" }),
          pageFixture({ id: "d2", kind: "folder", title: "AKYOU", parentId: "d1" }),
          pageFixture({ id: "p1", title: "MindShef - Task", parentId: "d2" }),
        ],
      }),
      "GET /pages/p1/content": () => ({ content: "Hi", updatedAt: groceries.updatedAt }),
    })
    await openPage().ready

    expect(screen.getByRole("navigation", { name: "Page location" })).toHaveTextContent("VBL/AKYOU/MindShef - Task")
  })

  it("says when the page no longer exists, with a way back", async () => {
    mockApi({ "GET /pages": () => ({ items: [] }) })
    renderWithProviders(<PageRoute />, { route: "/pages/$pageId", url: "/pages/gone" })

    expect(await screen.findByText("This page no longer exists")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Back to Pages" })).toHaveAttribute("href", "/pages")
  })

  it("explains why a page couldn't be loaded", async () => {
    mockApi({ "GET /pages": () => [500, { error: "internal", message: "Disk unavailable" }] })
    renderWithProviders(<PageRoute />, { route: "/pages/$pageId", url: "/pages/p1" })

    expect(await screen.findByText("Disk unavailable")).toBeInTheDocument()
  })
})

describe("a page in edit mode", () => {
  it("switches to the formatted editor with Edit, and back to reading with Done", async () => {
    routes(GROCERIES)
    const { editor } = await openEditor()

    expect(editor).toHaveAttribute("contenteditable", "true")
    expect(within(editor).getByRole("heading", { name: "Groceries", level: 1 })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Formatted" })).toHaveAttribute("aria-selected", "true")
    expect(screen.queryByRole("status")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Done" }))

    expect(screen.queryByRole("textbox", { name: "Contents of Groceries" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument()
  })

  it("toggles with Ctrl+E and leaves with Esc when nothing is selected", async () => {
    routes(GROCERIES)
    await openPage().ready

    fireEvent.keyDown(window, { key: "e", ctrlKey: true })
    expect(await screen.findByRole("textbox", { name: "Contents of Groceries" })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: "Escape" })
    expect(screen.queryByRole("textbox", { name: "Contents of Groceries" })).not.toBeInTheDocument()

    fireEvent.keyDown(window, { key: "e", metaKey: true })
    expect(await screen.findByRole("textbox", { name: "Contents of Groceries" })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: "e", ctrlKey: true })
    expect(screen.queryByRole("textbox", { name: "Contents of Groceries" })).not.toBeInTheDocument()
  })

  it("opens a page the editor would rewrite as source, with the notice, until the person chooses otherwise", async () => {
    const { calls } = routes(TABLE)
    const { editor } = await openEditor()

    expect((editor as HTMLTextAreaElement).value).toBe(TABLE)
    expect(screen.getByRole("tab", { name: "Markdown" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("status")).toHaveTextContent("formatting the visual editor would change")

    fireEvent.click(screen.getByRole("button", { name: "Edit formatted anyway" }))

    expect(screen.getByRole("textbox", { name: "Contents of Groceries" })).toHaveAttribute("contenteditable", "true")
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(puts(calls)).toEqual([])
  })

  it("saves formatted edits as markdown after a pause, keeping the final newline", async () => {
    const { calls } = routes(GROCERIES)
    const { editor } = await openEditor()
    act(() => {
      richEditor(editor).commands.insertContentAt(richEditor(editor).state.doc.content.size, "<h2>Later</h2>")
    })

    await waitFor(() => expect(puts(calls)).toEqual([{ content: "# Groceries\n\n- milk\n\n## Later\n" }]), AFTER_AUTOSAVE)
  })

  it("shows Save while there are changes, and nothing after an edit is undone", async () => {
    const { calls } = routes(GROCERIES)
    const { editor } = await openEditor()
    act(() => {
      richEditor(editor).commands.insertContentAt(1, "Weekly ")
    })
    expect(await screen.findByRole("button", { name: "Save" })).toBeInTheDocument()

    act(() => {
      richEditor(editor).commands.undo()
    })

    await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument())
    expect(puts(calls)).toEqual([])
  })

  it("saves with Ctrl+S from the source editor and from the formatted one", async () => {
    const { calls } = routes(GROCERIES)
    const { editor } = await openEditor()
    fireEvent.keyDown(editor, { key: "s", ctrlKey: true })
    expect(await screen.findByText("Already saved")).toBeInTheDocument()

    chooseTab("Markdown")
    const source = screen.getByRole("textbox", { name: "Contents of Groceries" })
    fireEvent.change(source, { target: { value: "# Shopping\n\n- milk\n" } })
    fireEvent.keyDown(source, { key: "s", ctrlKey: true })

    expect(await screen.findByText("Page saved")).toBeInTheDocument()
    expect(puts(calls)).toEqual([{ content: "# Shopping\n\n- milk\n" }])
    chooseTab("Formatted")
    expect(within(screen.getByRole("textbox", { name: "Contents of Groceries" })).getByRole("heading", { name: "Shopping" })).toBeInTheDocument()
  })

  it("keeps what was typed in the reader after Done, before and after it is saved", async () => {
    routes(GROCERIES)
    const { editor } = await openEditor()
    chooseTab("Markdown")
    fireEvent.change(screen.getByRole("textbox", { name: "Contents of Groceries" }), { target: { value: "# Shopping\n" } })

    fireEvent.click(screen.getByRole("button", { name: "Done" }))

    expect(screen.getByRole("heading", { name: "Shopping", level: 1 })).toBeInTheDocument()
    expect(editor).not.toBeInTheDocument()
  })

  it("saves what is unsaved when the person leaves the page", async () => {
    const { calls } = routes(GROCERIES)
    const { router } = await openEditor()
    chooseTab("Markdown")
    fireEvent.change(screen.getByRole("textbox", { name: "Contents of Groceries" }), { target: { value: "# Shopping\n" } })

    await act(() => router.navigate({ to: "/dashboard" }))

    await waitFor(() => expect(puts(calls)).toEqual([{ content: "# Shopping\n" }]))
  })

  it("opens ready to write when it was just created", async () => {
    routes("")
    renderWithProviders(<PageRoute />, { route: "/pages/$pageId", url: "/pages/p1?edit=true" })

    expect(await screen.findByRole("textbox", { name: "Contents of Groceries" })).toHaveAttribute("contenteditable", "true")
  })
})

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import type { TiptapEditorHTMLElement } from "@tiptap/core"
import { afterEach, describe, expect, it } from "vitest"
import { FileItemContent } from "@/routes/file-item"
import { fileItemFixture } from "@/test/file-board-fixtures"
import { mockApi, resetApiMock, type MockRequest } from "@/test/mock-api"
import { renderWithProviders } from "@/test/render-with-providers"

const note = fileItemFixture({ title: "notes.md", mime: "application/octet-stream" })
const GROCERIES = "# Groceries\n\n- milk\n"
const AFTER_AUTOSAVE = { timeout: 4000 }

function routes(text: string) {
  return mockApi({
    "GET /file-boards/b1/items": () => ({ items: [note] }),
    "GET /file-items/f1/file": () => new Response(text, { headers: { "Content-Type": "text/markdown" } }),
    "PUT /file-items/f1/file": ({ body }: MockRequest) => ({ ...note, sizeBytes: (body as { content: string }).content.length }),
  })
}

const puts = (calls: MockRequest[]) => calls.filter((call) => call.method === "PUT").map((call) => call.body)

function openFile() {
  renderWithProviders(<FileItemContent boardId="b1" itemId="f1" />)
  return screen.findByRole("textbox", { name: "Contents of notes.md" })
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

describe("MarkdownFileEditor", () => {
  it("opens a markdown file formatted, without anything to save", async () => {
    routes(GROCERIES)
    const editor = await openFile()

    expect(editor).toHaveAttribute("contenteditable", "true")
    expect(within(editor).getByRole("heading", { name: "Groceries", level: 1 })).toBeInTheDocument()
    expect(within(editor).getByRole("listitem")).toHaveTextContent("milk")
    expect(screen.getByRole("tab", { name: "Formatted" })).toHaveAttribute("aria-selected", "true")
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument()
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
  })

  it("saves formatted edits as markdown, keeping the final newline", async () => {
    const { calls } = routes(GROCERIES)
    const editor = await openFile()
    act(() => {
      richEditor(editor).commands.insertContentAt(richEditor(editor).state.doc.content.size, "<h2>Later</h2>")
    })

    await waitFor(() => expect(puts(calls)).toEqual([{ content: "# Groceries\n\n- milk\n\n## Later\n" }]), AFTER_AUTOSAVE)
  })

  it("has nothing to save after an edit is undone", async () => {
    const { calls } = routes(GROCERIES)
    const editor = await openFile()
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

  it("focuses the end of the text when the empty space around it is clicked", async () => {
    routes(GROCERIES)
    const editor = await openFile()
    const box = editor.closest("div.cursor-text") as HTMLElement
    fireEvent.mouseDown(within(box).getByRole("listitem"))
    expect(richEditor(editor).isFocused).toBe(false)

    fireEvent.mouseDown(box)

    await waitFor(() => expect(richEditor(editor).isFocused).toBe(true))
    const { $from } = richEditor(editor).state.selection
    expect($from.parent.textContent).toBe("milk")
    expect($from.parentOffset).toBe("milk".length)
  })

  it("saves with Ctrl+S from the formatted editor", async () => {
    routes(GROCERIES)
    const editor = await openFile()
    fireEvent.keyDown(editor, { key: "s", ctrlKey: true })

    expect(await screen.findByText("Already saved")).toBeInTheDocument()
  })

  it("shows the markdown source and formats what was typed there", async () => {
    const { calls } = routes(GROCERIES)
    await openFile()
    chooseTab("Markdown")

    const source = screen.getByRole("textbox", { name: "Contents of notes.md" }) as HTMLTextAreaElement
    expect(source.tagName).toBe("TEXTAREA")
    expect(source.value).toBe(GROCERIES)
    fireEvent.change(source, { target: { value: "# Shopping\n\n- milk\n" } })
    fireEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(await screen.findByText("File saved")).toBeInTheDocument()
    expect(puts(calls)).toEqual([{ content: "# Shopping\n\n- milk\n" }])

    chooseTab("Formatted")
    const editor = screen.getByRole("textbox", { name: "Contents of notes.md" })
    expect(within(editor).getByRole("heading", { name: "Shopping", level: 1 })).toBeInTheDocument()
  })

  it("opens a file the editor would rewrite as source, until the person chooses otherwise", async () => {
    const table = "| item | qty |\n|---|---|\n| milk | 1 |\n"
    const { calls } = routes(table)
    const source = (await openFile()) as HTMLTextAreaElement

    expect(source.value).toBe(table)
    expect(screen.getByRole("tab", { name: "Markdown" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("status")).toHaveTextContent("formatting the visual editor would change")

    fireEvent.click(screen.getByRole("button", { name: "Edit formatted anyway" }))

    expect(screen.getByRole("textbox", { name: "Contents of notes.md" })).toHaveAttribute("contenteditable", "true")
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(puts(calls)).toEqual([])
  })
})

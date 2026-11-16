import { fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { FileItemContent } from "@/routes/file-item"
import { fileItemFixture } from "@/test/file-board-fixtures"
import { mockApi, resetApiMock, type MockRequest } from "@/test/mock-api"
import { renderWithProviders } from "@/test/render-with-providers"
import type { FileItem } from "@/types/file-board"

const note = fileItemFixture({ title: "notes.txt", mime: "application/octet-stream" })
const pdf = fileItemFixture({ id: "f2", title: "bill.pdf", mime: "application/pdf", sizeBytes: 4096 })
const AFTER_AUTOSAVE = { timeout: 4000 }

function routes(items: FileItem[], save: (request: MockRequest) => unknown = savedItem) {
  return mockApi({
    "GET /file-boards/b1/items": () => ({ items }),
    "GET /file-items/f1/file": () => new Response("# Groceries\n- milk", { headers: { "Content-Type": "text/plain" } }),
    "PUT /file-items/f1/file": save,
  })
}

function savedItem({ body }: MockRequest) {
  const { content } = body as { content: string }
  return { ...note, sizeBytes: content.length, updatedAt: new Date().toISOString() }
}

const puts = (calls: MockRequest[]) => calls.filter((call) => call.method === "PUT").map((call) => call.body)

async function openEditor() {
  renderWithProviders(<FileItemContent boardId="b1" itemId="f1" />)
  return (await screen.findByRole("textbox", { name: "Contents of notes.txt" })) as HTMLTextAreaElement
}

afterEach(resetApiMock)

describe("FileItemContent", () => {
  it("opens the raw text of a text file in a plain editor", async () => {
    routes([note])
    const editor = await openEditor()

    expect(screen.getByRole("heading", { name: "notes.txt", level: 1 })).toBeInTheDocument()
    expect(editor.value).toBe("# Groceries\n- milk")
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument()
    expect(screen.queryByRole("tab", { name: "Formatted" })).not.toBeInTheDocument()
  })

  it("shows Save once the text changes and confirms the save", async () => {
    const { calls } = routes([note])
    const editor = await openEditor()
    fireEvent.change(editor, { target: { value: "# Groceries\n- milk\n- eggs" } })

    fireEvent.click(await screen.findByRole("button", { name: "Save" }))

    expect(await screen.findByText("File saved")).toBeInTheDocument()
    expect(puts(calls)).toEqual([{ content: "# Groceries\n- milk\n- eggs" }])
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument())
    expect(editor.value).toBe("# Groceries\n- milk\n- eggs")
  })

  it("saves automatically after a pause in typing", async () => {
    const { calls } = routes([note])
    const editor = await openEditor()
    fireEvent.change(editor, { target: { value: "draft" } })
    fireEvent.change(editor, { target: { value: "draft two" } })

    await waitFor(() => expect(puts(calls)).toEqual([{ content: "draft two" }]), AFTER_AUTOSAVE)
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument())
  })

  it("says the file was already saved when Ctrl+S has nothing to save", async () => {
    const { calls } = routes([note])
    const editor = await openEditor()
    fireEvent.keyDown(editor, { key: "s", ctrlKey: true })

    expect(await screen.findByText("Already saved")).toBeInTheDocument()
    expect(puts(calls)).toEqual([])
  })

  it("keeps the changes pending when the save fails", async () => {
    routes([note], () => [500, { error: "boom", message: "Disk unavailable" }])
    const editor = await openEditor()
    fireEvent.change(editor, { target: { value: "lost?" } })
    fireEvent.keyDown(editor, { key: "S", metaKey: true })

    expect(await screen.findByText("Disk unavailable")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument()
    expect(editor.value).toBe("lost?")
  })

  it("saves unsaved changes when leaving the page", async () => {
    const { calls } = routes([note])
    renderWithProviders(<FileItemContent boardId="b1" itemId="f1" />)
    const editor = await screen.findByRole("textbox", { name: "Contents of notes.txt" })
    fireEvent.change(editor, { target: { value: "typed then left" } })
    fireEvent.click(screen.getByRole("button", { name: "Back" }))

    await waitFor(() => expect(puts(calls)).toEqual([{ content: "typed then left" }]))
  })

  it("embeds a PDF without downloading it in the page itself", async () => {
    const { calls } = routes([pdf])
    renderWithProviders(<FileItemContent boardId="b1" itemId="f2" />)

    const frame = await screen.findByTitle("bill.pdf")
    expect(frame.tagName).toBe("IFRAME")
    expect(frame).toHaveAttribute("src", `http://api.test/api/file-items/f2/file?v=${encodeURIComponent(pdf.updatedAt)}`)
    expect(calls.some((call) => call.path.endsWith("/file"))).toBe(false)
  })

  it("skips text files that are too large to open", async () => {
    const { calls } = routes([fileItemFixture({ sizeBytes: 3 * 1024 * 1024 })])
    renderWithProviders(<FileItemContent boardId="b1" itemId="f1" />)

    expect(await screen.findByText("Too large to preview")).toBeInTheDocument()
    expect(calls.some((call) => call.path.endsWith("/file"))).toBe(false)
  })

  it("says when the file no longer exists", async () => {
    routes([])
    renderWithProviders(<FileItemContent boardId="b1" itemId="f1" />)

    expect(await screen.findByText("File not found")).toBeInTheDocument()
  })

  it("goes back to the same board", async () => {
    routes([note])
    const { router } = renderWithProviders(<FileItemContent boardId="b1" itemId="f1" />)
    fireEvent.click(await screen.findByRole("button", { name: "Back" }))

    await waitFor(() => expect(router.state.location.pathname).toBe("/file-board"))
    expect(router.state.location.search).toEqual({ board: "b1" })
  })
})

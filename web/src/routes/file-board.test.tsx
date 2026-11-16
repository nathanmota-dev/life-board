import { fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { FileBoardPage } from "@/routes/file-board"
import { fileBoardFixture, fileItemFixture } from "@/test/file-board-fixtures"
import { mockApi, resetApiMock } from "@/test/mock-api"
import { renderWithProviders } from "@/test/render-with-providers"

const bills = fileBoardFixture()
const photos = fileBoardFixture({ id: "b2", name: "Photos", kind: "photos" })
const photo = fileItemFixture({ id: "f9", boardId: "b2", title: "beach.png", mime: "image/png", kind: "image" })

function routes() {
  return mockApi({
    "GET /file-boards": () => ({ items: [bills, photos] }),
    "GET /file-boards/b1/items": () => ({ items: [fileItemFixture()] }),
    "GET /file-boards/b2/items": () => ({ items: [photo] }),
  })
}

afterEach(resetApiMock)

describe("FileBoardPage", () => {
  it("keeps the selected board in the URL", async () => {
    routes()
    const { router } = renderWithProviders(<FileBoardPage />)
    expect(await screen.findByText("notes.txt")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /Photos/ }))

    await waitFor(() => expect(router.state.location.search).toEqual({ board: "b2" }))
    expect(await screen.findByText("beach.png")).toBeInTheDocument()
  })

  it("expands an image and edits it from the pencil", async () => {
    routes()
    renderWithProviders(<FileBoardPage />)
    fireEvent.click(await screen.findByRole("button", { name: /Photos/ }))

    fireEvent.click(await screen.findByRole("button", { name: "Open beach.png" }))
    const lightbox = await screen.findByRole("dialog", { name: "beach.png" })
    expect(lightbox.querySelector("img")?.getAttribute("src")).toMatch(/^http:\/\/api.test\/api\/file-items\/f9\/file\?v=/)
    fireEvent.keyDown(lightbox, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    fireEvent.click(screen.getByRole("button", { name: "Edit beach.png" }))
    expect(await screen.findByRole("button", { name: "Save" })).toBeInTheDocument()
  })

  it("creates an empty markdown document and opens it", async () => {
    const created = fileItemFixture({ id: "f2", title: "Untitled.md", mime: "text/markdown", kind: "note", sizeBytes: 0 })
    const { calls } = mockApi({
      "GET /file-boards": () => ({ items: [bills] }),
      "GET /file-boards/b1/items": () => ({ items: [fileItemFixture()] }),
      "POST /file-boards/b1/items": () => [201, created],
    })
    const { router } = renderWithProviders(<FileBoardPage />)

    fireEvent.click(await screen.findByRole("button", { name: "New document" }))

    await waitFor(() => expect(router.state.location.pathname).toBe("/file-board/b1/f2"))
    const form = calls.find((call) => call.method === "POST")?.body as FormData
    expect(form.get("title")).toBe("Untitled.md")
    expect(form.get("kind")).toBe("note")
    expect(form.get("file")).toMatchObject({ name: "Untitled.md", type: "text/markdown", size: 0 })
  })

  it("shows why a new document could not be created", async () => {
    mockApi({
      "GET /file-boards": () => ({ items: [bills] }),
      "GET /file-boards/b1/items": () => ({ items: [] }),
      "POST /file-boards/b1/items": () => [500, { error: "internal", message: "Disk is full." }],
    })
    const { router } = renderWithProviders(<FileBoardPage />)

    fireEvent.click(await screen.findByRole("button", { name: "New document" }))

    expect(await screen.findByText("Disk is full.")).toBeInTheDocument()
    expect(router.state.location.pathname).toBe("/")
  })
})

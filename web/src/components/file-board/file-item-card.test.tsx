import { fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FileItemCard } from "@/components/file-board/file-item-card"
import { fileItemFixture } from "@/test/file-board-fixtures"
import { mockApi, resetApiMock } from "@/test/mock-api"
import { renderWithProviders } from "@/test/render-with-providers"
import type { FileItem } from "@/types/file-board"

const text = fileItemFixture()
const pdf = fileItemFixture({ id: "f2", title: "bill.pdf", mime: "application/pdf" })
const image = fileItemFixture({ id: "f3", title: "photo.png", mime: "image/png", kind: "image" })
const archive = fileItemFixture({ id: "f4", title: "backup.zip", mime: "application/zip" })

function renderCard(item: FileItem) {
  mockApi({})
  const onOpen = vi.fn()
  const onPreviewImage = vi.fn()
  const view = renderWithProviders(<FileItemCard item={item} onOpen={onOpen} onPreviewImage={onPreviewImage} />)
  return { ...view, onOpen, onPreviewImage }
}

afterEach(resetApiMock)

describe("FileItemCard", () => {
  it.each([text, pdf])("opens $title on its own page", async (item) => {
    const { router, onOpen } = renderCard(item)
    fireEvent.click(await screen.findByRole("button", { name: `Open ${item.title}` }))

    await waitFor(() => expect(router.state.location.pathname).toBe(`/file-board/b1/${item.id}`))
    expect(onOpen).not.toHaveBeenCalled()
  })

  it("expands an image instead of leaving the board", async () => {
    const { router, onPreviewImage } = renderCard(image)
    fireEvent.click(await screen.findByRole("button", { name: "Open photo.png" }))

    expect(onPreviewImage).toHaveBeenCalledWith(image)
    expect(router.state.location.pathname).toBe("/")
  })

  it("opens the edit dialog for files it cannot preview", async () => {
    const { onOpen } = renderCard(archive)
    fireEvent.click(await screen.findByRole("button", { name: "Open backup.zip" }))

    expect(onOpen).toHaveBeenCalledWith(archive)
  })

  it("edits the file from the pencil in the footer", async () => {
    const { router, onOpen } = renderCard(text)
    fireEvent.click(await screen.findByRole("button", { name: "Edit notes.txt" }))

    expect(onOpen).toHaveBeenCalledWith(text)
    expect(router.state.location.pathname).toBe("/")
  })

  it("deletes the file straight from the footer", async () => {
    const { calls } = mockApi({ "DELETE /file-items/f1": () => ({ ok: true }) })
    const onOpen = vi.fn()
    renderWithProviders(<FileItemCard item={text} onOpen={onOpen} onPreviewImage={vi.fn()} />)
    fireEvent.click(await screen.findByRole("button", { name: "Delete notes.txt" }))

    await waitFor(() => expect(calls).toContainEqual(expect.objectContaining({ method: "DELETE", path: "/file-items/f1" })))
    expect(onOpen).not.toHaveBeenCalled()
  })

  it("reports a failed delete", async () => {
    mockApi({ "DELETE /file-items/f1": () => [500, { error: "boom", message: "Disk unavailable" }] })
    renderWithProviders(<FileItemCard item={text} onOpen={vi.fn()} onPreviewImage={vi.fn()} />)
    fireEvent.click(await screen.findByRole("button", { name: "Delete notes.txt" }))

    expect(await screen.findByText("Disk unavailable")).toBeInTheDocument()
  })

  it("shows different icons and extension badges for text and PDF files", async () => {
    const { container, unmount } = renderCard(text)
    await screen.findByText("txt")
    const textIcon = container.querySelector("[data-preview-kind='text'] svg")?.getAttribute("class")
    unmount()

    const pdfView = renderCard(pdf)
    await screen.findByText("pdf")
    const pdfIcon = pdfView.container.querySelector("[data-preview-kind='pdf'] svg")?.getAttribute("class")

    expect(textIcon).toContain("lucide-file-text")
    expect(pdfIcon).toContain("lucide-file-type")
    expect(pdfIcon).not.toContain("lucide-file-text")
  })
})

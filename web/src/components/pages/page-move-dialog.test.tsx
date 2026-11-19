import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PageMoveDialog } from "@/components/pages/page-move-dialog"
import { mockApi, resetApiMock } from "@/test/mock-api"
import { folderFixture, pageFixture } from "@/test/page-fixtures"
import { renderWithProviders } from "@/test/render-with-providers"

const vbl = folderFixture({ id: "vbl", title: "VBL" })
const akyou = folderFixture({ id: "akyou", title: "AKYOU", parentId: "vbl" })
const zed = folderFixture({ id: "zed", title: "Zed" })
const task = pageFixture({ id: "task", title: "Task", parentId: "akyou" })
const ALL = [vbl, akyou, zed, task]

afterEach(resetApiMock)

async function openDialog(node = task) {
  mockApi({ "GET /pages": () => ({ items: ALL }) })
  const onMove = vi.fn()
  const onClose = vi.fn()
  renderWithProviders(<PageMoveDialog node={node} onMove={onMove} onClose={onClose} />)
  const dialog = await screen.findByRole("dialog", { name: `Move ${node.title}` })
  // The folders arrive after the dialog opens.
  await within(dialog).findByRole("button", { name: "Zed" })
  return { dialog, onMove, onClose }
}

describe("PageMoveDialog", () => {
  it("lists the top level and every folder, but not the page's own folder", async () => {
    const { dialog } = await openDialog()

    expect(within(dialog).getByRole("button", { name: "Top level" })).toBeEnabled()
    expect(within(dialog).getByRole("button", { name: "VBL" })).toBeEnabled()
    expect(within(dialog).getByRole("button", { name: "Zed" })).toBeEnabled()
    expect(within(dialog).getByRole("button", { name: "AKYOU" })).toBeDisabled()
  })

  it("moves to the chosen folder and closes", async () => {
    const { dialog, onMove, onClose } = await openDialog()

    fireEvent.click(within(dialog).getByRole("button", { name: "Zed" }))

    expect(onMove).toHaveBeenCalledExactlyOnceWith(task, "zed")
    expect(onClose).toHaveBeenCalled()
  })

  it("moves to the top level", async () => {
    const { dialog, onMove } = await openDialog()

    fireEvent.click(within(dialog).getByRole("button", { name: "Top level" }))

    expect(onMove).toHaveBeenCalledExactlyOnceWith(task, null)
  })

  it("doesn't offer a folder itself, its descendants or its own folder", async () => {
    const { dialog } = await openDialog(vbl)

    expect(within(dialog).getByRole("button", { name: "VBL" })).toBeDisabled()
    expect(within(dialog).getByRole("button", { name: "AKYOU" })).toBeDisabled()
    expect(within(dialog).getByRole("button", { name: "Top level" })).toBeDisabled()
    expect(within(dialog).getByRole("button", { name: "Zed" })).toBeEnabled()
  })

  it("closes without moving", async () => {
    const { dialog, onMove, onClose } = await openDialog()

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }))

    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(onMove).not.toHaveBeenCalled()
  })
})

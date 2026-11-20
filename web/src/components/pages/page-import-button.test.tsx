import { fireEvent, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PageImportButton } from "@/components/pages/page-import-button"
import { mockApi, resetApiMock, type MockRequest } from "@/test/mock-api"
import { pageFixture } from "@/test/page-fixtures"
import { renderWithProviders } from "@/test/render-with-providers"

function picked(name: string, path: string, content = "# Note\n") {
  const file = new File([content], name)
  Object.defineProperty(file, "webkitRelativePath", { value: path })
  return file
}

const imports = (calls: MockRequest[]) =>
  calls
    .filter((call) => call.method === "POST" && call.path === "/pages/import")
    .map((call) => {
      const form = call.body as FormData
      return { name: (form.get("file") as File).name, parentId: form.get("parentId"), folderPath: form.get("folderPath") }
    })

async function setup(parentId: string | null = null, failing: string[] = []) {
  const onImported = vi.fn()
  const { calls } = mockApi({
    "POST /pages/import": ({ body }: MockRequest) => {
      const name = ((body as FormData).get("file") as File).name
      return failing.includes(name) ? [400, { error: "invalid", message: "Too big" }] : [201, pageFixture({ title: name })]
    },
    "GET /pages": () => ({ items: [] }),
  })
  renderWithProviders(<PageImportButton parentId={parentId} onImported={onImported} />)
  await screen.findByRole("button", { name: "Import" })
  return { calls, onImported }
}

afterEach(resetApiMock)

describe("PageImportButton", () => {
  it("sends only the .md files of a folder, one at a time, with their folders", async () => {
    const { calls, onImported } = await setup("vbl")

    fireEvent.change(screen.getByLabelText("Folder to import"), {
      target: {
        files: [
          picked("a.md", "Notes/a.md"),
          picked("b.txt", "Notes/b.txt"),
          picked("c.markdown", "Notes/deep/er/c.markdown"),
          picked("pic.png", "Notes/pic.png"),
          picked("top.md", "top.md"),
        ],
      },
    })

    expect(await screen.findByText("3 imported, 2 skipped")).toBeInTheDocument()
    expect(imports(calls)).toEqual([
      { name: "a.md", parentId: "vbl", folderPath: "Notes" },
      { name: "c.markdown", parentId: "vbl", folderPath: "Notes/deep/er" },
      { name: "top.md", parentId: "vbl", folderPath: null },
    ])
    expect(onImported).toHaveBeenCalledWith("vbl")
  })

  it("imports several .md files into the root, without a folder", async () => {
    const { calls } = await setup()

    fireEvent.change(screen.getByLabelText("Markdown files to import"), { target: { files: [picked("one.md", ""), picked("two.md", "")] } })

    expect(await screen.findByText("2 imported, 0 skipped")).toBeInTheDocument()
    expect(imports(calls)).toEqual([
      { name: "one.md", parentId: null, folderPath: null },
      { name: "two.md", parentId: null, folderPath: null },
    ])
  })

  it("counts a file the API refuses as skipped and keeps going", async () => {
    const { calls } = await setup(null, ["bad.md"])

    fireEvent.change(screen.getByLabelText("Markdown files to import"), { target: { files: [picked("bad.md", ""), picked("good.md", "")] } })

    expect(await screen.findByText("1 imported, 1 skipped")).toBeInTheDocument()
    expect(imports(calls).map((call) => call.name)).toEqual(["bad.md", "good.md"])
  })

  it("does nothing when the picker is cancelled", async () => {
    const { calls, onImported } = await setup()

    fireEvent.change(screen.getByLabelText("Folder to import"), { target: { files: [] } })

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(calls).toEqual([])
    expect(onImported).not.toHaveBeenCalled()
  })

  it("opens the pickers from its menu", async () => {
    await setup()
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => undefined)

    fireEvent.pointerDown(screen.getByRole("button", { name: "Import" }), { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole("menuitem", { name: "Import folder" }))

    await waitFor(() => expect(click).toHaveBeenCalledTimes(1))
    click.mockRestore()
  })
})

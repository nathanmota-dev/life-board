import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PageTree } from "@/components/pages/page-tree"
import { mockApi, resetApiMock, type MockRequest } from "@/test/mock-api"
import { folderFixture, pageFixture } from "@/test/page-fixtures"
import { renderWithProviders } from "@/test/render-with-providers"

const vbl = folderFixture({ id: "vbl", title: "VBL" })
const akyou = folderFixture({ id: "akyou", title: "AKYOU", parentId: "vbl" })
const task = pageFixture({ id: "task", title: "MindShef - Task", parentId: "akyou" })
const intro = pageFixture({ id: "intro", title: "Intro", parentId: "vbl" })
const inbox = pageFixture({ id: "inbox", title: "Inbox" })
const ALL = [task, inbox, akyou, intro, vbl]

function routes(pages = ALL) {
  return mockApi({
    "GET /pages": () => ({ items: pages }),
    "POST /pages": ({ body }: MockRequest) => [201, { ...pageFixture({ id: "new" }), ...(body as object) }],
    ...Object.fromEntries(pages.map((page) => [`PATCH /pages/${page.id}`, ({ body }: MockRequest) => ({ ...page, ...(body as object) })])),
  })
}

/** jsdom's Blob has no `text()`. */
const readBlob = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.readAsText(blob)
  })

const row = (name: string) => screen.findByRole("treeitem", { name })
const sent = (calls: MockRequest[], method: string) => calls.filter((call) => call.method === method)

/** The tree on a `/pages/$pageId` route, as in the app; `/pages/none` is a page that isn't in the list. */
function renderTree(url = "/pages/none") {
  return renderWithProviders(<PageTree />, { route: "/pages/$pageId", url })
}

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  vi.restoreAllMocks()
  resetApiMock()
})

describe("PageTree: browsing", () => {
  it("lists the root with folders first, and expands and collapses a folder", async () => {
    routes()
    renderTree()
    const folder = await row("VBL")

    expect(screen.getAllByRole("treeitem").map((item) => item.getAttribute("aria-label"))).toEqual(["VBL", "Inbox"])
    expect(folder).toHaveAttribute("aria-expanded", "false")

    fireEvent.click(folder)
    expect(folder).toHaveAttribute("aria-expanded", "true")
    expect(screen.getAllByRole("treeitem").map((item) => item.getAttribute("aria-label"))).toEqual(["VBL", "AKYOU", "Intro", "Inbox"])

    fireEvent.click(folder)
    expect(screen.queryByRole("treeitem", { name: "AKYOU" })).not.toBeInTheDocument()
  })

  it("restores the open folders from localStorage, and remembers new ones", async () => {
    window.localStorage.setItem("life-board:pages-expanded", JSON.stringify(["vbl"]))
    routes()
    renderTree()

    expect(await row("AKYOU")).toBeInTheDocument()
    fireEvent.click(await row("AKYOU"))
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem("life-board:pages-expanded")!)).toEqual(["vbl", "akyou"]))
  })

  it("keeps working when localStorage throws", async () => {
    const { getItem, setItem } = Storage.prototype
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
      if (key === "life-board:pages-expanded") throw new Error("blocked")
      return getItem.call(this, key)
    })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === "life-board:pages-expanded") throw new Error("blocked")
      setItem.call(this, key, value)
    })
    routes()
    renderTree()

    fireEvent.click(await row("VBL"))

    expect(await row("AKYOU")).toBeInTheDocument()
  })

  it("ignores a stored value that isn't a list", async () => {
    window.localStorage.setItem("life-board:pages-expanded", '{"vbl":true}')
    routes()
    renderTree()

    await row("VBL")
    expect(screen.queryByRole("treeitem", { name: "AKYOU" })).not.toBeInTheDocument()
  })

  it("opens the folders above the open page, and selects it", async () => {
    routes()
    renderTree("/pages/task")

    const open = await row("MindShef - Task")

    expect(open).toHaveAttribute("aria-selected", "true")
    expect(await row("AKYOU")).toHaveAttribute("aria-expanded", "true")
    expect(await row("VBL")).toHaveAttribute("aria-expanded", "true")
  })

  it("opens a page when it is clicked, or with Enter", async () => {
    routes()
    const { router } = renderTree()

    fireEvent.click(await row("Inbox"))
    await waitFor(() => expect(router.state.location.pathname).toBe("/pages/inbox"))

    await act(() => router.navigate({ to: "/pages/$pageId", params: { pageId: "none" } }))
    fireEvent.keyDown(await row("Inbox"), { key: "Enter" })
    await waitFor(() => expect(router.state.location.pathname).toBe("/pages/inbox"))
  })

  it("collapses every folder at once", async () => {
    window.localStorage.setItem("life-board:pages-expanded", JSON.stringify(["vbl", "akyou"]))
    routes()
    renderTree()
    expect(await row("MindShef - Task")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }))

    expect(screen.queryByRole("treeitem", { name: "AKYOU" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Collapse all" })).toBeDisabled()
  })

  it("moves between rows and opens or closes folders with the arrow keys", async () => {
    routes()
    renderTree()
    const folder = await row("VBL")
    folder.focus()

    fireEvent.keyDown(folder, { key: "ArrowRight" })
    expect(folder).toHaveAttribute("aria-expanded", "true")
    fireEvent.keyDown(folder, { key: "ArrowDown" })
    expect(await row("AKYOU")).toHaveFocus()
    fireEvent.keyDown(await row("AKYOU"), { key: "ArrowUp" })
    expect(folder).toHaveFocus()
    fireEvent.keyDown(folder, { key: "ArrowLeft" })
    expect(folder).toHaveAttribute("aria-expanded", "false")
  })

  it("says when there are no pages", async () => {
    routes([])
    renderTree()

    expect(await screen.findByText("No pages yet")).toBeInTheDocument()
  })

  it("explains why the pages couldn't be loaded", async () => {
    mockApi({ "GET /pages": () => [500, { error: "internal", message: "Disk unavailable" }] })
    renderTree()

    expect(await screen.findByText("Disk unavailable")).toBeInTheDocument()
  })
})

describe("PageTree: creating", () => {
  it("creates a page at the root from the toolbar and opens it in edit mode", async () => {
    const { calls } = routes()
    const { router } = renderTree()
    await row("Inbox")

    fireEvent.click(screen.getByRole("button", { name: "New page" }))
    const input = screen.getByRole("textbox", { name: "Title of the new page" })
    expect(input).toHaveFocus()
    fireEvent.change(input, { target: { value: "  Ideas  " } })
    fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() => expect(router.state.location.pathname).toBe("/pages/new"))
    expect(router.state.location.search).toEqual({ edit: true })
    expect(sent(calls, "POST")[0].body).toEqual({ kind: "page", title: "Ideas", parentId: null })
    expect(screen.queryByRole("textbox", { name: "Title of the new page" })).not.toBeInTheDocument()
  })

  it("creates inside the selected folder, opening it", async () => {
    const { calls } = routes()
    renderTree()
    fireEvent.click(await row("VBL"))
    fireEvent.click(await row("AKYOU"))

    fireEvent.click(screen.getByRole("button", { name: "New folder" }))
    const input = screen.getByRole("textbox", { name: "Name of the new folder" })
    fireEvent.change(input, { target: { value: "Deep" } })
    fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() => expect(sent(calls, "POST")).toHaveLength(1))
    expect(sent(calls, "POST")[0].body).toEqual({ kind: "folder", title: "Deep", parentId: "akyou" })
  })

  it("creates next to the selected page, in its folder", async () => {
    const { calls } = routes()
    renderTree("/pages/intro")
    fireEvent.click(await row("Intro"))

    fireEvent.click(screen.getByRole("button", { name: "New page" }))
    const input = screen.getByRole("textbox", { name: "Title of the new page" })
    fireEvent.change(input, { target: { value: "Sibling" } })
    fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() => expect(sent(calls, "POST")).toHaveLength(1))
    expect(sent(calls, "POST")[0].body).toMatchObject({ title: "Sibling", parentId: "vbl" })
  })

  it("cancels with Esc, and refuses an empty title", async () => {
    const { calls } = routes()
    renderTree()
    await row("Inbox")
    fireEvent.click(screen.getByRole("button", { name: "New page" }))
    const input = screen.getByRole("textbox", { name: "Title of the new page" })

    fireEvent.change(input, { target: { value: "   " } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(sent(calls, "POST")).toEqual([])

    fireEvent.keyDown(input, { key: "Escape" })
    expect(screen.queryByRole("textbox", { name: "Title of the new page" })).not.toBeInTheDocument()
    expect(sent(calls, "POST")).toEqual([])
  })

  it("creates from a folder's context menu", async () => {
    const { calls } = routes()
    renderTree()
    fireEvent.contextMenu(await row("VBL"))

    fireEvent.click(await screen.findByRole("menuitem", { name: "New page" }))
    const input = screen.getByRole("textbox", { name: "Title of the new page" })
    fireEvent.change(input, { target: { value: "Inside" } })
    fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() => expect(sent(calls, "POST")).toHaveLength(1))
    expect(sent(calls, "POST")[0].body).toEqual({ kind: "page", title: "Inside", parentId: "vbl" })
    expect(await row("VBL")).toHaveAttribute("aria-expanded", "true")
  })
})

describe("PageTree: renaming", () => {
  it("renames with F2 and Enter", async () => {
    const { calls } = routes()
    renderTree()
    fireEvent.keyDown(await row("Inbox"), { key: "F2" })
    const input = screen.getByRole("textbox", { name: "Rename Inbox" })

    expect(input).toHaveValue("Inbox")
    fireEvent.change(input, { target: { value: "Done" } })
    fireEvent.keyDown(input, { key: "Enter" })

    await waitFor(() => expect(sent(calls, "PATCH")).toHaveLength(1))
    expect(sent(calls, "PATCH")[0]).toMatchObject({ path: "/pages/inbox", body: { title: "Done" } })
    expect(screen.queryByRole("textbox", { name: "Rename Inbox" })).not.toBeInTheDocument()
  })

  it("renames with a double click, and from the context menu", async () => {
    routes()
    renderTree()
    fireEvent.doubleClick(await row("Inbox"))
    expect(screen.getByRole("textbox", { name: "Rename Inbox" })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Rename Inbox" }), { key: "Escape" })

    fireEvent.contextMenu(await row("Inbox"))
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rename" }))
    expect(screen.getByRole("textbox", { name: "Rename Inbox" })).toBeInTheDocument()
  })

  it("keeps the title with Esc, and refuses an empty one", async () => {
    const { calls } = routes()
    renderTree()
    fireEvent.keyDown(await row("Inbox"), { key: "F2" })
    const input = screen.getByRole("textbox", { name: "Rename Inbox" })

    fireEvent.change(input, { target: { value: "" } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(input).toHaveAttribute("aria-invalid", "true")

    fireEvent.keyDown(input, { key: "Escape" })
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(sent(calls, "PATCH")).toEqual([])
    expect(await row("Inbox")).toBeInTheDocument()
  })

  it("saves a changed title when the input loses focus", async () => {
    const { calls } = routes()
    renderTree()
    fireEvent.keyDown(await row("Inbox"), { key: "F2" })
    const input = screen.getByRole("textbox", { name: "Rename Inbox" })

    fireEvent.change(input, { target: { value: "Blurred" } })
    fireEvent.blur(input)

    await waitFor(() => expect(sent(calls, "PATCH")[0]?.body).toEqual({ title: "Blurred" }))
  })
})

describe("PageTree: deleting", () => {
  it("asks first, says how many pages a folder holds, and deletes it", async () => {
    const { calls } = mockApi({ "GET /pages": () => ({ items: ALL }), "DELETE /pages/vbl": () => ({ ok: true }) })
    renderTree()
    fireEvent.contextMenu(await row("VBL"))
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }))

    const dialog = await screen.findByRole("dialog", { name: "Delete VBL?" })
    expect(dialog).toHaveTextContent("This folder and the 2 pages inside it are deleted permanently")
    expect(sent(calls, "DELETE")).toEqual([])

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }))

    await waitFor(() => expect(sent(calls, "DELETE")).toHaveLength(1))
    expect(sent(calls, "DELETE")[0].path).toBe("/pages/vbl")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("can be cancelled", async () => {
    const { calls } = routes()
    renderTree()
    fireEvent.keyDown(await row("Inbox"), { key: "Delete" })

    const dialog = await screen.findByRole("dialog", { name: "Delete Inbox?" })
    expect(dialog).toHaveTextContent("This page is deleted permanently")
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(sent(calls, "DELETE")).toEqual([])
  })

  it("goes back to /pages when the open page is deleted, even inside a deleted folder", async () => {
    mockApi({ "GET /pages": () => ({ items: ALL }), "DELETE /pages/vbl": () => ({ ok: true }) })
    const { router } = renderTree("/pages/task")
    fireEvent.contextMenu(await row("VBL"))
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }))

    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }))

    await waitFor(() => expect(router.state.location.pathname).toBe("/pages"))
  })

  it("stays where it is when another page is deleted", async () => {
    mockApi({ "GET /pages": () => ({ items: ALL }), "DELETE /pages/inbox": () => ({ ok: true }) })
    const { router } = renderTree("/pages/task")
    fireEvent.keyDown(await row("Inbox"), { key: "Delete" })

    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }))

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(router.state.location.pathname).toBe("/pages/task")
  })

  it("shows why a delete failed", async () => {
    mockApi({ "GET /pages": () => ({ items: ALL }), "DELETE /pages/inbox": () => [500, { error: "internal", message: "Disk is full." }] })
    renderTree()
    fireEvent.keyDown(await row("Inbox"), { key: "Delete" })

    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }))

    expect(await screen.findByText("Disk is full.")).toBeInTheDocument()
  })
})

describe("PageTree: the actions menu", () => {
  it("offers folder and page actions, and a download for pages only", async () => {
    routes()
    renderTree()

    fireEvent.contextMenu(await row("VBL"))
    expect(await screen.findAllByRole("menuitem")).toHaveLength(5)
    expect(screen.queryByRole("menuitem", { name: "Download .md" })).not.toBeInTheDocument()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument())

    fireEvent.keyDown(await row("Inbox"), { key: "ContextMenu" })
    expect(await screen.findByRole("menuitem", { name: "Download .md" })).toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "New page" })).not.toBeInTheDocument()
  })

  it("downloads the page as stored", async () => {
    const saved: { name: string; text: string }[] = []
    const created = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test")
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined)
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ name: this.download, text: "" })
    })
    mockApi({
      "GET /pages": () => ({ items: [pageFixture({ id: "inbox", title: "Plan: 2026/Q1" })] }),
      "GET /pages/inbox/content": () => ({ content: "  # Kept as is\r\n", updatedAt: "2026-11-01T12:00:00.000Z" }),
    })
    renderTree()
    fireEvent.contextMenu(await row("Plan: 2026/Q1"))

    fireEvent.click(await screen.findByRole("menuitem", { name: "Download .md" }))

    await waitFor(() => expect(saved).toHaveLength(1))
    expect(saved[0].name).toBe("Plan- 2026-Q1.md")
    const blob = created.mock.calls[0][0] as Blob
    expect(await readBlob(blob)).toBe("  # Kept as is\r\n")
  })
})

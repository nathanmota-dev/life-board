import { act, screen, waitFor } from "@testing-library/react"
import type { DragEndEvent } from "@dnd-kit/core"
import { afterEach, describe, expect, it, vi } from "vitest"
import { PageTree } from "@/components/pages/page-tree"
import { mockApi, resetApiMock, type MockRequest } from "@/test/mock-api"
import { folderFixture, pageFixture } from "@/test/page-fixtures"
import { renderWithProviders } from "@/test/render-with-providers"

// jsdom has no layout, so the drop itself can't be performed: the test hands the tree the event dnd-kit would.
const drag = vi.hoisted(() => ({ onDragEnd: undefined as undefined | ((event: DragEndEvent) => void) }))
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const original = await importOriginal<typeof import("@dnd-kit/core")>()
  return {
    ...original,
    DndContext: ({ onDragEnd, children }: { onDragEnd: (event: DragEndEvent) => void; children: React.ReactNode }) => {
      drag.onDragEnd = onDragEnd
      return <>{children}</>
    },
  }
})

const vbl = folderFixture({ id: "vbl", title: "VBL" })
const akyou = folderFixture({ id: "akyou", title: "AKYOU", parentId: "vbl" })
const task = pageFixture({ id: "task", title: "Task", parentId: "akyou" })
const inbox = pageFixture({ id: "inbox", title: "Inbox" })
const ALL = [vbl, akyou, task, inbox]

function drop(activeId: string, overId: string | null) {
  act(() => drag.onDragEnd?.({ active: { id: activeId }, over: overId === null ? null : { id: overId } } as DragEndEvent))
}

function setup() {
  const patches: MockRequest[] = []
  const { calls } = mockApi({
    "GET /pages": () => ({ items: ALL }),
    ...Object.fromEntries(
      ALL.map((page) => [`PATCH /pages/${page.id}`, (request: MockRequest) => (patches.push(request), { ...page, ...(request.body as object) })]),
    ),
  })
  renderWithProviders(<PageTree />, { route: "/pages/$pageId", url: "/pages/none" })
  return { calls, patches }
}

afterEach(resetApiMock)

describe("PageTree: drag and drop", () => {
  it("moves a page dropped on a folder", async () => {
    const { patches } = setup()
    await screen.findByRole("treeitem", { name: "Inbox" })

    drop("inbox", "vbl")

    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0]).toMatchObject({ path: "/pages/inbox", body: { parentId: "vbl" } })
  })

  it("moves an item dropped on the root area to the root", async () => {
    const { patches } = setup()
    await screen.findByRole("treeitem", { name: "VBL" })

    drop("akyou", "root")

    await waitFor(() => expect(patches).toHaveLength(1))
    expect(patches[0]).toMatchObject({ path: "/pages/akyou", body: { parentId: null } })
  })

  it.each([
    ["a folder into its child", "vbl", "akyou"],
    ["a folder into itself", "vbl", "vbl"],
    ["a page into the folder it is already in", "task", "akyou"],
    ["an item outside any target", "inbox", null],
  ])("calls nothing when dropping %s", async (_name, activeId, overId) => {
    const { patches, calls } = setup()
    await screen.findByRole("treeitem", { name: "VBL" })
    const before = calls.length

    drop(activeId, overId)
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(patches).toEqual([])
    expect(calls).toHaveLength(before)
  })
})

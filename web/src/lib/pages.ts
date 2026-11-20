import type { ImportableFile, Page, PageNode, PageUpdate } from "@/types/page"

/** The id of the droppable area behind the tree: dropping there moves an item to the root. */
export const ROOT_DROP_ID = "root"

const MARKDOWN_EXTENSION = /\.(md|markdown)$/i
const INVALID_FILE_NAME_CHARS = /[/\\:*?"<>|]/g

const byKindThenTitle = (a: Page, b: Page) =>
  a.kind === b.kind ? a.title.toLowerCase().localeCompare(b.title.toLowerCase()) : a.kind === "folder" ? -1 : 1

/** The flat list as a tree: folders first, then pages, each sorted by title ignoring case. */
export function buildPageTree(pages: Page[]): PageNode[] {
  const nodes = new Map(pages.map((page) => [page.id, { ...page, children: [] as PageNode[] }]))
  const roots: PageNode[] = []
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined
    ;(parent ? parent.children : roots).push(node)
  }
  const sort = (list: PageNode[]) => {
    list.sort(byKindThenTitle)
    list.forEach((node) => sort(node.children))
  }
  sort(roots)
  return roots
}

/** The folders above a page, from the root down to its own folder. */
export function pageAncestors(pages: Page[], id: string): Page[] {
  const byId = new Map(pages.map((page) => [page.id, page]))
  const chain: Page[] = []
  const seen = new Set([id])
  for (let parent = byId.get(byId.get(id)?.parentId ?? ""); parent && !seen.has(parent.id); parent = byId.get(parent.parentId ?? "")) {
    seen.add(parent.id)
    chain.unshift(parent)
  }
  return chain
}

/** Every item below `id`, at any depth. */
export function pageDescendants(pages: Page[], id: string): Page[] {
  const found: Page[] = []
  const queue = [id]
  while (queue.length > 0) {
    const current = queue.shift()
    for (const page of pages) {
      if (page.parentId === current) {
        found.push(page)
        queue.push(page.id)
      }
    }
  }
  return found
}

/** How many pages (not folders) a delete would take with it. */
export function countPagesIn(pages: Page[], id: string) {
  return pageDescendants(pages, id).filter((page) => page.kind === "page").length
}

/** A move is refused into the item itself, into its descendants, into its own folder or into a page. */
export function canMovePage(pages: Page[], id: string, parentId: string | null) {
  const moved = pages.find((page) => page.id === id)
  if (!moved || moved.parentId === parentId || parentId === id) return false
  if (parentId !== null && pages.find((page) => page.id === parentId)?.kind !== "folder") return false
  return !pageDescendants(pages, id).some((page) => page.id === parentId)
}

/** The change a drop asks for, or null when it must not reach the API. `overId` is a folder id or `ROOT_DROP_ID`. */
export function dropUpdate(pages: Page[], activeId: string, overId: string | null): PageUpdate | null {
  if (overId === null) return null
  const parentId = overId === ROOT_DROP_ID ? null : overId
  return canMovePage(pages, activeId, parentId) ? { parentId } : null
}

/** Where a new item goes: inside the selected folder, or in the folder of the selected page. */
export function targetFolderId(pages: Page[], selectedId: string | null): string | null {
  const selected = pages.find((page) => page.id === selectedId)
  if (!selected) return null
  return selected.kind === "folder" ? selected.id : selected.parentId
}

export function isMarkdownFile(file: File) {
  return MARKDOWN_EXTENSION.test(file.name)
}

/** The folders of a file picked with "Import folder", such as `VBL/AKYOU`; none for a file at the top. */
export function importFolderPath(file: ImportableFile): string | undefined {
  const folders = file.webkitRelativePath.split("/").slice(0, -1).filter(Boolean)
  return folders.length > 0 ? folders.join("/") : undefined
}

/** `<title>.md`, with the characters a file name can't hold replaced by `-`. */
export function downloadFileName(title: string) {
  const printable = [...title].map((char) => (char.charCodeAt(0) < 32 ? "-" : char)).join("")
  const name = printable.replace(INVALID_FILE_NAME_CHARS, "-").trim() || "page"
  return `${name}.md`
}

/** The ids to expand so that the page `id` is visible. */
export function ancestorIds(pages: Page[], id: string | null) {
  return id ? pageAncestors(pages, id).map((page) => page.id) : []
}

import { describe, expect, it } from "vitest"
import {
  ancestorIds,
  buildPageTree,
  canMovePage,
  countPagesIn,
  downloadFileName,
  dropUpdate,
  importFolderPath,
  isMarkdownFile,
  pageAncestors,
  pageDescendants,
  ROOT_DROP_ID,
  targetFolderId,
} from "@/lib/pages"
import { folderFixture, pageFixture } from "@/test/page-fixtures"
import type { ImportableFile } from "@/types/page"

const vbl = folderFixture({ id: "vbl", title: "VBL" })
const akyou = folderFixture({ id: "akyou", title: "AKYOU", parentId: "vbl" })
const task = pageFixture({ id: "task", title: "MindShef - Task", parentId: "akyou" })
const intro = pageFixture({ id: "intro", title: "Intro", parentId: "vbl" })
const inbox = pageFixture({ id: "inbox", title: "inbox" })
const zed = folderFixture({ id: "zed", title: "Zed" })
const all = [task, inbox, akyou, intro, zed, vbl]

function file(name: string, path = "") {
  const picked = new File(["x"], name) as ImportableFile
  Object.defineProperty(picked, "webkitRelativePath", { value: path })
  return picked
}

describe("buildPageTree", () => {
  it("nests items under their folder, folders first and then pages, each sorted by title ignoring case", () => {
    const tree = buildPageTree(all)

    expect(tree.map((node) => node.title)).toEqual(["VBL", "Zed", "inbox"])
    expect(tree[0].children.map((node) => node.title)).toEqual(["AKYOU", "Intro"])
    expect(tree[0].children[0].children.map((node) => node.title)).toEqual(["MindShef - Task"])
  })

  it("puts an item whose folder is missing at the root", () => {
    expect(buildPageTree([pageFixture({ id: "lost", parentId: "gone" })]).map((node) => node.id)).toEqual(["lost"])
  })
})

describe("pageAncestors and ancestorIds", () => {
  it("lists the folders above a page from the root down", () => {
    expect(pageAncestors(all, "task").map((page) => page.title)).toEqual(["VBL", "AKYOU"])
    expect(ancestorIds(all, "task")).toEqual(["vbl", "akyou"])
  })

  it("is empty at the root, for an unknown id and without an id", () => {
    expect(pageAncestors(all, "inbox")).toEqual([])
    expect(pageAncestors(all, "missing")).toEqual([])
    expect(ancestorIds(all, null)).toEqual([])
  })

  it("stops on a loop instead of running forever", () => {
    const a = folderFixture({ id: "a", parentId: "b" })
    const b = folderFixture({ id: "b", parentId: "a" })
    expect(pageAncestors([a, b], "a").map((page) => page.id)).toEqual(["b"])
  })
})

describe("pageDescendants and countPagesIn", () => {
  it("collects everything below a folder, at any depth", () => {
    expect(pageDescendants(all, "vbl").map((page) => page.id).sort()).toEqual(["akyou", "intro", "task"])
    expect(pageDescendants(all, "inbox")).toEqual([])
  })

  it("counts pages, not folders", () => {
    expect(countPagesIn(all, "vbl")).toBe(2)
    expect(countPagesIn(all, "zed")).toBe(0)
  })
})

describe("canMovePage", () => {
  it("allows a move into another folder or to the root", () => {
    expect(canMovePage(all, "task", "vbl")).toBe(true)
    expect(canMovePage(all, "task", null)).toBe(true)
  })

  it("refuses the item itself, its descendants, its own folder and a page", () => {
    expect(canMovePage(all, "vbl", "vbl")).toBe(false)
    expect(canMovePage(all, "vbl", "akyou")).toBe(false)
    expect(canMovePage(all, "task", "akyou")).toBe(false)
    expect(canMovePage(all, "inbox", null)).toBe(false)
    expect(canMovePage(all, "inbox", "intro")).toBe(false)
    expect(canMovePage(all, "missing", "vbl")).toBe(false)
  })
})

describe("dropUpdate", () => {
  it("turns a drop on a folder or on the root area into a new parent", () => {
    expect(dropUpdate(all, "inbox", "vbl")).toEqual({ parentId: "vbl" })
    expect(dropUpdate(all, "task", ROOT_DROP_ID)).toEqual({ parentId: null })
  })

  it("is null for a drop outside any target, on itself or on a descendant", () => {
    expect(dropUpdate(all, "inbox", null)).toBeNull()
    expect(dropUpdate(all, "vbl", "vbl")).toBeNull()
    expect(dropUpdate(all, "vbl", "akyou")).toBeNull()
    expect(dropUpdate(all, "inbox", ROOT_DROP_ID)).toBeNull()
  })
})

describe("targetFolderId", () => {
  it("is the selected folder, the folder of the selected page, or the root", () => {
    expect(targetFolderId(all, "akyou")).toBe("akyou")
    expect(targetFolderId(all, "task")).toBe("akyou")
    expect(targetFolderId(all, "inbox")).toBeNull()
    expect(targetFolderId(all, null)).toBeNull()
    expect(targetFolderId(all, "missing")).toBeNull()
  })
})

describe("import helpers", () => {
  it("takes the folders from webkitRelativePath, nested folders included", () => {
    expect(importFolderPath(file("a.md", "VBL/a.md"))).toBe("VBL")
    expect(importFolderPath(file("b.md", "VBL/AKYOU/deep/b.md"))).toBe("VBL/AKYOU/deep")
  })

  it("has no folder for a file at the top or picked on its own", () => {
    expect(importFolderPath(file("c.md", "c.md"))).toBeUndefined()
    expect(importFolderPath(file("d.md"))).toBeUndefined()
  })

  it("accepts .md and .markdown files, in any case, and nothing else", () => {
    expect(isMarkdownFile(file("a.md"))).toBe(true)
    expect(isMarkdownFile(file("A.MARKDOWN"))).toBe(true)
    expect(isMarkdownFile(file("a.txt"))).toBe(false)
    expect(isMarkdownFile(file("md"))).toBe(false)
  })
})

describe("downloadFileName", () => {
  it("adds the .md extension", () => {
    expect(downloadFileName("Groceries")).toBe("Groceries.md")
  })

  it.each([
    ["VBL/AKYOU", "VBL-AKYOU.md"],
    ["Plan: 2026?", "Plan- 2026-.md"],
    ['a\\b*c"d<e>f|g', "a-b-c-d-e-f-g.md"],
    ["tab\there", "tab-here.md"],
  ])("replaces characters a file name can't hold in %s", (title, expected) => {
    expect(downloadFileName(title)).toBe(expected)
  })

  it("falls back to a name when the title is blank", () => {
    expect(downloadFileName("   ")).toBe("page.md")
  })
})

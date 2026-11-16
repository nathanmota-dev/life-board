import { describe, expect, it } from "vitest"
import { fileExtension, hasPreviewPage, newDocumentTitle, newMarkdownFile, previewKind } from "@/lib/file-board"
import { fileItemFixture } from "@/test/file-board-fixtures"

describe("previewKind", () => {
  it.each([
    ["image/png", "photo.png", "image"],
    ["application/pdf", "bill.pdf", "pdf"],
    ["text/plain", "notes.txt", "text"],
    ["text/markdown", "readme.md", "markdown"],
    ["TEXT/X-MARKDOWN", "readme", "markdown"],
    ["application/zip", "archive.pdf", "other"],
    ["constructor", "notes.md", "other"],
  ] as const)("classifies %s (%s) as %s", (mime, title, kind) => {
    expect(previewKind(fileItemFixture({ mime, title }))).toBe(kind)
  })

  it.each([
    ["application/octet-stream", "readme.md", "markdown"],
    ["", "notes.markdown", "markdown"],
    ["application/octet-stream", "SCAN.PDF", "pdf"],
    ["application/octet-stream", "data.bin", "other"],
    ["application/octet-stream", "no-extension", "other"],
  ] as const)("falls back to the extension when the mime is %j (%s)", (mime, title, kind) => {
    expect(previewKind(fileItemFixture({ mime, title }))).toBe(kind)
  })

  it("treats a file without a title as other when the mime is unknown", () => {
    expect(previewKind(fileItemFixture({ mime: "application/octet-stream", title: null }))).toBe("other")
  })
})

describe("fileExtension", () => {
  it("returns the lowercase extension, or an empty string", () => {
    expect(fileExtension(fileItemFixture({ title: "Report.PDF" }))).toBe("pdf")
    expect(fileExtension(fileItemFixture({ title: "notes" }))).toBe("")
    expect(fileExtension(fileItemFixture({ title: null }))).toBe("")
  })
})

describe("hasPreviewPage", () => {
  it("is true only for text, markdown and PDF files", () => {
    expect(hasPreviewPage(fileItemFixture({ mime: "text/plain" }))).toBe(true)
    expect(hasPreviewPage(fileItemFixture({ mime: "application/octet-stream", title: "readme.md" }))).toBe(true)
    expect(hasPreviewPage(fileItemFixture({ mime: "application/pdf", title: "a.pdf" }))).toBe(true)
    expect(hasPreviewPage(fileItemFixture({ mime: "image/jpeg", title: "a.jpg" }))).toBe(false)
    expect(hasPreviewPage(fileItemFixture({ mime: "application/zip", title: "a.zip" }))).toBe(false)
  })
})

describe("newDocumentTitle", () => {
  it("uses the base name when the board has no file with it", () => {
    expect(newDocumentTitle("Untitled", [fileItemFixture({ title: "notes.txt" })])).toBe("Untitled.md")
  })

  it("numbers the name past the ones already taken, ignoring case", () => {
    const items = [fileItemFixture({ title: "untitled.md" }), fileItemFixture({ title: "Untitled 2.md" }), fileItemFixture({ title: null })]
    expect(newDocumentTitle("Untitled", items)).toBe("Untitled 3.md")
  })
})

describe("newMarkdownFile", () => {
  it("is an empty markdown file with the given name", () => {
    const file = newMarkdownFile("Untitled.md")
    expect(file).toMatchObject({ name: "Untitled.md", type: "text/markdown", size: 0 })
  })
})

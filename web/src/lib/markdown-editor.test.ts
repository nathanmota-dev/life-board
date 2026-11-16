import { describe, expect, it } from "vitest"
import { matchFileEnding, normalizeMarkdown, roundTripsCleanly, serializeThroughEditor } from "@/lib/markdown-editor"

const everythingSupported = [
  "# Title",
  "Some **bold**, *italic*, ~~struck~~ and `code`.",
  "## Lists",
  "- one\n- two\n  - nested",
  "1. first\n2. second",
  "- [ ] to do\n- [x] done",
  "> quoted",
  "```js\nconst a = 1\n```",
  "---",
  "[a link](https://example.com)",
].join("\n\n")

describe("roundTripsCleanly", () => {
  it.each([
    ["headings, marks, lists, tasks, quotes, code, rules and links", everythingSupported],
    ["a paragraph over several lines", "line one\nline two"],
    ["a hard line break", "a  \nb"],
    ["a final newline and Windows line endings", "# Notes\r\n\r\n- milk\r\n"],
    ["an empty file", ""],
    ["blank lines kept as empty paragraphs", "a\n\n\n\n&nbsp;\n\nb"],
  ])("keeps %s as they are", (_name, markdown) => {
    expect(roundTripsCleanly(markdown)).toBe(true)
  })

  it.each([
    ["a table", "| a | b |\n|---|---|\n| 1 | 2 |"],
    ["an image", "![photo](photo.png)"],
    ["raw HTML", "<div>hi</div>"],
    ["`*` list markers", "* one\n* two"],
    ["a setext heading", "Title\n==="],
    ["a list right under a heading", "# Groceries\n- milk"],
  ])("rejects %s, which the editor would rewrite", (_name, markdown) => {
    expect(roundTripsCleanly(markdown)).toBe(false)
  })

  it("serializes what the editor would save", () => {
    expect(serializeThroughEditor("__bold__ _it_")).toBe("**bold** *it*")
  })
})

describe("normalizeMarkdown", () => {
  it("ignores line endings and blank lines at the end only", () => {
    expect(normalizeMarkdown("a\r\nb\rc\n\n")).toBe("a\nb\nc")
    expect(normalizeMarkdown("a  \n\n\nb")).toBe("a  \n\n\nb")
  })
})

describe("matchFileEnding", () => {
  it("keeps the file's final newline", () => {
    expect(matchFileEnding("# Notes", "# Old\n")).toBe("# Notes\n")
    expect(matchFileEnding("# Notes\n", "# Old")).toBe("# Notes")
  })

  it("keeps Windows line endings", () => {
    expect(matchFileEnding("# Notes\n\n- milk", "# Old\r\n")).toBe("# Notes\r\n\r\n- milk\r\n")
  })
})

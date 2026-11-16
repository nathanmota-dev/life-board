import { describe, expect, it } from "vitest"
import { isSaveShortcut } from "@/lib/keyboard"

describe("isSaveShortcut", () => {
  it("matches Ctrl+S and Cmd+S in either case", () => {
    expect(isSaveShortcut({ ctrlKey: true, metaKey: false, key: "s" })).toBe(true)
    expect(isSaveShortcut({ ctrlKey: false, metaKey: true, key: "S" })).toBe(true)
  })

  it("ignores S alone and other shortcuts", () => {
    expect(isSaveShortcut({ ctrlKey: false, metaKey: false, key: "s" })).toBe(false)
    expect(isSaveShortcut({ ctrlKey: true, metaKey: false, key: "b" })).toBe(false)
  })
})

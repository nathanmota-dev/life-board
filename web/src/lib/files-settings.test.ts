import { describe, expect, it } from "vitest"
import { uploadsDirFor } from "@/lib/files-settings"

describe("uploadsDirFor", () => {
  it.each([
    ["/mnt/linux-data/apps", "/mnt/linux-data/apps/life-board-app/uploads"],
    ["/mnt/linux-data/apps/", "/mnt/linux-data/apps/life-board-app/uploads"],
    ["/", "/life-board-app/uploads"],
    ["~/Pictures", "~/Pictures/life-board-app/uploads"],
    ["D:\\Fotos\\", "D:\\Fotos\\life-board-app\\uploads"],
  ])("puts %s uploads in %s", (baseDir, expected) => {
    expect(uploadsDirFor(baseDir)).toBe(expected)
  })
})

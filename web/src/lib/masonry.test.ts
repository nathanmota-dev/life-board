import { describe, expect, it } from "vitest"
import { distributeColumns, masonryColumns } from "@/lib/masonry"

describe("masonry", () => {
  it("fits as many columns as the width allows, at least one", () => {
    expect(masonryColumns(0)).toBe(1)
    expect(masonryColumns(360)).toBe(1)
    expect(masonryColumns(492)).toBe(2)
    expect(masonryColumns(5000)).toBe(5)
  })

  it("deals items across columns left to right", () => {
    expect(distributeColumns([1, 2, 3, 4, 5], 2)).toEqual([[1, 3, 5], [2, 4]])
    expect(distributeColumns([1], 3)).toEqual([[1], [], []])
  })
})

import { describe, expect, it } from "vitest"
import { findBoardColumn, getBoardMove, moveAcrossColumns, settleBoardLayout, toBoardLayout } from "@/lib/board"

const layout = { todo: ["a", "b", "c"], doing: ["d"], done: [] }

describe("board layout", () => {
  it("builds the layout and finds columns", () => {
    expect(toBoardLayout([{ id: "x", items: [{ key: "1" }] }], (item) => item.key)).toEqual({ x: ["1"] })
    expect(findBoardColumn(layout, "b")).toBe("todo")
    expect(findBoardColumn(layout, "done")).toBe("done")
    expect(findBoardColumn(layout, "missing")).toBeUndefined()
  })

  it("carries an item into another column at the hovered item, or at the end", () => {
    expect(moveAcrossColumns(layout, "a", "d")).toEqual({ todo: ["b", "c"], doing: ["a", "d"], done: [] })
    expect(moveAcrossColumns(layout, "a", "done")).toEqual({ todo: ["b", "c"], doing: ["d"], done: ["a"] })
    expect(moveAcrossColumns(layout, "a", "c")).toBe(layout)
    expect(moveAcrossColumns(layout, "a", null)).toBe(layout)
  })

  it("settles a drop inside a column", () => {
    expect(settleBoardLayout(layout, "a", "c").todo).toEqual(["b", "c", "a"])
    expect(settleBoardLayout(layout, "c", "todo")).toEqual(layout)
    expect(settleBoardLayout(layout, "missing", "a")).toBe(layout)
  })

  it("reports only moves that changed something", () => {
    const end = settleBoardLayout(layout, "a", "d")
    expect(getBoardMove(layout, end, "a")).toEqual({ itemId: "a", from: "todo", to: "doing", ids: ["a", "d"] })
    expect(getBoardMove(layout, settleBoardLayout(layout, "c", "a"), "c")).toEqual({ itemId: "c", from: "todo", to: "todo", ids: ["c", "a", "b"] })
    expect(getBoardMove(layout, layout, "a")).toBeNull()
    expect(getBoardMove(layout, layout, "missing")).toBeNull()
  })
})

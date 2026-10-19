import { afterEach, describe, expect, it } from "vitest"
import {
  applyProjectMove,
  daysSinceStatusChange,
  groupProjects,
  isOverWipLimit,
  needsPauseReason,
  parseWipLimit,
  readWipLimit,
  storeWipLimit,
  toBoardColumns,
  toProjectMove,
  valuesToProjectInput,
  visibleDoneProjects,
} from "@/lib/projects"
import type { Project, ProjectStatus } from "@/types/project"

const project = (id: string, status: ProjectStatus = "idea", order = 0, statusChangedAt = "2026-10-01T12:00:00.000Z"): Project => ({
  id,
  title: id,
  description: "",
  status,
  order,
  statusChangedAt,
  pauseReason: null,
  archivedAt: null,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
})

const ids = (projects: Project[]) => projects.map((p) => p.id)

afterEach(() => localStorage.clear())

describe("project columns", () => {
  const board = [project("b", "idea", 1), project("a", "idea", 0), project("x", "paused", 0)]

  it("groups projects by status in column order", () => {
    const columns = groupProjects(board)
    expect(ids(columns.idea)).toEqual(["a", "b"])
    expect(ids(columns.paused)).toEqual(["x"])
    expect(columns.done).toEqual([])
    expect(toBoardColumns(columns, false).map((column) => [column.id, ids(column.items)])).toEqual([
      ["idea", ["a", "b"]],
      ["planned", []],
      ["in_progress", []],
      ["paused", ["x"]],
      ["done", []],
    ])
  })

  it("shows only the 5 most recently finished Done projects until all are wanted", () => {
    const done = Array.from({ length: 7 }, (_, order) => project(`d${order}`, "done", order, `2026-10-0${order + 1}T00:00:00.000Z`))
    expect(ids(visibleDoneProjects(done, false))).toEqual(["d2", "d3", "d4", "d5", "d6"])
    expect(visibleDoneProjects(done, true)).toHaveLength(7)
    expect(visibleDoneProjects(done.slice(0, 5), false)).toHaveLength(5)
  })
})

describe("moving projects", () => {
  const board = [project("a", "idea", 0), project("b", "idea", 1), project("c", "idea", 2), project("x", "paused", 0)]

  it("turns a board drop into a column index, even when cards are hidden", () => {
    expect(toProjectMove(board, { itemId: "c", from: "idea", to: "idea", ids: ["c", "a", "b"] })).toEqual({ id: "c", input: { status: "idea", order: 0 } })
    expect(toProjectMove(board, { itemId: "a", from: "idea", to: "paused", ids: ["x", "a"] }).input).toEqual({ status: "paused", order: 1 })
    expect(toProjectMove(board, { itemId: "a", from: "idea", to: "done", ids: ["a"] }).input).toEqual({ status: "done", order: 0 })
    // Only "c" is visible in idea: dropping "x" before it lands before "c" in the full column.
    expect(toProjectMove(board, { itemId: "x", from: "paused", to: "idea", ids: ["x", "c"] }).input).toEqual({ status: "idea", order: 2 })
  })

  it("asks for a pause reason only when entering Paused without one", () => {
    expect(needsPauseReason(board, { id: "a", input: { status: "paused", order: 0 } })).toBe(true)
    expect(needsPauseReason(board, { id: "a", input: { status: "paused", order: 0, pauseReason: null } })).toBe(false)
    expect(needsPauseReason(board, { id: "x", input: { status: "paused", order: 1 } })).toBe(false)
    expect(needsPauseReason(board, { id: "a", input: { status: "done", order: 0 } })).toBe(false)
  })

  it("applies a move locally, renumbering both columns", () => {
    const now = new Date("2026-10-19T10:00:00.000Z")
    const next = applyProjectMove(board, "b", { status: "paused", order: 0, pauseReason: "Busy" }, now)
    expect(next.map((p) => [p.id, p.status, p.order])).toEqual([
      ["a", "idea", 0],
      ["c", "idea", 1],
      ["b", "paused", 0],
      ["x", "paused", 1],
    ])
    expect(next.find((p) => p.id === "b")).toMatchObject({ pauseReason: "Busy", statusChangedAt: now.toISOString() })
    expect(applyProjectMove(board, "a", { status: "idea", order: 9 }).map((p) => [p.id, p.order]).slice(0, 3)).toEqual([["b", 0], ["c", 1], ["a", 2]])
    expect(applyProjectMove(board, "missing", { status: "idea", order: 0 })).toBe(board)
  })
})

describe("project helpers", () => {
  it("counts whole days since the last status change", () => {
    const changed = project("a", "idea", 0, new Date(2026, 9, 15, 23, 0).toISOString())
    expect(daysSinceStatusChange(changed, new Date(2026, 9, 15, 23, 30))).toBe(0)
    expect(daysSinceStatusChange(changed, new Date(2026, 9, 18, 1, 0))).toBe(3)
  })

  it("handles the WIP limit", () => {
    expect(isOverWipLimit(4, 3)).toBe(true)
    expect(isOverWipLimit(3, 3)).toBe(false)
    expect(isOverWipLimit(10, null)).toBe(false)
    expect(parseWipLimit(null)).toBe(3)
    expect(parseWipLimit("5")).toBe(5)
    expect(parseWipLimit("off")).toBeNull()
    expect(readWipLimit()).toBe(3)
    storeWipLimit(null)
    expect(readWipLimit()).toBeNull()
    storeWipLimit(2)
    expect(readWipLimit()).toBe(2)
  })

  it("sends the pause reason only for paused projects", () => {
    expect(valuesToProjectInput({ title: " A ", description: "", status: "paused", pauseReason: " " })).toEqual({ title: "A", description: "", status: "paused", pauseReason: null })
    expect(valuesToProjectInput({ title: "A", description: "", status: "idea", pauseReason: "x" })).toEqual({ title: "A", description: "", status: "idea" })
  })
})

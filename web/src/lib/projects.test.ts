import { describe, expect, it } from "vitest"
import { moveProject } from "@/lib/projects"
import type { Project } from "@/types/project"

const project = (id: string): Project => ({
  id,
  title: id,
  description: "",
  status: "idea",
  order: 0,
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
})

describe("moveProject", () => {
  const list = ["a", "b", "c"].map(project)

  it("moves the dragged project onto the target's position", () => {
    expect(moveProject(list, "a", "c")?.map((p) => p.id)).toEqual(["b", "c", "a"])
    expect(moveProject(list, "c", "a")?.map((p) => p.id)).toEqual(["c", "a", "b"])
  })

  it("returns null when nothing moved", () => {
    expect(moveProject(list, "a", "a")).toBeNull()
    expect(moveProject(list, "a", null)).toBeNull()
    expect(moveProject(list, "x", "a")).toBeNull()
  })
})

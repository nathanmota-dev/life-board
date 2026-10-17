import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { calendarEvents, goals, tasks, thoughts } from "../db/schema"
import { createTestDb } from "../test/create-test-app"
import { LinksService } from "./links.service"

let ctx: Awaited<ReturnType<typeof createTestDb>>
let service: LinksService

beforeEach(async () => {
  ctx = await createTestDb()
  service = new LinksService(ctx.db)
  await ctx.db.insert(tasks).values([
    { id: "t1", title: "Write report", linkedThoughtIds: ["th1"] },
    { id: "t2", title: "Ship it", status: "done", linkedThoughtIds: ["th1"] },
    { id: "t3", title: "Deleted", linkedThoughtIds: ["th1"], deletedAt: new Date() },
  ])
  await ctx.db.insert(thoughts).values([
    { id: "th1", title: "Report idea", linkedTaskIds: ["t1"] },
    { id: "th2", body: "<p>An <b>untitled</b> note</p>", linkedTaskIds: ["t1"] },
    { id: "th3", body: "", linkedTaskIds: ["t1"] },
  ])
  await ctx.db.insert(calendarEvents).values({
    id: "e1",
    title: "Review",
    startAt: new Date(2026, 9, 17, 10),
    endAt: new Date(2026, 9, 17, 11),
    linkedTaskIds: ["t1"],
    linkedThoughtIds: ["th1"],
  })
  await ctx.db.insert(goals).values({ id: "g1", title: "Get promoted", linkedTaskIds: ["t1"] })
})
afterEach(() => ctx.cleanup())

describe("LinksService", () => {
  it("resolves ids from every module and skips deleted ones", async () => {
    const links = await service.resolve({ taskIds: ["t1", "t3"], thoughtIds: ["th1"], calendarIds: ["e1"], goalIds: ["g1"] })

    expect(links.map((link) => `${link.moduleId}:${link.entity.id}`)).toEqual([
      "tasks:t1",
      "thoughts:th1",
      "calendar:e1",
      "goals:g1",
    ])
    expect(await service.resolve({ taskIds: [], thoughtIds: [], calendarIds: [], goalIds: [] })).toEqual([])
  })

  it("finds what links to a thought", async () => {
    const backlinks = await service.backlinks({ kind: "thought", id: "th1" })

    expect(backlinks).toEqual([
      { source: "tasks", sourceId: "t1", label: "Write report", meta: "none" },
      { source: "tasks", sourceId: "t2", label: "Ship it", meta: "done" },
      { source: "calendar", sourceId: "e1", label: "Review", meta: expect.any(String) },
    ])
  })

  it("finds what links to a task, labelling untitled thoughts from their body", async () => {
    const backlinks = await service.backlinks({ kind: "task", id: "t1" })

    expect(backlinks.map((link) => [link.source, link.label])).toEqual([
      ["thoughts", "Report idea"],
      ["thoughts", "An untitled note"],
      ["thoughts", "(untitled thought)"],
      ["calendar", "Review"],
      ["goals", "Get promoted"],
    ])
  })
})

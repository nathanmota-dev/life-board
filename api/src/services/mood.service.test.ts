import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestDb } from "../test/create-test-app"
import { toDayKey } from "./date.service"
import { NotFoundError } from "./errors"
import { MoodService } from "./mood.service"

let ctx: Awaited<ReturnType<typeof createTestDb>>
let service: MoodService

beforeEach(async () => {
  ctx = await createTestDb()
  service = new MoodService(ctx.db)
})
afterEach(() => ctx.cleanup())

describe("MoodService", () => {
  it("keeps a single entry per day, updating it on re-submit", async () => {
    const first = await service.upsert({ score: 2, note: "meh" })
    expect(first).toMatchObject({ created: true, entry: { day: toDayKey(), score: 2, note: "meh" } })

    const second = await service.upsert({ score: 4, linkedTaskIds: ["t1"] })
    expect(second).toMatchObject({ created: false, entry: { id: first.entry.id, score: 4, note: null, linkedTaskIds: ["t1"] } })

    await service.upsert({ score: 5, day: "2026-01-01" })
    expect((await service.list(10)).map((entry) => entry.day)).toEqual([toDayKey(), "2026-01-01"])
    expect(await service.list(1)).toHaveLength(1)
  })

  it("reports today's entry and when the next day starts", async () => {
    const now = new Date(2026, 9, 17, 15, 30)
    expect(await service.today(now)).toEqual({
      day: "2026-10-17",
      entry: null,
      nextAvailableAt: new Date(2026, 9, 18).toISOString(),
    })

    await service.upsert({ score: 3, day: "2026-10-17" })
    expect((await service.today(now)).entry?.score).toBe(3)
    expect((await service.today()).day).toBe(toDayKey())
  })

  it("deletes entries", async () => {
    const { entry } = await service.upsert({ score: 3 })
    await service.remove(entry.id)

    expect(await service.list(10)).toEqual([])
    await expect(service.remove(entry.id)).rejects.toBeInstanceOf(NotFoundError)
  })
})

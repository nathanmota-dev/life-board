import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestDb } from "../test/create-test-app"
import { CalendarService } from "./calendar.service"
import { BadRequestError, NotFoundError } from "./errors"

let ctx: Awaited<ReturnType<typeof createTestDb>>
let service: CalendarService

beforeEach(async () => {
  ctx = await createTestDb()
  service = new CalendarService(ctx.db)
})
afterEach(() => ctx.cleanup())

const at = (day: number, hour: number) => new Date(2026, 9, day, hour)

describe("CalendarService", () => {
  it("lists events by start time within an optional range", async () => {
    await service.create({ title: "Late", startAt: at(20, 9), endAt: at(20, 10) })
    await service.create({ title: "Early", startAt: at(10, 9), endAt: at(10, 10), allDay: true })

    expect((await service.list({ limit: 10 })).map((e) => e.title)).toEqual(["Early", "Late"])
    expect((await service.list({ limit: 10, from: at(15, 0) })).map((e) => e.title)).toEqual(["Late"])
    expect((await service.list({ limit: 10, to: at(15, 0) })).map((e) => e.title)).toEqual(["Early"])
  })

  it("rejects events that end before they start, on create and update", async () => {
    await expect(service.create({ title: "Bad", startAt: at(10, 10), endAt: at(10, 9) })).rejects.toBeInstanceOf(
      BadRequestError,
    )

    const event = await service.create({ title: "Ok", startAt: at(10, 9), endAt: at(10, 10) })
    await expect(service.update(event.id, { endAt: at(10, 8) })).rejects.toBeInstanceOf(BadRequestError)
    expect((await service.update(event.id, { title: "Moved", startAt: at(10, 8) })).title).toBe("Moved")
  })

  it("soft deletes events", async () => {
    const event = await service.create({ title: "Event", startAt: at(10, 9), endAt: at(10, 10) })
    await service.remove(event.id)

    expect(await service.list({ limit: 10 })).toEqual([])
    await expect(service.remove(event.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.update(event.id, { title: "x" })).rejects.toBeInstanceOf(NotFoundError)
  })
})

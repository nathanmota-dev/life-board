import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { createTestDb } from "../test/create-test-app"
import { toDayKey } from "./date.service"
import { BadRequestError, NotFoundError } from "./errors"
import { getStreak, HabitsService } from "./habits.service"

let ctx: Awaited<ReturnType<typeof createTestDb>>
let service: HabitsService

beforeEach(async () => {
  ctx = await createTestDb()
  service = new HabitsService(ctx.db)
})
afterEach(() => ctx.cleanup())

describe("getStreak", () => {
  const today = new Date(2026, 9, 17)

  it("counts consecutive days, ignoring an unfinished today", () => {
    const days = new Set(["2026-10-14", "2026-10-15", "2026-10-16"])
    expect(getStreak(days, today)).toBe(3)
    expect(getStreak(new Set([...days, "2026-10-17"]), today)).toBe(4)
  })

  it("breaks on a missed day", () => {
    expect(getStreak(new Set(["2026-10-14", "2026-10-16"]), today)).toBe(1)
    expect(getStreak(new Set(), today)).toBe(0)
    expect(getStreak(new Set([toDayKey()]))).toBe(1)
  })
})

describe("HabitsService", () => {
  it("logs progress, never going below zero", async () => {
    const habit = await service.create({ name: "Water", target: 8, unit: "glasses" })

    expect((await service.log(habit.id, { delta: 1 })).count).toBe(1)
    expect((await service.log(habit.id, { delta: 2 })).count).toBe(3)
    expect((await service.log(habit.id, { delta: -10 })).count).toBe(0)
    expect((await service.log(habit.id, { delta: -1, day: "2026-01-01" })).count).toBe(0)
  })

  it("summarizes today's count, completion and streak", async () => {
    const today = new Date(2026, 9, 17, 12)
    const water = await service.create({ name: "Water", target: 2 })
    const gym = await service.create({ name: "Gym", target: 1 })
    await service.log(water.id, { delta: 2, day: "2026-10-15" })
    await service.log(water.id, { delta: 3, day: "2026-10-16" })
    await service.log(water.id, { delta: 1, day: "2026-10-17" })
    await service.log(gym.id, { delta: 1, day: "2026-10-17" })

    const [waterSummary, gymSummary] = await service.list(today)

    expect(waterSummary).toMatchObject({ name: "Water", unit: "times", todayCount: 1, doneToday: false, streak: 2 })
    expect(gymSummary).toMatchObject({ todayCount: 1, doneToday: true, streak: 1 })
  })

  it("returns logs filtered by day range and habit", async () => {
    const water = await service.create({ name: "Water", target: 2 })
    const gym = await service.create({ name: "Gym", target: 1 })
    await service.log(water.id, { delta: 1, day: "2026-10-01" })
    await service.log(water.id, { delta: 1, day: "2026-10-10" })
    await service.log(gym.id, { delta: 1, day: "2026-10-10" })

    expect(await service.logs({})).toHaveLength(3)
    expect(await service.logs({ from: "2026-10-05", to: "2026-10-31", habitId: water.id })).toEqual([
      { habitId: water.id, day: "2026-10-10", count: 1, target: 2 },
    ])
  })

  it("updates and soft deletes habits", async () => {
    expect(await service.list()).toEqual([])
    const habit = await service.create({ name: "Read", target: 10, unit: "pages" })

    expect((await service.update(habit.id, { target: 20 })).target).toBe(20)

    await service.remove(habit.id)
    expect(await service.list()).toEqual([])
    await expect(service.update(habit.id, { target: 1 })).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.remove(habit.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(service.log(habit.id, { delta: 1 })).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe("custom habit goals", () => {
  it("persists customization and completes 3000 ml in six 500 ml check-ins", async () => {
    const habit = await service.create({ name: "Water", emoji: "🥤", unit: "ml", target: 3000, step: 500 })
    for (let index = 1; index <= 6; index++) {
      expect((await service.log(habit.id, { delta: habit.step })).count).toBe(index * 500)
      expect((await service.list())[0].doneToday).toBe(index === 6)
    }
    expect((await service.list())[0]).toMatchObject({ emoji: "🥤", step: 500, todayCount: 3000, streak: 1 })
    await service.log(habit.id, { delta: -500 })
    expect((await service.list())[0]).toMatchObject({ todayCount: 2500, doneToday: false })
    await service.log(habit.id, { delta: 1000 })
    expect((await service.list())[0]).toMatchObject({ todayCount: 3500, doneToday: true })
  })

  it("preserves completed past goals when the daily target changes", async () => {
    const habit = await service.create({ name: "Read", target: 10 })
    await service.log(habit.id, { delta: 10, day: "2026-10-16" })
    await service.update(habit.id, { target: 20, emoji: "📚", step: 5 })
    expect((await service.list(new Date(2026, 9, 17, 12)))[0]).toMatchObject({ target: 20, emoji: "📚", step: 5, streak: 1 })
    expect(await service.logs({ habitId: habit.id })).toEqual([{ habitId: habit.id, day: "2026-10-16", count: 10, target: 10 }])
    await service.log(habit.id, { delta: 5, day: "2026-10-16" })
    expect((await service.logs({ habitId: habit.id }))[0]).toMatchObject({ count: 15, target: 10 })
  })
})

describe("editing today's goal", () => {
  it("updates today's snapshot so the new goal remains correct tomorrow", async () => {
    const habit = await service.create({ name: "Read", target: 10 })
    await service.log(habit.id, { delta: 10 })
    await service.update(habit.id, { target: 20 })
    expect((await service.logs({ habitId: habit.id }))[0]).toMatchObject({ count: 10, target: 20 })
    expect((await service.list())[0].doneToday).toBe(false)
  })
})

describe("editing a past day", () => {
  it("replaces the day's count and keeps the goal recorded at the time", async () => {
    const habit = await service.create({ name: "Water", target: 8 })
    await service.log(habit.id, { delta: 3, day: "2026-10-16" })
    await service.update(habit.id, { target: 10 })

    expect(await service.setLog(habit.id, "2026-10-16", { count: 8 })).toEqual({ habitId: habit.id, day: "2026-10-16", count: 8 })
    expect(await service.setLog(habit.id, "2026-10-15", { count: 2 })).toMatchObject({ count: 2 })
    expect(await service.logs({ habitId: habit.id })).toEqual([
      { habitId: habit.id, day: "2026-10-15", count: 2, target: 10 },
      { habitId: habit.id, day: "2026-10-16", count: 8, target: 8 },
    ])
    expect((await service.setLog(habit.id, "2026-10-16", { count: 0 })).count).toBe(0)
  })

  it("updates today's count with the current goal", async () => {
    const habit = await service.create({ name: "Read", target: 10 })
    await service.setLog(habit.id, toDayKey(), { count: 12 })
    expect((await service.list())[0]).toMatchObject({ todayCount: 12, doneToday: true, streak: 1 })
  })

  it("rejects future days and unknown habits", async () => {
    const habit = await service.create({ name: "Read", target: 10 })
    const tomorrow = toDayKey(new Date(Date.now() + 24 * 60 * 60 * 1000))
    await expect(service.setLog(habit.id, tomorrow, { count: 1 })).rejects.toBeInstanceOf(BadRequestError)
    await expect(service.log(habit.id, { delta: 1, day: tomorrow })).rejects.toBeInstanceOf(BadRequestError)
    await expect(service.setLog("missing", "2026-10-16", { count: 1 })).rejects.toBeInstanceOf(NotFoundError)
  })
})

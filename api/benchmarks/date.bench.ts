import { describe, test } from "vitest"
import { addDays, fromDayKey, startOfWeek, toDayKey } from "../src/services/date.service"

const benchmarkOptions = { time: 1_000, iterations: 20, warmupTime: 250, warmupIterations: 10 }
const start = new Date(2026, 0, 1, 12)
const dates = Array.from({ length: 10_000 }, (_, index) => addDays(start, index % 730))
const dayKeys = dates.map((date) => toDayKey(date))

describe("date helpers", () => {
  test("10000 day key conversions", async ({ bench }) => {
    await bench("10000 day key conversions", () => {
      for (const date of dates) toDayKey(date)
    }).run(benchmarkOptions)
  })

  test("10000 day key round trips with week start", async ({ bench }) => {
    await bench("10000 day key round trips with week start", () => {
      for (const day of dayKeys) startOfWeek(fromDayKey(day))
    }).run(benchmarkOptions)
  })
})

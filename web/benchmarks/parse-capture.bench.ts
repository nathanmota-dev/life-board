import { describe, test } from "vitest"
import { parseCapture } from "@/lib/parse-capture"

const benchmarkOptions = { time: 1_000, iterations: 20, warmupTime: 250, warmupIterations: 10 }
const now = new Date(2026, 9, 21, 12)
const captures = Array.from({ length: 1_000 }, (_, index) => [
  `Pagar a conta de luz ${index} amanhã !alta #casa`,
  `Review pull request ${index} friday !low #work #github`,
  `Comprar ${index} coisas 25/12 #mercado`,
  `Plain note number ${index} without any tokens at all`,
][index % 4])

describe("quick capture parsing", () => {
  test("1000 captures with dates, priorities and tags", async ({ bench }) => {
    await bench("1000 captures with dates, priorities and tags", () => {
      for (const text of captures) parseCapture(text, "task", { now })
    }).run(benchmarkOptions)
  })
})

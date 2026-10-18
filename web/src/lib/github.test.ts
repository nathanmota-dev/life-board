import { describe, expect, it } from "vitest"
import { contributionBlockSize, contributionWeeks } from "@/lib/github"

describe("contributionWeeks", () => {
  it("counts the partial first week", () => {
    // 2026-10-17 is a Saturday, so two days span two week columns.
    expect(contributionWeeks([{ date: "2026-10-17" }, { date: "2026-10-18" }])).toBe(2)
  })
})

describe("contributionBlockSize", () => {
  it("fills the available width", () => {
    expect(contributionBlockSize(53 * 15, 53)).toBe(12)
  })

  it("stays readable on narrow and very wide containers", () => {
    expect(contributionBlockSize(200, 53)).toBe(8)
    expect(contributionBlockSize(5000, 53)).toBe(20)
  })
})

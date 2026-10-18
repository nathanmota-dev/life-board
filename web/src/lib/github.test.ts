import { describe, expect, it } from "vitest"
import { toDayKey } from "@/lib/dates"
import { contributionGrid, contributionLevelColor, contributionMonthLabels, contributionWeeks } from "@/lib/github"

describe("contributionWeeks", () => {
  it("counts the partial first week", () => {
    // 2026-10-17 is a Saturday, so two days span two week columns.
    expect(contributionWeeks([{ date: "2026-10-17" }, { date: "2026-10-18" }])).toBe(2)
  })
})

describe("contributionGrid", () => {
  it("pads the first week so each column starts on Sunday", () => {
    const weeks = contributionGrid([
      { date: "2026-10-17", count: 1, level: 1 },
      { date: "2026-10-18", count: 0, level: 0 },
    ])
    expect(weeks).toHaveLength(2)
    expect(weeks[0].slice(0, 6)).toEqual(Array(6).fill(null))
    expect(weeks[0][6]?.date).toBe("2026-10-17")
    expect(weeks[1][0]?.date).toBe("2026-10-18")
    expect(weeks[1].slice(1)).toEqual(Array(6).fill(null))
  })
})

describe("contributionMonthLabels", () => {
  it("labels the first week of each month and skips months too close to the next", () => {
    const days = Array.from({ length: 70 }, (_, index) => {
      const date = new Date(2026, 8, 27 + index)
      return { date: toDayKey(date), count: 0, level: 0 }
    })
    // Sep 27 is a Sunday: Sep only gets one week before Oct, so its label is dropped.
    expect(contributionMonthLabels(contributionGrid(days))).toEqual([
      { week: 1, label: "Oct" },
      { week: 5, label: "Nov" },
    ])
  })
})

describe("contributionLevelColor", () => {
  it("leaves empty days muted and blends active days toward the accent", () => {
    expect(contributionLevelColor(0)).toBe("var(--muted)")
    expect(contributionLevelColor(4)).toContain("var(--primary) 100%")
    expect(contributionLevelColor(9)).toContain("var(--primary) 100%")
  })
})

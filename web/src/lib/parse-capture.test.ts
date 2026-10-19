import { describe, expect, it } from "vitest"
import { parseCapture } from "@/lib/parse-capture"

// Monday, October 19th 2026, mid-afternoon.
const now = new Date(2026, 9, 19, 15, 30)
const parse = (text: string, kind: "task" | "thought" = "task", ignored?: string[]) =>
  parseCapture(text, kind, { now, ignored: ignored ? new Set(ignored) : undefined })

describe("parseCapture", () => {
  it("parses the Portuguese example from the issue", () => {
    expect(parse("pagar luz amanhã #casa !alta")).toEqual({
      title: "pagar luz",
      tags: ["casa"],
      priority: "high",
      dueDay: "2026-10-20",
      tokens: [
        { kind: "due", text: "amanhã", value: "2026-10-20", start: 10, end: 16 },
        { kind: "tag", text: "#casa", value: "casa", start: 17, end: 22 },
        { kind: "priority", text: "!alta", value: "high", start: 23, end: 28 },
      ],
    })
  })

  it("saves text without tokens unchanged", () => {
    const parsed = parse("  Call the bank about the card  ")
    expect(parsed).toEqual({ title: "Call the bank about the card", tags: [], priority: null, dueDay: null, tokens: [] })
  })

  it("reads tags, lowercased and without duplicates", () => {
    const parsed = parse("Plan trip #Travel #family #travel")
    expect(parsed.title).toBe("Plan trip")
    expect(parsed.tags).toEqual(["travel", "family"])
    expect(parsed.tokens).toHaveLength(3)
  })

  it("ignores a bare # and words that only contain one", () => {
    expect(parse("Fix issue # and C#").tags).toEqual([])
  })

  it.each([
    ["!high", "high"],
    ["!alta", "high"],
    ["!medium", "medium"],
    ["!media", "medium"],
    ["!média", "medium"],
    ["!low", "low"],
    ["!baixa", "low"],
    ["!HIGH", "high"],
  ])("maps %s to %s priority", (token, priority) => {
    const parsed = parse(`Review budget ${token}`)
    expect(parsed.priority).toBe(priority)
    expect(parsed.title).toBe("Review budget")
  })

  it("keeps unknown priorities and only the first priority as tokens", () => {
    const parsed = parse("Ship it !urgent !low !high")
    expect(parsed.priority).toBe("low")
    expect(parsed.title).toBe("Ship it !urgent !high")
  })

  it.each([
    ["today", "2026-10-19"],
    ["hoje", "2026-10-19"],
    ["Today", "2026-10-19"],
    ["tomorrow", "2026-10-20"],
    ["amanhã", "2026-10-20"],
    ["amanha", "2026-10-20"],
  ])("maps %s to its due day", (word, day) => {
    const parsed = parse(`Water plants ${word}`)
    expect(parsed.dueDay).toBe(day)
    expect(parsed.title).toBe("Water plants")
  })

  it.each([
    ["sunday", "2026-10-25"],
    ["tuesday", "2026-10-20"],
    ["wednesday", "2026-10-21"],
    ["thursday", "2026-10-22"],
    ["friday", "2026-10-23"],
    ["saturday", "2026-10-24"],
    ["domingo", "2026-10-25"],
    ["terça", "2026-10-20"],
    ["terca", "2026-10-20"],
    ["quarta", "2026-10-21"],
    ["quinta-feira", "2026-10-22"],
    ["sexta", "2026-10-23"],
    ["sábado", "2026-10-24"],
    ["sabado", "2026-10-24"],
  ])("maps the weekday %s to its next occurrence", (word, day) => {
    expect(parse(`Gym ${word}`).dueDay).toBe(day)
  })

  it("rolls today's weekday over to the next week", () => {
    expect(parse("Standup monday").dueDay).toBe("2026-10-26")
    expect(parse("Reunião segunda").dueDay).toBe("2026-10-26")
    expect(parse("Reunião segunda-feira").dueDay).toBe("2026-10-26")
  })

  it("rolls weekdays over the end of the month and year", () => {
    const parsed = parseCapture("Party friday", "task", { now: new Date(2026, 11, 30) })
    expect(parsed.dueDay).toBe("2027-01-01")
  })

  it("reads dd/mm dates this year, or next year once they have passed", () => {
    expect(parse("Dentist 25/12").dueDay).toBe("2026-12-25")
    expect(parse("Dentist 19/10").dueDay).toBe("2026-10-19")
    expect(parse("Dentist 5/1").dueDay).toBe("2027-01-05")
    expect(parse("Dentist 01/03").dueDay).toBe("2027-03-01")
  })

  it("leaves invalid dd/mm dates in the title", () => {
    expect(parse("Report 31/02")).toMatchObject({ title: "Report 31/02", dueDay: null })
    expect(parse("Report 12/13")).toMatchObject({ title: "Report 12/13", dueDay: null })
    expect(parse("Score 3/4/5")).toMatchObject({ title: "Score 3/4/5", dueDay: null })
  })

  it("only takes the first due date as a token", () => {
    const parsed = parse("Move today tomorrow")
    expect(parsed.dueDay).toBe("2026-10-19")
    expect(parsed.title).toBe("Move tomorrow")
  })

  it("keeps ignored tokens as literal text", () => {
    const parsed = parse("Watch today show #tv", "task", ["today"])
    expect(parsed).toMatchObject({ title: "Watch today show", dueDay: null, tags: ["tv"] })
    expect(parse("Pagar Amanhã", "task", ["amanhã"]).title).toBe("Pagar Amanhã")
  })

  it("keeps the raw text for thoughts and only reads tags", () => {
    const parsed = parse("ideia para amanhã !alta #produto", "thought")
    expect(parsed).toEqual({
      title: "ideia para amanhã !alta #produto",
      tags: ["produto"],
      priority: null,
      dueDay: null,
      tokens: [{ kind: "tag", text: "#produto", value: "produto", start: 24, end: 32 }],
    })
  })

  it("keeps the raw text as the title when it is only tokens", () => {
    expect(parse("#casa amanhã").title).toBe("#casa amanhã")
  })

  it("uses the current date by default", () => {
    expect(parseCapture("Call mom").title).toBe("Call mom")
  })
})

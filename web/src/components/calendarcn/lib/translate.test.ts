import { describe, expect, it } from "vitest"
import en from "../../../../../public/i18n/en.json"
import pt from "../../../../../public/i18n/pt.json"
import { EVENT_COLORS } from "@/components/calendarcn/lib/event-utils"
import { modShortcut, t } from "@/components/calendarcn/lib/translate"
import { i18n } from "@/lib/i18n"

const sources = import.meta.glob(["../**/*.ts", "../**/*.tsx", "!../**/*.test.*"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>

const VIEWS = ["day", "week", "month", "year", "agenda"]
const HISTORY_ACTIONS = ["create", "edit", "delete", "cut", "duplicate", "paste"]

/** Keys built at runtime, by the template each file uses */
const DYNAMIC_KEYS: Record<string, string[]> = {
  "colors.${color}": EVENT_COLORS.map((color) => `colors.${color}`),
  "views.${view}": VIEWS.map((view) => `views.${view}`),
  "period.${view}": VIEWS.map((view) => `period.${view}`),
  "notice.${action}": ["delete", "cut", "copy"].map((action) => `notice.${action}`),
  "group.notice.${action}": ["delete", "cut", "copy"].map((action) => `group.notice.${action}`),
  "group.done.${action}": ["delete", "cut", "copy", "duplicate", "paste", "move"].map((action) => `group.done.${action}`),
  "history.done.${action}": [...HISTORY_ACTIONS, "copy"].map((action) => `history.done.${action}`),
  "history.bare.${direction}": ["history.bare.undo", "history.bare.redo"],
  "history.${direction}.${entry.action}": ["undo", "redo"].flatMap((direction) =>
    HISTORY_ACTIONS.map((action) => `history.${direction}.${action}`),
  ),
}

function usedKeys() {
  const keys = new Set<string>()
  for (const source of Object.values(sources)) {
    for (const match of source.matchAll(/\bt\((["`])([^"`]+)\1/g)) {
      const key = match[2]
      const expanded = key.includes("${") ? DYNAMIC_KEYS[key] : [key]
      expect(expanded, `no expansion listed for ${key}`).toBeDefined()
      for (const each of expanded) keys.add(each)
    }
  }
  return [...keys]
}

function lookup(dictionary: object, key: string) {
  return key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], dictionary)
}

/** A key with a count may exist only in its plural forms */
function exists(dictionary: object, key: string) {
  const value = lookup(dictionary, `calendarcn.${key}`)
  if (typeof value === "string") return true
  return ["one", "other"].every((form) => typeof lookup(dictionary, `calendarcn.${key}_${form}`) === "string")
}

describe("calendar translations", () => {
  const keys = usedKeys()

  it("finds the keys the calendar uses", () => {
    expect(keys.length).toBeGreaterThan(50)
  })

  it.each([
    ["en", en],
    ["pt", pt],
  ])("has every key in %s", (_, dictionary) => {
    expect(keys.filter((key) => !exists(dictionary, key))).toEqual([])
  })

  it("reads the app's language, with counts and values", async () => {
    await i18n.changeLanguage("pt")
    expect(t("views.week")).toBe("Semana")
    expect(t("month.more", { count: 3 })).toBe("Mais 3")
    await i18n.changeLanguage("en")
    expect(t("view.days", { count: 1 })).toBe("1 day")
    expect(t("agenda.from", { time: "09:00" })).toBe("From 09:00")
  })

  it("labels shortcuts with Ctrl outside macOS", () => {
    expect(modShortcut("X")).toBe("Ctrl+X")
  })
})

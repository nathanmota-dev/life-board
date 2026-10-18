import { afterEach, describe, expect, it, vi } from "vitest"
import en from "../../../public/i18n/en.json"
import pt from "../../../public/i18n/pt.json"
import { formatDate, formatRelativeDay } from "@/lib/dates"
import { formatMoney } from "@/lib/format"
import { getGoalDomainOptions } from "@/lib/goals"
import { getLocale, i18n, LANGUAGE_STORAGE_KEY } from "@/lib/i18n"
import { getTaskStatusOptions } from "@/lib/tasks"

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.removeItem(LANGUAGE_STORAGE_KEY)
})

function mockLanguages(languages: string[]) {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(languages)
  vi.spyOn(navigator, "language", "get").mockReturnValue(languages[0])
}

function flatten(dictionary: object, prefix = ""): Record<string, string> {
  return Object.fromEntries(Object.entries(dictionary).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    return typeof value === "string" ? [[path, value]] : Object.entries(flatten(value, path))
  }))
}

describe("i18n", () => {
  it.each([
    ["en-US", "en", "en"],
    ["en-GB", "en", "en"],
    ["pt-BR", "pt", "pt-BR"],
    ["pt-PT", "pt", "pt-BR"],
  ])("detects %s without requiring a language in the URL", async (browserLanguage, language, locale) => {
    mockLanguages([browserLanguage])
    localStorage.removeItem(LANGUAGE_STORAGE_KEY)
    await i18n.changeLanguage()

    expect(i18n.resolvedLanguage).toBe(language)
    expect(getLocale()).toBe(locale)
    expect(document.documentElement.lang).toBe(locale)
  })

  it("honors a saved preference ahead of the browser language", async () => {
    mockLanguages(["en-US"])
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "pt")
    await i18n.changeLanguage()

    expect(i18n.resolvedLanguage).toBe("pt")
    expect(i18n.t("navigation.settings")).toBe("Configurações")
  })

  it("uses the first supported browser preference and falls back to English", async () => {
    mockLanguages(["fr-FR", "pt-BR", "en-US"])
    localStorage.removeItem(LANGUAGE_STORAGE_KEY)
    await i18n.changeLanguage()
    expect(i18n.resolvedLanguage).toBe("pt")

    mockLanguages(["ja-JP"])
    localStorage.setItem(LANGUAGE_STORAGE_KEY, "invalid")
    await i18n.changeLanguage()
    expect(i18n.resolvedLanguage).toBe("en")
  })

  it("updates dates, money, filter options and plurals with the selected language", async () => {
    const date = new Date(2026, 9, 18, 12)
    await i18n.changeLanguage("pt")

    expect(formatDate(date, { month: "long" })).toBe("outubro")
    expect(formatRelativeDay(date, date)).toBe("hoje")
    expect(formatMoney(123456)).toBe(new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(1234.56))
    expect(getTaskStatusOptions()).toContainEqual({ value: "today", label: "Hoje" })
    expect(getGoalDomainOptions()).toContainEqual({ value: "health", label: "Saúde" })
    expect(i18n.t("counts.task", { count: 0 })).toBe("0 tarefas")
    expect(i18n.t("counts.task", { count: 1 })).toBe("1 tarefa")
    expect(i18n.t("counts.task", { count: 2 })).toBe("2 tarefas")

    await i18n.changeLanguage("en")
    expect(formatDate(date, { month: "long" })).toBe("October")
    expect(getTaskStatusOptions()).toContainEqual({ value: "today", label: "Today" })
    expect(i18n.t("counts.task", { count: 1 })).toBe("1 task")
    expect(i18n.t("counts.task", { count: 2 })).toBe("2 tasks")
  })

  it("keeps the same keys and interpolation variables in both dictionaries", () => {
    const english = flatten(en)
    const portuguese = flatten(pt)
    expect(Object.keys(portuguese).sort()).toEqual(Object.keys(english).sort())

    for (const [key, value] of Object.entries(english)) {
      expect(portuguese[key].trim()).not.toBe("")
      expect([...portuguese[key].matchAll(/{{(.*?)}}/g)].map((match) => match[1]).sort(), key)
        .toEqual([...value.matchAll(/{{(.*?)}}/g)].map((match) => match[1]).sort())
    }
  })
})

import { addDays, startOfDay, toDayKey } from "@/lib/dates"
import type { CaptureKind, CaptureToken, ParseCaptureOptions, ParsedCapture } from "@/types/inbox"
import type { TaskPriority } from "@/types/task"

const TAG_PATTERN = /^#([\p{L}\p{N}_-]{1,40})$/u
const DAY_MONTH_PATTERN = /^(\d{1,2})\/(\d{1,2})$/

// Keys are lowercased and accent-free, so "média"/"media" and "amanhã"/"amanha" both match.
const PRIORITIES: Record<string, TaskPriority> = {
  "!high": "high",
  "!alta": "high",
  "!medium": "medium",
  "!media": "medium",
  "!low": "low",
  "!baixa": "low",
}

const RELATIVE_DAYS: Record<string, number> = { today: 0, hoje: 0, tomorrow: 1, amanha: 1 }

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
}

function normalize(word: string) {
  return word.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()
}

/** The next date (after today) that falls on `weekday`; naming today's weekday means a week from now. */
function nextWeekday(weekday: number, today: Date) {
  return addDays(today, (weekday - today.getDay() + 7) % 7 || 7)
}

/** `dd/mm` this year, or next year when that day has already passed. */
function dayMonth(day: number, month: number, today: Date) {
  for (const year of [today.getFullYear(), today.getFullYear() + 1]) {
    const date = new Date(year, month - 1, day)
    if (date.getMonth() !== month - 1 || date.getDate() !== day) return null
    if (date >= today) return date
  }
  return null
}

function parseDue(word: string, today: Date) {
  const key = normalize(word).replace(/-feira$/, "")
  if (key in RELATIVE_DAYS) return addDays(today, RELATIVE_DAYS[key])
  if (key in WEEKDAYS) return nextWeekday(WEEKDAYS[key], today)
  const match = DAY_MONTH_PATTERN.exec(word)
  return match ? dayMonth(Number(match[1]), Number(match[2]), today) : null
}

function removeTokens(text: string, tokens: CaptureToken[]) {
  let title = text
  for (const token of [...tokens].sort((a, b) => b.start - a.start)) {
    title = title.slice(0, token.start) + title.slice(token.end)
  }
  return title.replace(/\s+/g, " ").trim()
}

/**
 * Reads `#tag`, `!priority` and due-date words (PT and EN) out of a quick capture.
 * Tasks get a title without the recognized tokens; thoughts only pick up tags and keep the raw text.
 */
export function parseCapture(text: string, kind: CaptureKind = "task", { now = new Date(), ignored }: ParseCaptureOptions = {}): ParsedCapture {
  const today = startOfDay(now)
  const tokens: CaptureToken[] = []
  const tags: string[] = []
  let priority: TaskPriority | null = null
  let dueDay: string | null = null

  for (const match of text.matchAll(/\S+/g)) {
    const word = match[0]
    if (ignored?.has(word.toLowerCase())) continue
    const at = { text: word, start: match.index, end: match.index + word.length }
    const tag = TAG_PATTERN.exec(word)?.[1].toLowerCase()

    if (tag) {
      if (!tags.includes(tag)) tags.push(tag)
      tokens.push({ kind: "tag", value: tag, ...at })
    } else if (kind === "thought") {
      continue
    } else if (!priority && normalize(word) in PRIORITIES) {
      priority = PRIORITIES[normalize(word)]
      tokens.push({ kind: "priority", value: priority, ...at })
    } else if (!dueDay) {
      const due = parseDue(word, today)
      if (due) {
        dueDay = toDayKey(due)
        tokens.push({ kind: "due", value: dueDay, ...at })
      }
    }
  }

  const title = kind === "thought" ? text.trim() : removeTokens(text, tokens)
  // A capture made only of tokens keeps its text as the title rather than saving an empty one.
  return { title: title || text.trim(), tags, priority, dueDay, tokens }
}

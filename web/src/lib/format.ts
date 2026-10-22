import { getLocale, i18n } from "@/lib/i18n"
import { ApiError } from "@/services/api-client"
import type { ErrorTranslationKey } from "@/types/i18n"

const ERROR_KEYS: Record<string, ErrorTranslationKey | undefined> = {
  not_found: "errors.not_found",
  invalid_range: "errors.invalid_range",
  invalid_token: "errors.invalid_token",
  not_connected: "errors.not_connected",
  sync_failed: "errors.sync_failed",
  github_unavailable: "errors.github_unavailable",
  invalid_order: "errors.invalid_order",
  focus_limit: "errors.focus_limit",
  validation_error: "errors.validation_error",
  bad_request: "errors.bad_request",
  request_failed: "errors.request_failed",
  internal_error: "errors.internal_error",
  relative_dir: "errors.relative_dir",
  invalid_dir: "errors.invalid_dir",
  move_failed: "errors.move_failed",
}

export function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB"]
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024)))
  const value = bytes / 1024 ** exponent
  const digits = exponent === 0 ? 0 : 1
  return `${new Intl.NumberFormat(getLocale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)} ${units[exponent]}`
}

export function formatMoney(cents: number, currency = "BRL") {
  return new Intl.NumberFormat(getLocale(), { style: "currency", currency }).format(cents / 100)
}

export function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/** "review_requested" → "Review requested" */
export function humanize(value: string) {
  return capitalize(value.replaceAll("_", " "))
}

/** Comma-separated input → trimmed, unique, non-empty tags. */
export function parseTags(value: string) {
  return [...new Set(value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))]
}

export function errorMessage(error: unknown) {
  const key = error instanceof ApiError ? ERROR_KEYS[error.code] : undefined
  if (key) return i18n.t(key)
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) return i18n.t("errors.network")
  return error instanceof Error ? error.message : i18n.t("common.unexpectedError")
}

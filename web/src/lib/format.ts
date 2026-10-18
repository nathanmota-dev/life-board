export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function formatBytes(bytes: number) {
  const units = ["B", "KB", "MB", "GB"]
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(Math.max(bytes, 1)) / Math.log(1024)))
  const value = bytes / 1024 ** exponent
  return `${value.toFixed(exponent === 0 ? 0 : 1)} ${units[exponent]}`
}

export function formatMoney(cents: number, currency = "BRL") {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100)
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
  return error instanceof Error ? error.message : "Something went wrong."
}

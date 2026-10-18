export const DEFAULT_ACCENT = "#FF892B"
export const ACCENT_STORAGE_KEY = "life-board-accent"

export const ACCENT_PRESETS = ["#FF892B", "#F43F5E", "#8B5CF6", "#3B82F6", "#10B981", "#171717"]

export function isHexColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value)
}

function channel(value: number) {
  const srgb = value / 255
  return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
}

export function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16))
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** White text on the accent unless the accent is very light (yellows, pastels). */
export function accentForeground(hex: string) {
  return luminance(hex) > 0.45 ? "#161616" : "#ffffff"
}

export function readStoredAccent() {
  try {
    const stored = window.localStorage.getItem(ACCENT_STORAGE_KEY)
    return stored && isHexColor(stored) ? stored : DEFAULT_ACCENT
  } catch {
    return DEFAULT_ACCENT
  }
}

/** Buttons, rings and charts all derive from these two variables (see index.css). */
export function applyAccent(hex: string, root: HTMLElement = document.documentElement) {
  root.style.setProperty("--brand", hex)
  root.style.setProperty("--brand-foreground", accentForeground(hex))
}

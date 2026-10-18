import { afterEach, describe, expect, it } from "vitest"
import { accentForeground, ACCENT_STORAGE_KEY, applyAccent, DEFAULT_ACCENT, isHexColor, readStoredAccent } from "@/lib/accent"

afterEach(() => localStorage.clear())

describe("accent", () => {
  it("validates hex colors and picks a readable foreground", () => {
    expect(isHexColor("#FF892B")).toBe(true)
    expect(isHexColor("orange")).toBe(false)
    expect(accentForeground("#FF892B")).toBe("#ffffff")
    expect(accentForeground("#FDE68A")).toBe("#161616")
  })

  it("reads the stored accent, ignoring invalid values", () => {
    expect(readStoredAccent()).toBe(DEFAULT_ACCENT)
    localStorage.setItem(ACCENT_STORAGE_KEY, "#8B5CF6")
    expect(readStoredAccent()).toBe("#8B5CF6")
    localStorage.setItem(ACCENT_STORAGE_KEY, "nope")
    expect(readStoredAccent()).toBe(DEFAULT_ACCENT)
  })

  it("writes the CSS variables everything else derives from", () => {
    const root = document.createElement("div")
    applyAccent("#3B82F6", root)
    expect(root.style.getPropertyValue("--brand")).toBe("#3B82F6")
    expect(root.style.getPropertyValue("--brand-foreground")).toBe("#ffffff")
  })
})

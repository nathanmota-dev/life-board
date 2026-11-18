import { describe, expect, it } from "vitest"
import { GOOGLE_POLL_INTERVAL_MS, googleStatusInterval, isGoogleClientId } from "@/lib/google"

describe("isGoogleClientId", () => {
  it("accepts trimmed IDs ending with the Google suffix", () => {
    expect(isGoogleClientId(" 123-abc.apps.googleusercontent.com ")).toBe(true)
    expect(isGoogleClientId(".apps.googleusercontent.com")).toBe(false)
    expect(isGoogleClientId("123-abc.example.com")).toBe(false)
    expect(isGoogleClientId("")).toBe(false)
  })
})

describe("googleStatusInterval", () => {
  it("polls only while a login is pending", () => {
    expect(googleStatusInterval(true)).toBe(GOOGLE_POLL_INTERVAL_MS)
    expect(googleStatusInterval(false)).toBe(false)
    expect(googleStatusInterval(undefined)).toBe(false)
  })
})

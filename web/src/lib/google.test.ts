import { describe, expect, it } from "vitest"
import { GOOGLE_POLL_INTERVAL_MS, googleStatusInterval, googleSyncProblem, isGoogleClientId } from "@/lib/google"
import type { GoogleStatus } from "@/types/google"

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

describe("googleSyncProblem", () => {
  const status: GoogleStatus = {
    connected: true, email: "me@gmail.com", hasCredentials: true, pending: false, reauthRequired: false, lastSyncAt: null, lastSyncError: null,
  }

  it("tells a refused authorization from a failed sync", () => {
    expect(googleSyncProblem({ ...status, connected: false, reauthRequired: true })).toBe("reauth")
    expect(googleSyncProblem({ ...status, lastSyncError: "Google Calendar could not be reached" })).toBe("error")
  })

  it("has nothing to say while the sync is fine or not in use", () => {
    expect(googleSyncProblem(status)).toBeNull()
    expect(googleSyncProblem(undefined)).toBeNull()
    expect(googleSyncProblem({ ...status, connected: false, lastSyncError: "left over" })).toBeNull()
  })
})

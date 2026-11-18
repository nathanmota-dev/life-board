import { describe, expect, it } from "vitest"
import { isAllowedExternalLink } from "./external-links"

describe("isAllowedExternalLink", () => {
  it.each([
    "https://github.com/nathanmota-dev/life-board/pull/1",
    "https://accounts.google.com/o/oauth2/v2/auth?client_id=1&state=abc",
    "https://console.cloud.google.com/apis/credentials",
  ])("accepts %s", (url) => {
    expect(isAllowedExternalLink(url)).toBe(true)
  })

  it.each([
    "https://accounts.google.com.evil.example/o/oauth2/v2/auth",
    "https://console.cloud.google.com.evil.example/",
    "https://github.com.evil.example/",
    "https://accounts.google.com/signin",
    "http://accounts.google.com/o/oauth2/v2/auth",
    "https://evil.example/https://github.com/",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "",
    undefined,
    42,
  ])("refuses %s", (url) => {
    expect(isAllowedExternalLink(url)).toBe(false)
  })
})

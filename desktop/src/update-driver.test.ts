import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
vi.mock("electron", () => ({}))
import { replaceAppImage, selectUpdate, verifyArtifact } from "./update-driver"
import { isNewStable, releaseUrl, updateStore } from "./update-state"

const directories: string[] = []
function directory() { const path = mkdtempSync(join(tmpdir(), "life-board-updater-")); directories.push(path); return path }
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { force: true, recursive: true }) })
const sha512 = createHash("sha512").update("new app").digest("base64")
const legacy = { path: "unused", sha512, releaseDate: "2026-10-20" }
const file = (name: string) => ({ url: `life-board-1.10.0-${name}`, sha512 })

describe("release validation", () => {
  it.each([
    ["1.10.0", "1.9.0", true], ["1.2.0", "1.10.0", false], ["1.9.0", "1.9.0", false],
    ["2.0.0-beta.1", "1.0.0", false], ["invalid", "1.0.0", false], ["1.0.0+build.2", "1.0.0", false],
  ])("compares stable semantic versions %s > %s", (version, installed, expected) => {
    expect(isNewStable(version, installed)).toBe(expected)
  })
  it("filters a mixed feed to exactly the installed format and architecture", () => {
    const info = { version: "1.10.0", files: [file("arm64.deb"), file("x86_64.AppImage"), file("x64.deb")] }
    expect(selectUpdate({ ...legacy, ...info }, "deb", "x64").files).toEqual([file("x64.deb")])
    expect(selectUpdate({ ...legacy, ...info }, "AppImage", "x64").files).toEqual([file("x86_64.AppImage")])
    expect(selectUpdate({ ...legacy, ...info }, "deb", "arm64").files).toEqual([file("arm64.deb")])
  })
  it.each([
    { version: "2.0.0-beta.1", files: [file("x64.deb")] },
    { version: "2.0.0", files: [file("arm64.deb"), file("x86_64.AppImage")] },
    { version: "2.0.0", files: [{ url: "life-board-x64.deb", sha512: "bad" }] },
    { version: "nope", files: [file("x64.deb")] },
  ])("rejects invalid or incompatible metadata", (info) => {
    expect(() => selectUpdate({ ...legacy, ...info }, "deb", "x64")).toThrow("metadata")
  })

  it.each([
    ["nsis", "x64", "win-x64.exe"], ["mac", "x64", "mac-x64.zip"], ["mac", "arm64", "mac-arm64.zip"],
  ] as const)("selects only %s %s from mixed OS/architecture metadata", (format, arch, name) => {
    const files = ["mac-arm64.zip", "mac-x64.dmg", "x64.deb", "win-x64.exe", "mac-x64.zip", "win-arm64.exe"].map(file)
    expect(selectUpdate({ ...legacy, version: "1.10.0", files }, format, arch).files).toEqual([file(name)])
  })

  it.each([
    ["nsis", "x64", "win-arm64.exe"], ["nsis", "x64", "x64.exe"], ["nsis", "arm64", "win-x64.exe"],
    ["mac", "x64", "mac-arm64.zip"], ["mac", "arm64", "mac-x64.zip"], ["mac", "x64", "mac-x64.dmg"],
  ] as const)("rejects %s %s fallback to %s", (format, arch, name) => {
    expect(() => selectUpdate({ ...legacy, version: "1.10.0", files: [file(name)] }, format, arch)).toThrow("metadata")
  })
  it("restores persisted history and ignores corrupt state", () => {
    const path = directory()
    const store = updateStore(path)
    expect(store.load().lastSuccess).toBeNull()
    const saved = { ...store.load(), lastAttempt: Date.now() - 30, lastSuccess: Date.now() - 30, lastNotified: "1.10.0", nextCheck: Date.now() + 5000,
      release: { version: "1.10.0", notes: "Notes", releaseDate: null, url: releaseUrl("1.10.0") } }
    store.save(saved)
    expect(store.load()).toEqual(saved)
    writeFileSync(join(path, "updates.json"), "broken")
    expect(store.load().nextCheck).toBe(0)
  })
})

describe("artifact integrity and atomic AppImage replacement", () => {
  it("verifies hashes and preserves the stable installed filename", async () => {
    const path = directory()
    const source = join(path, "download.AppImage")
    const installed = join(path, "life-board.AppImage")
    writeFileSync(source, "new app")
    writeFileSync(installed, "old app")
    await verifyArtifact(source, sha512)
    await replaceAppImage(source, installed, sha512)
    expect(readFileSync(installed, "utf8")).toBe("new app")
  })
  it("preserves the old app on checksum failure", async () => {
    const path = directory()
    const source = join(path, "download.AppImage")
    const installed = join(path, "life-board.AppImage")
    writeFileSync(source, "corrupted")
    writeFileSync(installed, "old app")
    await expect(replaceAppImage(source, installed, sha512)).rejects.toThrow("integrity")
    expect(readFileSync(installed, "utf8")).toBe("old app")
  })
})

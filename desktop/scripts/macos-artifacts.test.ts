import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { cpSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gzipSync, gunzipSync } from "node:zlib"
import { afterEach, describe, expect, it } from "vitest"
import { parse, stringify } from "yaml"
import { BUILD_INFO, CHECKSUMS, SIGNING_INFO, checkAssets, macFiles, writeBuildInfo } from "./release-checks.mts"

const { buildBlockMap } = createRequire(import.meta.url)("app-builder-lib/out/targets/blockmap/blockmap") as {
  buildBlockMap: (input: string, compression: string, output: string) => Promise<{ sha512: string, size: number }>
}
type Arch = "x64" | "arm64"
const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
const provenance = { sourceSha: "a".repeat(40), releaseTag: null as string | null }
const names = (arch: Arch) => {
  const files = macFiles("1.0.0", arch)
  return [files.zip, files.dmg, files.blockmap, SIGNING_INFO, files.feed, BUILD_INFO]
}
const digest = (dir: string, name: string) => createHash("sha256").update(readFileSync(join(dir, name))).digest("hex")
function checksums(dir: string, arch: Arch = "x64") {
  // `shasum -a 256` output, as written by the workflow.
  writeFileSync(join(dir, CHECKSUMS), names(arch).map(name => `${digest(dir, name)}  ${name}`).join("\n") + "\n")
}
async function artifact({ arch = "x64" as Arch, signed = false, releaseTag = null as string | null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "life-board-macos-"))
  dirs.push(dir)
  const files = macFiles("1.0.0", arch)
  writeFileSync(join(dir, files.dmg), `synthetic ${arch} DMG`)
  writeFileSync(join(dir, files.zip), `synthetic ${arch} ZIP update payload`)
  // Exercise the installed electron-builder's real blockmap format.
  const info = await buildBlockMap(join(dir, files.zip), "gzip", join(dir, files.blockmap))
  writeFileSync(join(dir, files.feed), stringify({ version: "1.0.0", files: [{ url: files.zip, ...info }], path: files.zip, sha512: info.sha512 }))
  writeBuildInfo(dir, "1.0.0", `macos-${arch}`, { ...provenance, releaseTag })
  writeFileSync(join(dir, SIGNING_INFO), JSON.stringify({ schemaVersion: 1, status: signed ? "signed" : "adhoc", teamId: signed ? "ABCDE12345" : null,
    notarized: signed, cdHash: "c".repeat(40), dmgSha256: digest(dir, files.dmg), zipSha256: digest(dir, files.zip) }))
  checksums(dir, arch)
  return dir
}
const verify = (dir: string, arch: Arch = "x64") => checkAssets(dir, "1.0.0", `macos-${arch}`, provenance)
function mutate(dir: string, name: string, change: (info: Record<string, unknown>) => void) {
  const info = JSON.parse(readFileSync(join(dir, name), "utf8"))
  change(info)
  writeFileSync(join(dir, name), JSON.stringify(info))
  checksums(dir)
}

describe("macOS artifact verification", () => {
  it.each<Arch>(["x64", "arm64"])("accepts an ad-hoc %s build-only artifact with a real builder blockmap", async (arch) => {
    expect(await verify(await artifact({ arch }), arch)).toEqual([...names(arch), CHECKSUMS])
  })
  it("accepts a notarized release and rejects an ad-hoc production build", async () => {
    const expected = { ...provenance, releaseTag: "v1.0.0" }
    expect(await checkAssets(await artifact({ signed: true, releaseTag: "v1.0.0" }), "1.0.0", "macos-x64", expected)).toContain(SIGNING_INFO)
    await expect(checkAssets(await artifact({ releaseTag: "v1.0.0" }), "1.0.0", "macos-x64", expected)).rejects.toThrow("notarized Developer ID")
  })
  it.each([...names("x64"), CHECKSUMS])("rejects a missing %s", async (name) => {
    const dir = await artifact()
    rmSync(join(dir, name))
    await expect(verify(dir)).rejects.toThrow()
  })
  it("never accepts one architecture's artifact as the other", async () => {
    await expect(verify(await artifact({ arch: "arm64" }), "x64")).rejects.toThrow("missing")
    // Same files under the other architecture's names still carry their own manifest.
    const dir = await artifact({ arch: "arm64" })
    const x64 = macFiles("1.0.0", "x64")
    const arm64 = macFiles("1.0.0", "arm64")
    for (const key of ["dmg", "zip", "blockmap"] as const) cpSync(join(dir, arm64[key]), join(dir, x64[key]))
    const feed = parse(readFileSync(join(dir, x64.feed), "utf8"))
    feed.files[0].url = feed.path = x64.zip
    writeFileSync(join(dir, x64.feed), stringify(feed))
    mutate(dir, SIGNING_INFO, info => { info.dmgSha256 = digest(dir, x64.dmg); info.zipSha256 = digest(dir, x64.zip) })
    await expect(verify(dir)).rejects.toThrow("target")
  })
  it("rejects a feed that also lists the other architecture's ZIP or the DMG", async () => {
    for (const extra of [macFiles("1.0.0", "arm64").zip, macFiles("1.0.0", "x64").dmg]) {
      const dir = await artifact()
      const feed = parse(readFileSync(join(dir, "latest-mac.yml"), "utf8"))
      feed.files.push({ ...feed.files[0], url: extra })
      writeFileSync(join(dir, "latest-mac.yml"), stringify(feed))
      checksums(dir)
      await expect(verify(dir)).rejects.toThrow("must list exactly")
    }
  })
  it.each([
    ["targetOs", "linux"], ["architecture", "arm64"], ["sourceSha", "b".repeat(40)], ["version", "1.0.1"], ["releaseTag", "v1.0.0"],
  ])("rejects mismatched %s even with valid checksums", async (field, value) => {
    const dir = await artifact()
    mutate(dir, BUILD_INFO, info => { info[field] = value })
    await expect(verify(dir)).rejects.toThrow()
  })
  it.each([
    ["status", "unsigned"], ["teamId", "ABCDE12345"], ["notarized", true], ["cdHash", "invalid"], ["dmgSha256", "0".repeat(64)], ["zipSha256", "0".repeat(64)],
  ])("rejects invalid ad-hoc signing evidence: %s", async (field, value) => {
    const dir = await artifact()
    mutate(dir, SIGNING_INFO, info => { info[field] = value })
    await expect(verify(dir)).rejects.toThrow(/signing|Developer ID/)
  })
  it.each([["teamId", null], ["teamId", "lowercase1"], ["notarized", false]])("rejects a signed build with %s %j", async (field, value) => {
    const expected = { ...provenance, releaseTag: "v1.0.0" }
    const dir = await artifact({ signed: true, releaseTag: "v1.0.0" })
    mutate(dir, SIGNING_INFO, info => { info[field] = value })
    await expect(checkAssets(dir, "1.0.0", "macos-x64", expected)).rejects.toThrow("Developer ID")
  })
  it.each([null, "{}", "{", "[]"])("rejects malformed signing evidence %s", async (info) => {
    const dir = await artifact()
    writeFileSync(join(dir, SIGNING_INFO), info ?? "null")
    checksums(dir)
    await expect(verify(dir)).rejects.toThrow()
  })
  it("rejects corrupt payloads and blockmaps", async () => {
    const dir = await artifact()
    writeFileSync(join(dir, macFiles("1.0.0", "x64").zip), "SYNTHETIC x64 ZIP UPDATE PAYLOAD")
    await expect(verify(dir)).rejects.toThrow("sha512")
    const other = await artifact()
    writeFileSync(join(other, macFiles("1.0.0", "x64").blockmap), "not gzip")
    checksums(other)
    await expect(verify(other)).rejects.toThrow()
  })
  it("rejects blockmap ranges from a different ZIP even with new checksums", async () => {
    const dir = await artifact()
    const { blockmap, zip } = macFiles("1.0.0", "x64")
    const map = JSON.parse(gunzipSync(readFileSync(join(dir, blockmap))).toString())
    map.files[0].sizes[0] = statSync(join(dir, zip)).size + 1
    writeFileSync(join(dir, blockmap), gzipSync(JSON.stringify(map)))
    checksums(dir)
    await expect(verify(dir)).rejects.toThrow("does not cover")
  })
  it("refuses macOS artifacts through the legacy Linux interface", async () => {
    await expect(checkAssets(await artifact(), "1.0.0")).rejects.toThrow("missing")
  })
})

import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gzipSync, gunzipSync } from "node:zlib"
import { afterEach, describe, expect, it } from "vitest"
import { stringify } from "yaml"
import { BUILD_INFO, CHECKSUMS, SIGNING_INFO, checkAssets, windowsFiles, writeBuildInfo } from "./release-checks.mts"

const { buildBlockMap } = createRequire(import.meta.url)("app-builder-lib/out/targets/blockmap/blockmap") as {
  buildBlockMap: (input: string, compression: string, output: string) => Promise<{ sha512: string, size: number }>
}
const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
const provenance = { sourceSha: "a".repeat(40), releaseTag: null as string | null }
const files = windowsFiles("1.0.0")
const names = [files.installer, files.blockmap, SIGNING_INFO, files.feed, BUILD_INFO]
const digest = (dir: string, name: string) => createHash("sha256").update(readFileSync(join(dir, name))).digest("hex")
function checksums(dir: string) {
  writeFileSync(join(dir, CHECKSUMS), names.map(name => `${digest(dir, name)}  ${name}`).join("\r\n") + "\r\n")
}
async function artifact(signed = false, releaseTag: string | null = null) {
  const dir = mkdtempSync(join(tmpdir(), "life-board-windows-"))
  dirs.push(dir)
  writeFileSync(join(dir, files.installer), "synthetic NSIS bytes")
  // Exercise the installed electron-builder's real blockmap format.
  const info = await buildBlockMap(join(dir, files.installer), "gzip", join(dir, files.blockmap))
  writeFileSync(join(dir, files.feed), stringify({ version: "1.0.0", files: [{ url: files.installer, ...info }], path: files.installer, sha512: info.sha512 }))
  writeBuildInfo(dir, "1.0.0", "windows-x64", { ...provenance, releaseTag })
  writeFileSync(join(dir, SIGNING_INFO), JSON.stringify({ schemaVersion: 1, status: signed ? "signed" : "unsigned", publisher: signed ? "Example Publisher" : null,
    thumbprint: signed ? "A".repeat(40) : null, installerSha256: digest(dir, files.installer), executableSha256: "b".repeat(64) }))
  checksums(dir)
  return dir
}
const verify = (dir: string) => checkAssets(dir, "1.0.0", "windows-x64", provenance)
function mutate(dir: string, name: string, change: (info: Record<string, unknown>) => void) {
  const info = JSON.parse(readFileSync(join(dir, name), "utf8"))
  change(info)
  writeFileSync(join(dir, name), JSON.stringify(info))
  checksums(dir)
}

describe("Windows artifact verification", () => {
  it("accepts unsigned branch assets, a real builder blockmap and PowerShell CRLF checksums", async () => {
    expect(await verify(await artifact())).toEqual([...names, CHECKSUMS])
  })
  it("accepts a signed release and rejects an unsigned production build", async () => {
    const expected = { ...provenance, releaseTag: "v1.0.0" }
    expect(await checkAssets(await artifact(true, expected.releaseTag), "1.0.0", "windows-x64", expected)).toContain(SIGNING_INFO)
    await expect(checkAssets(await artifact(false, expected.releaseTag), "1.0.0", "windows-x64", expected)).rejects.toThrow("requires valid Authenticode")
  })
  it.each([...names, CHECKSUMS])("rejects a missing %s", async (name) => {
    const dir = await artifact()
    rmSync(join(dir, name))
    await expect(verify(dir)).rejects.toThrow()
  })
  it.each([
    ["targetOs", "linux"], ["architecture", "arm64"], ["sourceSha", "c".repeat(40)], ["version", "1.0.1"], ["releaseTag", "v1.0.0"],
  ])("rejects mismatched %s even with valid checksums", async (field, value) => {
    const dir = await artifact()
    mutate(dir, BUILD_INFO, info => { info[field] = value })
    await expect(verify(dir)).rejects.toThrow()
  })
  it.each([
    ["status", "unknown"], ["publisher", "Impersonated"], ["thumbprint", "A".repeat(40)], ["installerSha256", "0".repeat(64)], ["executableSha256", "invalid"],
  ])("rejects invalid signing evidence: %s", async (field, value) => {
    const dir = await artifact()
    mutate(dir, SIGNING_INFO, info => { info[field] = value })
    await expect(verify(dir)).rejects.toThrow(/signing|publisher/)
  })
  it.each([null, "{}", "{", "[]"])("rejects malformed signing evidence %s", async (info) => {
    const dir = await artifact()
    writeFileSync(join(dir, SIGNING_INFO), info ?? "null")
    checksums(dir)
    await expect(verify(dir)).rejects.toThrow()
  })
  it("rejects corrupt installers and blockmaps", async () => {
    const dir = await artifact()
    writeFileSync(join(dir, files.installer), "corrupt NSIS payload")
    await expect(verify(dir)).rejects.toThrow("sha512")
    const other = await artifact()
    writeFileSync(join(other, files.blockmap), "not gzip")
    checksums(other)
    await expect(verify(other)).rejects.toThrow()
  })
  it("rejects blockmap ranges from a different installer even with new checksums", async () => {
    const dir = await artifact()
    const map = JSON.parse(gunzipSync(readFileSync(join(dir, files.blockmap))).toString())
    map.files[0].sizes[0] = statSync(join(dir, files.installer)).size + 1
    writeFileSync(join(dir, files.blockmap), gzipSync(JSON.stringify(map)))
    checksums(dir)
    await expect(verify(dir)).rejects.toThrow("does not cover")
  })
  it.each(["wrong architecture", "web installer"])("rejects a feed with %s", async (kind) => {
    const dir = await artifact()
    const feed = kind === "web installer" ? { packages: {} } : { files: [{ url: "life-board-1.0.0-win-arm64.exe" }] }
    writeFileSync(join(dir, files.feed), stringify({ version: "1.0.0", ...feed }))
    checksums(dir)
    await expect(verify(dir)).rejects.toThrow()
  })
  it("refuses Windows artifacts through the legacy Linux interface", async () => {
    await expect(checkAssets(await artifact(), "1.0.0")).rejects.toThrow("missing")
  })
})

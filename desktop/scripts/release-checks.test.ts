import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"
import { parse, stringify } from "yaml"
import { BUILD_INFO, CHECKSUMS, FEED, checkAssets, checkTag, checkUploaded, releaseFiles, writeBuildInfo } from "./release-checks.mts"
import { selectUpdate } from "../src/update-driver"

const directories: string[] = []
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { force: true, recursive: true })
  vi.unstubAllEnvs()
})
const sha512 = (data: string) => createHash("sha512").update(data).digest("base64")

/** Writes a release directory shaped like electron-builder's output plus sha256sum. */
function release(version = "1.0.0", change: (feed: Record<string, unknown>) => void = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), "life-board-release-"))
  directories.push(dir)
  const { deb, appImage } = releaseFiles(version)
  writeFileSync(join(dir, deb), "deb package")
  writeFileSync(join(dir, appImage), "appimage")
  const files = [appImage, deb].map((url) => ({ url, sha512: sha512(url === deb ? "deb package" : "appimage"), size: statSync(join(dir, url)).size }))
  const feed: Record<string, unknown> = { version, files, path: appImage, sha512: files[0].sha512, releaseDate: "2026-10-20T00:00:00.000Z" }
  change(feed)
  writeFileSync(join(dir, FEED), stringify(feed))
  writeChecksums(dir, [deb, appImage, FEED])
  return dir
}
function writeChecksums(dir: string, names: string[]) {
  const lines = names.map((name) => `${createHash("sha256").update(readFileSync(join(dir, name))).digest("hex")}  ${name}`)
  writeFileSync(join(dir, CHECKSUMS), `${lines.join("\n")}\n`)
}

const provenance = { sourceSha: "a".repeat(40), releaseTag: null }
const artifactNames = [...Object.values(releaseFiles("1.0.0")), FEED, BUILD_INFO]
function artifact(releaseTag: string | null = null) {
  const dir = release()
  writeBuildInfo(dir, "1.0.0", "linux-x64", { ...provenance, releaseTag })
  writeChecksums(dir, artifactNames)
  return dir
}

describe("release tag", () => {
  it("accepts the stable tag that matches package.json", () => {
    expect(checkTag("v1.0.0", "1.0.0")).toBe("1.0.0")
  })
  it.each(["1.0.0", "v1.0", "v01.0.0", "v1.0.0-beta.1", "v1.0.0+build", "release-1.0.0", ""])("rejects %j", (tag) => {
    expect(() => checkTag(tag, "1.0.0")).toThrow("stable")
  })
  it("rejects a stable tag that differs from package.json", () => {
    expect(() => checkTag("v1.0.1", "1.0.0")).toThrow("does not match")
  })
})

describe("platform artifact contract", () => {
  const verify = (dir: string) => checkAssets(dir, "1.0.0", "linux-x64", provenance)

  it("accepts a complete build-only artifact and includes provenance in its checksums", async () => {
    expect(await verify(artifact())).toEqual([...artifactNames, CHECKSUMS])
  })

  it("accepts release provenance only for the expected matching stable tag", async () => {
    const expected = { ...provenance, releaseTag: "v1.0.0" }
    expect(await checkAssets(artifact("v1.0.0"), "1.0.0", "linux-x64", expected)).toContain(BUILD_INFO)
    expect(() => writeBuildInfo(release(), "1.0.0", "linux-x64", { ...expected, releaseTag: "v1.0.1" })).toThrow("does not match")
    expect(() => writeBuildInfo(release(), "1.0.0", "linux-x64", { ...expected, releaseTag: "v1.0.0-beta.1" })).toThrow("stable")
  })

  it.each([BUILD_INFO, FEED, CHECKSUMS, ...Object.values(releaseFiles("1.0.0"))])("rejects a missing %s", async (name) => {
    const dir = artifact()
    rmSync(join(dir, name))
    await expect(verify(dir)).rejects.toThrow()
  })

  it.each([
    ["version", "1.0.1", "version"],
    ["sourceSha", "b".repeat(40), "source"],
    ["sourceSha", "not-a-commit", "source"],
    ["targetOs", "win32", "target"],
    ["architecture", "arm64", "target"],
    ["releaseTag", "v1.0.0", "release tag"],
    ["schemaVersion", 2, "schema"],
  ])("rejects %s from a different build even with recalculated checksums", async (field, value, message) => {
    const dir = artifact()
    const info = JSON.parse(readFileSync(join(dir, BUILD_INFO), "utf8"))
    info[field] = value
    writeFileSync(join(dir, BUILD_INFO), JSON.stringify(info))
    writeChecksums(dir, artifactNames)
    await expect(verify(dir)).rejects.toThrow(message)
  })

  it.each(["{", "null", "[]", "{}", '{"schemaVersion":1}'])("rejects malformed provenance %s", async (info) => {
    const dir = artifact()
    writeFileSync(join(dir, BUILD_INFO), info)
    writeChecksums(dir, artifactNames)
    await expect(verify(dir)).rejects.toThrow()
  })

  it("does not accept a release artifact as a build-only artifact or the reverse", async () => {
    await expect(verify(artifact("v1.0.0"))).rejects.toThrow("release tag")
    await expect(checkAssets(artifact(), "1.0.0", "linux-x64", { ...provenance, releaseTag: "v1.0.0" })).rejects.toThrow("release tag")
  })

  it("does not treat a Linux artifact as another platform or architecture", async () => {
    await expect(checkAssets(artifact(), "1.0.0", "win32-x64", provenance)).rejects.toThrow("Unsupported artifact target")
    await expect(checkAssets(artifact(), "1.0.0", "linux-arm64", provenance)).rejects.toThrow("Unsupported artifact target")
  })

  it("rejects empty installers and symbolic links", async () => {
    const dir = artifact()
    const path = join(dir, releaseFiles("1.0.0").deb)
    writeFileSync(path, "")
    await expect(verify(dir)).rejects.toThrow("nonempty regular file")
    rmSync(path)
    symlinkSync(join(dir, FEED), path)
    await expect(verify(dir)).rejects.toThrow("nonempty regular file")
  })

  it.each(["null", "files: [", "version: 1.0.0\nfiles: [null]"])("rejects malformed feed %s", async (feed) => {
    const dir = artifact()
    writeFileSync(join(dir, FEED), feed)
    writeChecksums(dir, artifactNames)
    await expect(verify(dir)).rejects.toThrow()
  })

  it("rejects corrupt bytes even when the file size is unchanged", async () => {
    const dir = artifact()
    writeFileSync(join(dir, releaseFiles("1.0.0").deb), "DEB PACKAGE")
    await expect(verify(dir)).rejects.toThrow("sha512")
  })

  it("requires a checksum for the provenance manifest", async () => {
    const dir = artifact()
    writeChecksums(dir, artifactNames.filter((name) => name !== BUILD_INFO))
    await expect(verify(dir)).rejects.toThrow("must list exactly")
  })

  it("rejects changed provenance bytes even when metadata values are unchanged", async () => {
    const dir = artifact()
    const path = join(dir, BUILD_INFO)
    writeFileSync(path, `${readFileSync(path, "utf8")} `)
    await expect(verify(dir)).rejects.toThrow("sha256")
  })

  it.each(["duplicate", "malformed", "traversal", "wrong digest", "extra file"])("rejects %s checksum entries", async (kind) => {
    const dir = artifact()
    const sums = readFileSync(join(dir, CHECKSUMS), "utf8")
    const first = sums.split("\n")[0]
    const changed = {
      duplicate: sums + `${first}\n`,
      malformed: sums.replace(/^[a-f0-9]+/, "not-a-digest"),
      traversal: sums.replace(BUILD_INFO, `../${BUILD_INFO}`),
      "wrong digest": sums.replace(/^[a-f0-9]+/, "0".repeat(64)),
      "extra file": sums + `${"0".repeat(64)}  extra.zip\n`,
    }[kind]!
    writeFileSync(join(dir, CHECKSUMS), changed)
    await expect(verify(dir)).rejects.toThrow()
  })

  it("anchors provenance to git and the Actions context, including through the legacy invocation", async () => {
    const dir = release()
    const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()
    vi.stubEnv("GITHUB_SHA", sourceSha)
    vi.stubEnv("RELEASE_TAG", "")
    expect(writeBuildInfo(dir, "1.0.0", "linux-x64").sourceSha).toBe(sourceSha)
    writeChecksums(dir, artifactNames)
    expect(await checkAssets(dir, "1.0.0")).toContain(BUILD_INFO)
    vi.stubEnv("GITHUB_SHA", "0".repeat(40))
    await expect(checkAssets(dir, "1.0.0", "linux-x64")).rejects.toThrow("GITHUB_SHA")
    expect(() => writeBuildInfo(dir, "1.0.0", "linux-x64")).toThrow("GITHUB_SHA")
    vi.stubEnv("GITHUB_SHA", sourceSha)
    writeBuildInfo(dir, "1.0.0", "linux-x64", provenance)
    writeChecksums(dir, artifactNames)
    await expect(checkAssets(dir, "1.0.0")).rejects.toThrow("source")
  })

  it("requires every platform file, including provenance, in an uploaded release", async () => {
    const dir = artifact()
    const names = await verify(dir)
    const uploaded = names.map((name) => ({ name, size: statSync(join(dir, name)).size }))
    expect(() => checkUploaded(dir, names, uploaded)).not.toThrow()
    expect(() => checkUploaded(dir, names, uploaded.filter((file) => file.name !== BUILD_INFO))).toThrow("exactly")
    expect(() => checkUploaded(dir, names, [...uploaded, uploaded[0]])).toThrow("exactly")
  })
})

describe("release assets", () => {
  it("accepts a complete build whose feed and checksums reference every installer", async () => {
    expect(await checkAssets(release(), "1.0.0")).toEqual(["life-board_1.0.0_amd64.deb", "life-board-1.0.0-x86_64.AppImage", FEED, CHECKSUMS])
  })
  it("feeds each installation format its own x64 asset", async () => {
    const info = parse(readFileSync(join(release(), FEED), "utf8"))
    expect(selectUpdate(info, "deb", "x64").files[0].url).toBe("life-board_1.0.0_amd64.deb")
    expect(selectUpdate(info, "AppImage", "x64").files[0].url).toBe("life-board-1.0.0-x86_64.AppImage")
  })
  it("rejects a feed for another version", async () => {
    await expect(checkAssets(release("1.0.0", (feed) => { feed.version = "1.0.1" }), "1.0.0")).rejects.toThrow("announces 1.0.1")
  })
  it("rejects a feed that drops one installation format", async () => {
    await expect(checkAssets(release("1.0.0", (feed) => { feed.files = (feed.files as unknown[]).slice(0, 1) }), "1.0.0")).rejects.toThrow("exactly")
  })
  it("rejects a missing installer", async () => {
    const dir = release()
    rmSync(join(dir, releaseFiles("1.0.0").deb))
    await expect(checkAssets(dir, "1.0.0")).rejects.toThrow("missing")
  })
  it("rejects an installer that changed after the feed was written", async () => {
    const dir = release()
    writeFileSync(join(dir, releaseFiles("1.0.0").deb), "other build")
    await expect(checkAssets(dir, "1.0.0")).rejects.toThrow("does not match")
  })
  it("rejects an inconsistent legacy path entry", async () => {
    await expect(checkAssets(release("1.0.0", (feed) => { feed.sha512 = "x" }), "1.0.0")).rejects.toThrow("path/sha512")
  })
  it("rejects incomplete checksums", async () => {
    const dir = release()
    writeChecksums(dir, [releaseFiles("1.0.0").deb, FEED])
    await expect(checkAssets(dir, "1.0.0")).rejects.toThrow(CHECKSUMS)
  })
})

describe("uploaded release", () => {
  it("requires exactly the local assets with matching sizes", async () => {
    const dir = release()
    const names = await checkAssets(dir, "1.0.0")
    const assets = names.map((name) => ({ name, size: statSync(join(dir, name)).size }))
    expect(() => checkUploaded(dir, names, assets)).not.toThrow()
    expect(() => checkUploaded(dir, names, assets.slice(1))).toThrow("exactly")
    expect(() => checkUploaded(dir, names, [...assets, { name: "extra.zip", size: 1 }])).toThrow("exactly")
    expect(() => checkUploaded(dir, names, assets.map((asset) => ({ ...asset, size: asset.size + 1 })))).toThrow("size")
  })
})

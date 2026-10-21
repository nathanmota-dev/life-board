import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { parse, stringify } from "yaml"
import { CHECKSUMS, FEED, checkAssets, checkTag, checkUploaded, releaseFiles } from "./release-checks.mts"
import { selectUpdate } from "../src/update-driver"

const directories: string[] = []
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { force: true, recursive: true }) })
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

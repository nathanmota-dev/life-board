import { createHash } from "node:crypto"
import { createRequire } from "node:module"
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { MacUpdater } from "electron-updater/out/MacUpdater"
import { parseUpdateInfo, resolveFiles } from "electron-updater/out/providers/Provider"
import { afterEach, describe, expect, it } from "vitest"
import { parse, stringify } from "yaml"
import {
  BUILD_INFO, CHECKSUMS, FEED, MAC_FEED, RELEASE_TARGETS, SIGNING_INFO, checkBuildOutputs, checkRelease, checkUploaded, combinedFiles,
  composeRelease, draftAction, macFiles, mergeMacFeeds, releaseFiles, windowsFiles, writeBuildInfo, type Provenance,
} from "./release-checks.mts"

const { buildBlockMap } = createRequire(import.meta.url)("app-builder-lib/out/targets/blockmap/blockmap") as {
  buildBlockMap: (input: string, compression: string, output: string) => Promise<{ sha512: string, size: number }>
}
// Exposes the pinned updater's own (protected) arch filter.
class MacFeed extends MacUpdater {
  static pick(...args: Parameters<typeof MacUpdater["filterFilesForArch"]>) {
    return super.filterFilesForArch(...args)
  }
}

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), "life-board-compose-"))
  dirs.push(dir)
  return dir
}
const buildOnly: Provenance = { sourceSha: "a".repeat(40), releaseTag: null }
const release: Provenance = { ...buildOnly, releaseTag: "v1.0.0" }
const digest = (path: string, algorithm = "sha256", encoding: "hex" | "base64" = "hex") => createHash(algorithm).update(readFileSync(path)).digest(encoding)
function checksums(dir: string, names = readdirSync(dir).filter((name) => name !== CHECKSUMS)) {
  writeFileSync(join(dir, CHECKSUMS), names.map((name) => `${digest(join(dir, name))}  ${name}`).join("\n") + "\n")
}
function feed(dir: string, name: string, urls: string[], releaseDate = "2026-10-20T00:00:00.000Z") {
  const files = urls.map((url) => ({ url, sha512: digest(join(dir, url), "sha512", "base64"), size: statSync(join(dir, url)).size }))
  writeFileSync(join(dir, name), stringify({ version: "1.0.0", files, path: urls[0], sha512: files[0].sha512, releaseDate }))
}

/** One Actions artifact per target, shaped like the reusable build workflows' uploads. */
type Options = { provenance?: Provenance, signed?: boolean, version?: string }
async function artifact(root: string, target: string, { provenance = buildOnly, signed, version = "1.0.0" }: Options = {}) {
  signed ??= provenance.releaseTag !== null
  const dir = join(root, target)
  mkdirSync(dir)
  if (target === "linux-x64") {
    const { deb, appImage } = releaseFiles(version)
    writeFileSync(join(dir, deb), "deb package")
    writeFileSync(join(dir, appImage), "appimage")
    feed(dir, FEED, [appImage, deb])
  } else if (target === "windows-x64") {
    const { installer, blockmap, feed: name } = windowsFiles(version)
    writeFileSync(join(dir, installer), "synthetic NSIS bytes")
    await buildBlockMap(join(dir, installer), "gzip", join(dir, blockmap))
    feed(dir, name, [installer])
    writeFileSync(join(dir, SIGNING_INFO), JSON.stringify({ schemaVersion: 1, status: signed ? "signed" : "unsigned", publisher: signed ? "Example Publisher" : null,
      thumbprint: signed ? "A".repeat(40) : null, installerSha256: digest(join(dir, installer)), executableSha256: "b".repeat(64) }))
  } else {
    const arch = target === "macos-x64" ? "x64" : "arm64"
    const { dmg, zip, blockmap } = macFiles(version, arch)
    writeFileSync(join(dir, dmg), `synthetic ${arch} DMG`)
    writeFileSync(join(dir, zip), `synthetic ${arch} ZIP update payload`)
    await buildBlockMap(join(dir, zip), "gzip", join(dir, blockmap))
    // The arm64 build finishes later, so the merged feed keeps its date.
    feed(dir, MAC_FEED, [zip], arch === "x64" ? "2026-10-20T00:00:00.000Z" : "2026-10-20T00:05:00.000Z")
    writeFileSync(join(dir, SIGNING_INFO), JSON.stringify({ schemaVersion: 1, status: signed ? "signed" : "adhoc", teamId: signed ? "ABCDE12345" : null,
      notarized: signed, cdHash: "c".repeat(40), dmgSha256: digest(join(dir, dmg)), zipSha256: digest(join(dir, zip)) }))
  }
  writeBuildInfo(dir, version, target, provenance)
  checksums(dir)
  return dir
}
async function artifacts(options: { provenance?: Provenance } = {}) {
  const root = temp()
  for (const target of RELEASE_TARGETS) await artifact(root, target, options)
  return root
}
const compose = async (root: string, provenance = buildOnly) => {
  const out = join(temp(), "release")
  await composeRelease(root, out, "1.0.0", provenance)
  return out
}
const names = [...combinedFiles("1.0.0"), CHECKSUMS]

describe("combined release", () => {
  it("publishes only the installers, update payloads, blockmaps, feeds and one global checksum list", async () => {
    const out = await compose(await artifacts())
    expect(readdirSync(out).sort()).toEqual([...names].sort())
    expect(names).not.toContain(BUILD_INFO)
    expect(names).not.toContain(SIGNING_INFO)
    expect(await checkRelease(out, "1.0.0")).toEqual(names)
    const sums = readFileSync(join(out, CHECKSUMS), "utf8").trimEnd().split("\n").map((line) => line.split("  ")[1])
    expect(sums).toEqual(combinedFiles("1.0.0"))
  })

  it("keeps each platform feed byte-for-byte, including the Linux feed of old clients", async () => {
    const root = await artifacts()
    const out = await compose(root)
    expect(readFileSync(join(out, FEED))).toEqual(readFileSync(join(root, "linux-x64", FEED)))
    expect(readFileSync(join(out, "latest.yml"))).toEqual(readFileSync(join(root, "windows-x64", "latest.yml")))
  })

  it("merges both Mac ZIPs into one feed each architecture can update from", async () => {
    const root = await artifacts()
    const out = await compose(root)
    const info = parseUpdateInfo(readFileSync(join(out, MAC_FEED), "utf8"), MAC_FEED, new URL(`https://example.invalid/${MAC_FEED}`))
    const [intel, apple] = ["macos-x64", "macos-arm64"].map((target) => parse(readFileSync(join(root, target, MAC_FEED), "utf8")).files[0])
    expect(info).toEqual({ version: "1.0.0", files: [intel, apple], path: intel.url, sha512: intel.sha512, releaseDate: "2026-10-20T00:05:00.000Z" })
    const files = resolveFiles(info, new URL("https://github.com/nathanmota-dev/life-board/releases/download/v1.0.0/"))
    expect(MacFeed.pick(files, false).map((file) => file.info.url)).toEqual([intel.url])
    expect(MacFeed.pick(files, true).map((file) => file.info.url)).toEqual([apple.url])
  })

  it("composes a signed release from the tag and refuses an ineligible signature state", async () => {
    expect(readdirSync(await compose(await artifacts({ provenance: release }), release))).toHaveLength(names.length)
    for (const target of ["windows-x64", "macos-x64", "macos-arm64"]) {
      const root = temp()
      for (const other of RELEASE_TARGETS) await artifact(root, other, { provenance: release, signed: other !== target })
      await expect(compose(root, release)).rejects.toThrow(/Authenticode|notarized Developer ID/)
    }
  })

  it.each(RELEASE_TARGETS)("refuses a release without %s", async (target) => {
    const root = await artifacts()
    rmSync(join(root, target), { recursive: true })
    await expect(compose(root)).rejects.toThrow("must contain exactly")
  })

  it("refuses an unknown extra artifact", async () => {
    const root = await artifacts()
    mkdirSync(join(root, "linux-arm64"))
    await expect(compose(root)).rejects.toThrow("must contain exactly")
  })

  it.each([
    ["another commit", { provenance: { ...buildOnly, sourceSha: "b".repeat(40) } }, "source"],
    ["another tag", { provenance: release, signed: true }, "release tag"],
    ["another version", { version: "1.0.1" }, "missing"],
  ])("refuses mixing in a build from %s", async (_, options, message) => {
    const root = temp()
    for (const target of RELEASE_TARGETS) await artifact(root, target, target === "macos-arm64" ? options : {})
    await expect(compose(root)).rejects.toThrow(message)
  })

  it("refuses files that would collide with another platform's assets", async () => {
    const root = await artifacts()
    writeFileSync(join(root, "macos-x64", "latest.yml"), "version: 1.0.0\n")
    await expect(compose(root)).rejects.toThrow("unexpected files: latest.yml")
  })

  it("never overwrites an existing upload directory", async () => {
    const root = await artifacts()
    const out = temp()
    writeFileSync(join(out, "stale.exe"), "old")
    await expect(composeRelease(root, out, "1.0.0", buildOnly)).rejects.toThrow("must be empty")
  })
})

describe("Mac feed merge", () => {
  const intel = { version: "1.0.0", files: [{ url: macFiles("1.0.0", "x64").zip, sha512: "x", size: 1 }], path: macFiles("1.0.0", "x64").zip, sha512: "x", releaseDate: "2026-10-20T00:00:00.000Z" }
  const apple = { ...intel, files: [{ url: macFiles("1.0.0", "arm64").zip, sha512: "y", size: 2 }], path: macFiles("1.0.0", "arm64").zip, sha512: "y" }

  it("keeps the x64 legacy path and both entries unchanged", () => {
    expect(mergeMacFeeds(intel, apple, "1.0.0")).toEqual({ version: "1.0.0", files: [...intel.files, ...apple.files], path: intel.path, sha512: "x", releaseDate: intel.releaseDate })
  })
  it.each([
    ["the architectures swapped", () => mergeMacFeeds(apple, intel, "1.0.0"), "own ZIP"],
    ["one architecture twice", () => mergeMacFeeds(intel, intel, "1.0.0"), "own ZIP"],
    ["an already combined feed", () => mergeMacFeeds({ ...intel, files: [...intel.files, ...apple.files] }, apple, "1.0.0"), "own ZIP"],
    ["different versions", () => mergeMacFeeds(intel, { ...apple, version: "1.0.1" }, "1.0.0"), "disagree"],
    ["metadata from only one build", () => mergeMacFeeds(intel, { ...apple, minimumSystemVersion: "12.0" }, "1.0.0"), "disagree"],
    ["a missing release date", () => mergeMacFeeds(intel, { ...apple, releaseDate: undefined }, "1.0.0"), "releaseDate"],
    ["a malformed feed", () => mergeMacFeeds(intel, null as never, "1.0.0"), "own ZIP"],
  ])("rejects %s", (_, merge, message) => {
    expect(merge).toThrow(message)
  })
})

describe("combined release verification", () => {
  const changed = async (change: (dir: string) => void) => {
    const out = await compose(await artifacts())
    change(out)
    return checkRelease(out, "1.0.0")
  }
  const rewriteMacFeed = (dir: string, edit: (info: Record<string, unknown> & { files: unknown[] }) => void) => {
    const info = parse(readFileSync(join(dir, MAC_FEED), "utf8"))
    edit(info)
    writeFileSync(join(dir, MAC_FEED), stringify(info))
    checksums(dir, combinedFiles("1.0.0"))
  }

  it("rejects an altered checksum", async () => {
    await expect(changed((dir) => writeFileSync(join(dir, CHECKSUMS), readFileSync(join(dir, CHECKSUMS), "utf8").replace(/^[a-f0-9]{64}/, "0".repeat(64)))))
      .rejects.toThrow("sha256")
  })
  it("rejects an installer replaced after composition", async () => {
    await expect(changed((dir) => writeFileSync(join(dir, macFiles("1.0.0", "arm64").dmg), "other DMG"))).rejects.toThrow("sha256")
  })
  it.each(combinedFiles("1.0.0"))("rejects a missing %s", async (name) => {
    await expect(changed((dir) => rmSync(join(dir, name)))).rejects.toThrow("must contain exactly")
  })
  it.each([BUILD_INFO, "builder-debug.yml", ".env"])("rejects an unexpected %s", async (name) => {
    await expect(changed((dir) => writeFileSync(join(dir, name), "x"))).rejects.toThrow("must contain exactly")
  })
  it("rejects a Mac feed that drops an architecture", async () => {
    await expect(changed((dir) => rewriteMacFeed(dir, (info) => { info.files = info.files.slice(0, 1) }))).rejects.toThrow("must list exactly")
  })
  it("rejects a Mac feed whose legacy path is not the x64 ZIP", async () => {
    await expect(changed((dir) => rewriteMacFeed(dir, (info) => {
      const [, apple] = info.files as { url: string, sha512: string }[]
      Object.assign(info, { path: apple.url, sha512: apple.sha512 })
    }))).rejects.toThrow("path/sha512")
  })
  it("rejects a draft that is missing a platform or lists a file twice", async () => {
    const out = await compose(await artifacts())
    const uploaded = names.map((name) => ({ name, size: statSync(join(out, name)).size }))
    expect(() => checkUploaded(out, names, uploaded)).not.toThrow()
    expect(() => checkUploaded(out, names, uploaded.filter((asset) => !asset.name.endsWith(".exe")))).toThrow("exactly")
    expect(() => checkUploaded(out, names, [...uploaded, uploaded[0]])).toThrow("exactly")
  })
})

describe("build fan-in", () => {
  const outputs = (provenance: Provenance, signing = "signed") => ({
    validate: { result: "success", outputs: {} },
    linux: { result: "success", outputs: { "artifact-name": "linux-x64", target: "linux-x64", version: "1.0.0", "source-sha": provenance.sourceSha, "release-tag": provenance.releaseTag ?? "" } },
    windows: { result: "success", outputs: { "artifact-name": "windows-x64", target: "windows-x64", version: "1.0.0", "source-sha": provenance.sourceSha, "release-tag": provenance.releaseTag ?? "", "signing-status": signing } },
    macos: { result: "success", outputs: { "artifact-names": '["macos-x64","macos-arm64"]', version: "1.0.0", "source-sha": provenance.sourceSha, "release-tag": provenance.releaseTag ?? "", "signing-status": signing } },
  })

  it("accepts every build from the same commit, version and tag", () => {
    expect(() => checkBuildOutputs(outputs(release), "1.0.0", release)).not.toThrow()
    expect(() => checkBuildOutputs(outputs(buildOnly, "unsigned"), "1.0.0", buildOnly)).not.toThrow()
  })
  it.each(["failure", "cancelled", "skipped", undefined])("refuses a %s platform build", (result) => {
    const needs: Record<string, { result?: string, outputs?: Record<string, string> }> = outputs(release)
    needs.macos = { ...needs.macos, result }
    expect(() => checkBuildOutputs(needs, "1.0.0", release)).toThrow("did not succeed")
    delete needs.macos
    expect(() => checkBuildOutputs(needs, "1.0.0", release)).toThrow("did not succeed")
  })
  it.each([
    ["artifact-name", "linux-arm64", "linux"],
    ["artifact-names", '["macos-x64"]', "macos"],
    ["source-sha", "b".repeat(40), "windows"],
    ["version", "1.0.1", "linux"],
    ["release-tag", "", "macos"],
    ["signing-status", "adhoc", "macos"],
    ["signing-status", "unsigned", "windows"],
  ])("refuses %s %j from the %s build", (field, value, job) => {
    const needs = outputs(release) as Record<string, { outputs: Record<string, string> }>
    needs[job].outputs[field] = value
    expect(() => checkBuildOutputs(needs, "1.0.0", release)).toThrow()
  })
})

describe("draft state", () => {
  it("creates a missing draft and reuses an existing one", () => {
    expect(draftAction("v1.0.0", "missing")).toBe("create")
    expect(draftAction("v1.0.0", "true")).toBe("reuse")
  })
  it("never touches an already published version", () => {
    expect(() => draftAction("v1.0.0", "false")).toThrow("already published")
  })
  it.each(["", "null", "TRUE"])("rejects an unknown state %j", (state) => {
    expect(() => draftAction("v1.0.0", state)).toThrow("Unexpected")
  })
})


describe("Linux-only public release", () => {
  const linuxRelease = async (provenance = release) => {
    const root = temp()
    await artifact(root, "linux-x64", { provenance })
    const out = join(temp(), "release")
    await composeRelease(root, out, "1.0.0", provenance, "linux")
    return { root, out }
  }

  it.each([release, buildOnly])("composes only Linux public files for %j", async (provenance) => {
    const { root, out } = await linuxRelease(provenance)
    expect(readdirSync(out).sort()).toEqual([
      "life-board_1.0.0_amd64.deb", "life-board-1.0.0-x86_64.AppImage", FEED, CHECKSUMS,
    ].sort())
    expect(readFileSync(join(out, FEED))).toEqual(readFileSync(join(root, "linux-x64", FEED)))
    const names = await checkRelease(out, "1.0.0", "linux")
    expect(() => checkUploaded(out, names, names.map((name) => ({ name, size: statSync(join(out, name)).size })))).not.toThrow()
    writeFileSync(join(out, "life-board_1.0.0_amd64.deb"), "tampered")
    await expect(checkRelease(out, "1.0.0", "linux")).rejects.toThrow()
  })

  it("rejects artifacts from another commit and unexpected platform directories", async () => {
    const { root } = await linuxRelease()
    await expect(composeRelease(root, join(temp(), "release"), "1.0.0", { ...release, sourceSha: "b".repeat(40) }, "linux"))
      .rejects.toThrow("source")
    mkdirSync(join(root, "windows-x64"))
    await expect(composeRelease(root, join(temp(), "release"), "1.0.0", release, "linux")).rejects.toThrow("must contain exactly")
  })

  it("requires the Linux job and its provenance without requiring other platforms", () => {
    const needs = { linux: { result: "success", outputs: {
      "artifact-name": "linux-x64", target: "linux-x64", version: "1.0.0",
      "source-sha": release.sourceSha, "release-tag": release.releaseTag!,
    } } }
    expect(() => checkBuildOutputs(needs, "1.0.0", release, "linux")).not.toThrow()
    expect(() => checkBuildOutputs({}, "1.0.0", release, "linux")).toThrow("linux build did not succeed")
    needs.linux.outputs["source-sha"] = "b".repeat(40)
    expect(() => checkBuildOutputs(needs, "1.0.0", release, "linux")).toThrow("different version, commit or tag")
  })

  it("rejects extra public files and misspelled scopes", async () => {
    const { root, out } = await linuxRelease()
    writeFileSync(join(out, "latest.yml"), "unexpected")
    await expect(checkRelease(out, "1.0.0", "linux")).rejects.toThrow("must contain exactly")
    await expect(composeRelease(root, temp(), "1.0.0", release, "linxu" as never)).rejects.toThrow("Unsupported release scope")
  })
})

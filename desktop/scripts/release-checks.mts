// Build/release gates. Run with Node 22.18+ (type stripping):
//   node desktop/scripts/release-checks.mts tag v1.0.0
//   node desktop/scripts/release-checks.mts build-info release linux-x64
//   node desktop/scripts/release-checks.mts assets release linux-x64
//   node desktop/scripts/release-checks.mts assets release/mac-arm64 macos-arm64
//   node desktop/scripts/release-checks.mts uploaded release assets.json linux-x64
//   node desktop/scripts/release-checks.mts builds                  (reads toJSON(needs) from BUILDS)
//   node desktop/scripts/release-checks.mts compose artifacts release
//   node desktop/scripts/release-checks.mts assets release all
//   node desktop/scripts/release-checks.mts uploaded release assets.json all
//   node desktop/scripts/release-checks.mts draft-action v1.0.0 <true|false|missing>
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { constants, copyFileSync, createReadStream, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { gunzipSync } from "node:zlib"
import { parse, stringify } from "yaml"

const STABLE_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
export const FEED = "latest-linux.yml"
export const MAC_FEED = "latest-mac.yml"
export const CHECKSUMS = "SHA256SUMS.txt"
export const BUILD_INFO = "build-info.json"
export const SIGNING_INFO = "signing-info.json"

export type Provenance = { sourceSha: string, releaseTag: string | null }
export type BuildInfo = Provenance & { schemaVersion: 1, version: string, targetOs: string, architecture: string }

const TARGETS: Record<string, { targetOs: string, architecture: string }> = {
  "linux-x64": { targetOs: "linux", architecture: "x64" },
  "windows-x64": { targetOs: "win32", architecture: "x64" },
  "macos-x64": { targetOs: "darwin", architecture: "x64" },
  "macos-arm64": { targetOs: "darwin", architecture: "arm64" },
}
/** Supported build targets; public releases currently select the Linux scope. */
export const RELEASE_TARGETS = Object.keys(TARGETS)

function targetInfo(target: string) {
  if (!Object.hasOwn(TARGETS, target)) throw new Error(`Unsupported artifact target ${target}.`)
  return TARGETS[target]
}

export function windowsFiles(version: string) {
  const installer = `life-board-${version}-win-x64.exe`
  return { installer, blockmap: `${installer}.blockmap`, feed: "latest.yml" }
}

/** Both Mac builds write latest-mac.yml; each feed lists only its own ZIP until composeRelease merges them. */
export function macFiles(version: string, arch: "x64" | "arm64") {
  const zip = `life-board-${version}-mac-${arch}.zip`
  return { dmg: `life-board-${version}-mac-${arch}.dmg`, zip, blockmap: `${zip}.blockmap`, feed: MAC_FEED }
}

/** Use the checkout/context as the trust anchor, never the downloaded manifest. */
function checkoutProvenance(): Provenance {
  const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()
  if (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== sourceSha) {
    throw new Error("Checked-out source does not match GITHUB_SHA.")
  }
  return { sourceSha, releaseTag: process.env.RELEASE_TAG || null }
}

export function checkBuildInfo(info: unknown, version: string, target: string, expected: Provenance): asserts info is BuildInfo {
  const { targetOs, architecture } = targetInfo(target)
  if (!info || typeof info !== "object" || Array.isArray(info)) throw new Error(`${BUILD_INFO} must be an object.`)
  const record = info as Record<string, unknown>
  const keys = ["schemaVersion", "sourceSha", "version", "targetOs", "architecture", "releaseTag"].sort()
  if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(keys) || record.schemaVersion !== 1) {
    throw new Error(`${BUILD_INFO} has an invalid schema.`)
  }
  if (record.version !== version) throw new Error(`${BUILD_INFO} version does not match ${version}.`)
  if (record.targetOs !== targetOs || record.architecture !== architecture) throw new Error(`${BUILD_INFO} target does not match ${target}.`)
  if (typeof record.sourceSha !== "string" || !/^[a-f0-9]{40}$/.test(record.sourceSha) || record.sourceSha !== expected.sourceSha) {
    throw new Error(`${BUILD_INFO} source does not match the checked-out commit.`)
  }
  if (record.releaseTag !== expected.releaseTag) throw new Error(`${BUILD_INFO} release tag does not match this build.`)
  if (record.releaseTag !== null) checkTag(record.releaseTag as string, version)
}

export function writeBuildInfo(dir: string, version: string, target: string, provenance = checkoutProvenance()) {
  const info: BuildInfo = { schemaVersion: 1, ...provenance, version, ...targetInfo(target) }
  checkBuildInfo(info, version, target, provenance)
  writeFileSync(join(dir, BUILD_INFO), `${JSON.stringify(info, null, 2)}\n`)
  return info
}

export function releaseFiles(version: string) {
  return { deb: `life-board_${version}_amd64.deb`, appImage: `life-board-${version}-x86_64.AppImage` }
}

/** Only `vX.Y.Z` tags that exactly match package.json may publish. */
export function checkTag(tag: string, version: string) {
  if (!STABLE_TAG.test(tag)) throw new Error(`Tag ${tag} is not a stable vMAJOR.MINOR.PATCH version.`)
  if (tag !== `v${version}`) throw new Error(`Tag ${tag} does not match package.json version ${version}.`)
  return version
}

type FeedFile = { url: string, sha512: string, size: number }
type Feed = { version?: unknown, files?: FeedFile[], path?: unknown, sha512?: unknown, packages?: unknown, releaseDate?: unknown, [key: string]: unknown }

async function sha(path: string, algorithm: "sha256" | "sha512", encoding: "hex" | "base64") {
  const hash = createHash(algorithm)
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest(encoding)
}

/** The feed, checksums and installers must come from the same build and reference each other exactly. */
export async function checkAssets(dir: string, version: string, target?: string, provenance?: Provenance) {
  const { targetOs, architecture } = targetInfo(target ?? "linux-x64")
  const windows = target === "windows-x64" ? windowsFiles(version) : undefined
  const mac = targetOs === "darwin" ? macFiles(version, architecture as "x64" | "arm64") : undefined
  // The DMG is only for first installs; the updater downloads the ZIP.
  const expected = windows ? { installer: windows.installer } : mac ? { zip: mac.zip } : releaseFiles(version)
  const feedName = windows?.feed ?? mac?.feed ?? FEED
  // Legacy Linux builds without a manifest remain valid only with no explicit target.
  const hasBuildInfo = target !== undefined || existsSync(join(dir, BUILD_INFO))
  const extra = windows ? [windows.blockmap, SIGNING_INFO] : mac ? [mac.dmg, mac.blockmap, SIGNING_INFO] : []
  const assets = [...Object.values(expected), ...extra, feedName, ...(hasBuildInfo ? [BUILD_INFO] : [])]
  for (const name of assets) {
    const path = join(dir, name)
    if (!existsSync(path)) throw new Error(`Artifact is missing ${name}.`)
    if (!lstatSync(path).isFile() || statSync(path).size === 0) throw new Error(`${name} must be a nonempty regular file.`)
  }
  if (hasBuildInfo) checkBuildInfo(JSON.parse(readFileSync(join(dir, BUILD_INFO), "utf8")), version, target ?? "linux-x64", provenance ?? checkoutProvenance())
  await checkFeed(dir, feedName, version, Object.values(expected))

  if (windows) {
    const info = JSON.parse(readFileSync(join(dir, SIGNING_INFO), "utf8"))
    const keys = ["schemaVersion", "status", "publisher", "thumbprint", "installerSha256", "executableSha256"].sort()
    if (!info || JSON.stringify(Object.keys(info).sort()) !== JSON.stringify(keys) || info.schemaVersion !== 1
      || !["signed", "unsigned"].includes(info.status) || !/^[a-f0-9]{64}$/.test(info.executableSha256)
      || info.installerSha256 !== await sha(join(dir, windows.installer), "sha256", "hex")) throw new Error("Invalid Windows signing evidence.")
    if (info.status === "signed" ? typeof info.publisher !== "string" || !info.publisher.trim() || typeof info.thumbprint !== "string" || !/^[A-F0-9]{40}$/.test(info.thumbprint)
      : info.publisher !== null || info.thumbprint !== null) throw new Error("Invalid Windows publisher evidence.")
    const build = JSON.parse(readFileSync(join(dir, BUILD_INFO), "utf8")) as BuildInfo
    if (build.releaseTag && info.status !== "signed") throw new Error("A Windows release requires valid Authenticode signatures.")
    checkBlockmap(dir, windows.blockmap, windows.installer, "NSIS")
  }

  if (mac) {
    const info = JSON.parse(readFileSync(join(dir, SIGNING_INFO), "utf8"))
    const keys = ["schemaVersion", "status", "teamId", "notarized", "cdHash", "dmgSha256", "zipSha256"].sort()
    if (!info || JSON.stringify(Object.keys(info).sort()) !== JSON.stringify(keys) || info.schemaVersion !== 1
      || !["signed", "adhoc"].includes(info.status) || typeof info.cdHash !== "string" || !/^[a-f0-9]{40}$/.test(info.cdHash)
      || info.dmgSha256 !== await sha(join(dir, mac.dmg), "sha256", "hex")
      || info.zipSha256 !== await sha(join(dir, mac.zip), "sha256", "hex")) throw new Error("Invalid macOS signing evidence.")
    if (info.status === "signed" ? typeof info.teamId !== "string" || !/^[A-Z0-9]{10}$/.test(info.teamId) || info.notarized !== true
      : info.teamId !== null || info.notarized !== false) throw new Error("Invalid macOS Developer ID evidence.")
    const build = JSON.parse(readFileSync(join(dir, BUILD_INFO), "utf8")) as BuildInfo
    if (build.releaseTag && info.status !== "signed") throw new Error("A macOS release requires a notarized Developer ID signature.")
    checkBlockmap(dir, mac.blockmap, mac.zip, "ZIP")
  }

  await checkChecksums(dir, assets)
  return [...assets, CHECKSUMS]
}

/** The feed must list exactly `urls`, with their real sizes and SHA-512, and a legacy path among them. */
async function checkFeed(dir: string, feedName: string, version: string, urls: string[], legacyPath?: string) {
  const feed = parse(readFileSync(join(dir, feedName), "utf8")) as Feed
  if (feed?.version !== version) throw new Error(`${feedName} announces ${String(feed?.version)}, expected ${version}.`)
  if (!Array.isArray(feed.files)) throw new Error(`${feedName} has no files list.`)
  if (feedName === windowsFiles(version).feed && feed.packages !== undefined) throw new Error("Windows requires a full NSIS installer, not a web package.")
  const found = feed.files.map((file) => file?.url).sort()
  if (JSON.stringify(found) !== JSON.stringify([...urls].sort())) {
    throw new Error(`${feedName} must list exactly ${urls.join(", ")}; found ${found.join(", ")}.`)
  }
  for (const file of feed.files) {
    const path = join(dir, file.url)
    if (!existsSync(path)) throw new Error(`${feedName} references missing ${file.url}.`)
    if (statSync(path).size !== file.size) throw new Error(`${file.url} size does not match ${feedName}.`)
    if (await sha(path, "sha512", "base64") !== file.sha512) throw new Error(`${file.url} sha512 does not match ${feedName}.`)
  }
  const legacy = feed.files.find((file) => file.url === feed.path)
  if (!legacy || legacy.sha512 !== feed.sha512 || (legacyPath && feed.path !== legacyPath)) {
    throw new Error(`${feedName} path/sha512 must match ${legacyPath ?? "one of its files"}.`)
  }
}

/** SHA256SUMS.txt must cover exactly `names` (sha256sum, shasum or PowerShell output). */
async function checkChecksums(dir: string, names: string[]) {
  const sums = new Map<string, string>()
  for (const line of readFileSync(join(dir, CHECKSUMS), "utf8").trimEnd().split(/\r?\n/)) {
    const match = /^([a-f0-9]{64}) [ *]([^/\\\r\n]+)$/.exec(line)
    if (!match || sums.has(match[2])) throw new Error(`${CHECKSUMS} has a malformed or duplicate entry.`)
    sums.set(match[2], match[1])
  }
  if (JSON.stringify([...sums.keys()].sort()) !== JSON.stringify([...names].sort())) {
    throw new Error(`${CHECKSUMS} must list exactly ${names.join(", ")}.`)
  }
  for (const name of names) {
    if (await sha(join(dir, name), "sha256", "hex") !== sums.get(name)) throw new Error(`${name} sha256 does not match ${CHECKSUMS}.`)
  }
}

/**
 * electron-builder writes a gzip-compressed v2 blockmap. Verify its ranges
 * cover this payload, rather than accepting any nonempty .blockmap file.
 */
function checkBlockmap(dir: string, blockmap: string, payload: string, kind: string) {
  const map = JSON.parse(gunzipSync(readFileSync(join(dir, blockmap))).toString("utf8"))
  if (map.version !== "2" || !Array.isArray(map.files) || map.files.length !== 1) throw new Error(`Invalid ${kind} blockmap.`)
  const file = map.files[0]
  if (file.name !== "file" || file.offset !== 0 || !Array.isArray(file.sizes) || !file.sizes.length
    || !Array.isArray(file.checksums) || file.checksums.length !== file.sizes.length
    || file.sizes.some((size: unknown) => !Number.isSafeInteger(size) || (size as number) <= 0)
    || file.checksums.some((sum: unknown) => typeof sum !== "string" || !/^[A-Za-z0-9+/]{24}$/.test(sum))
    || file.sizes.reduce((sum: number, size: number) => sum + size, 0) !== statSync(join(dir, payload)).size) throw new Error(`${kind} blockmap does not cover ${payload}.`)
}

/** Compares `gh release view --json assets` with the local files before the draft is published. */
export function checkUploaded(dir: string, names: string[], uploaded: { name: string, size: number }[]) {
  const remote = new Map(uploaded.map((asset) => [asset.name, asset.size]))
  if (remote.size !== uploaded.length || JSON.stringify([...remote.keys()].sort()) !== JSON.stringify([...names].sort())) {
    throw new Error(`Release assets must be exactly ${names.join(", ")}; found ${uploaded.map((asset) => asset.name).join(", ")}.`)
  }
  for (const name of names) {
    if (remote.get(name) !== statSync(join(dir, name)).size) throw new Error(`Uploaded ${name} size does not match the build.`)
  }
}

/** What each build adds to the public release. Provenance, signing evidence and per-build checksums stay in its Actions artifact. */
function publicFiles(target: string, version: string) {
  const { targetOs, architecture } = targetInfo(target)
  if (targetOs === "win32") {
    const { installer, blockmap, feed } = windowsFiles(version)
    return [installer, blockmap, feed]
  }
  if (targetOs === "darwin") {
    const { dmg, zip, blockmap } = macFiles(version, architecture as "x64" | "arm64")
    return [dmg, zip, blockmap]
  }
  return [...Object.values(releaseFiles(version)), FEED]
}

/** The public asset set of a complete release, without the global SHA256SUMS.txt. */
export type ReleaseScope = "all" | "linux"

function releaseTargets(scope: ReleaseScope) {
  if (scope === "linux") return ["linux-x64"]
  if (scope === "all") return RELEASE_TARGETS
  throw new Error(`Unsupported release scope ${scope}.`)
}

export function combinedFiles(version: string, scope: ReleaseScope = "all") {
  if (scope === "linux") return publicFiles("linux-x64", version)
  releaseTargets(scope)
  return [...RELEASE_TARGETS.flatMap((target) => publicFiles(target, version)), MAC_FEED]
}

type BuildJob = { result?: string, outputs?: Record<string, string> }
const BUILD_JOBS: Record<string, string[]> = { linux: ["linux-x64"], windows: ["windows-x64"], macos: ["macos-x64", "macos-arm64"] }

/** Checks the reusable workflows' results (`toJSON(needs)`) against this checkout before any artifact is downloaded. */
export function checkBuildOutputs(needs: Record<string, BuildJob>, version: string, expected: Provenance, scope: ReleaseScope = "all") {
  const selected = releaseTargets(scope)
  for (const [job, targets] of Object.entries(BUILD_JOBS)) {
    if (!targets.some((target) => selected.includes(target))) continue
    const { result, outputs = {} } = needs[job] ?? {}
    if (result !== "success") throw new Error(`The ${job} build did not succeed (${result ?? "missing"}).`)
    const names = targets.length === 1 ? [outputs["artifact-name"], outputs.target] : JSON.parse(outputs["artifact-names"] ?? "null")
    if (JSON.stringify(names) !== JSON.stringify(targets.length === 1 ? [targets[0], targets[0]] : targets)) {
      throw new Error(`The ${job} build must produce ${targets.join(", ")}.`)
    }
    if (outputs.version !== version || outputs["source-sha"] !== expected.sourceSha || outputs["release-tag"] !== (expected.releaseTag ?? "")) {
      throw new Error(`The ${job} build used a different version, commit or tag.`)
    }
    if (job !== "linux" && expected.releaseTag && outputs["signing-status"] !== "signed") throw new Error(`The ${job} release build is not signed.`)
  }
}

/**
 * MacUpdater 6.8.9 reads one latest-mac.yml and picks the ZIP with "arm64" in its name
 * on Apple Silicon. List both entries unchanged, keep the x64 legacy path and the newest date.
 */
export function mergeMacFeeds(x64: Feed, arm64: Feed, version: string) {
  const { files: intel, path, sha512, releaseDate: intelDate, ...shared } = x64 ?? {}
  const { files: apple, path: _path, sha512: _sha512, releaseDate: appleDate, ...other } = arm64 ?? {}
  const urls = [intel, apple].map((files) => Array.isArray(files) && files.length === 1 ? files[0]?.url : undefined)
  if (urls[0] !== macFiles(version, "x64").zip || urls[1] !== macFiles(version, "arm64").zip) {
    throw new Error(`Each Mac feed must list only its own ZIP; found ${urls.join(", ")}.`)
  }
  const entries = (feed: object) => JSON.stringify(Object.entries(feed).sort(([a], [b]) => a.localeCompare(b)))
  if (shared.version !== version || entries(shared) !== entries(other)) throw new Error(`The Mac feeds disagree on ${MAC_FEED} metadata.`)
  const dates = [intelDate, appleDate].map((date) => typeof date === "string" ? Date.parse(date) : NaN)
  if (dates.some(Number.isNaN)) throw new Error(`Each Mac feed needs a valid releaseDate.`)
  return { ...shared, files: [...intel!, ...apple!], path, sha512, releaseDate: dates[0] >= dates[1] ? intelDate : appleDate }
}

/**
 * Verifies every build in `<root>/<target>` against this checkout and copies only their public files
 * into the empty `out` directory, with one merged Mac feed and a global SHA256SUMS.txt.
 */
export async function composeRelease(root: string, out: string, version: string, provenance = checkoutProvenance(), scope: ReleaseScope = "all") {
  const targets = releaseTargets(scope)
  const found = readdirSync(root).sort()
  if (JSON.stringify(found) !== JSON.stringify([...targets].sort())) {
    throw new Error(`${root} must contain exactly ${targets.join(", ")}; found ${found.join(", ") || "nothing"}.`)
  }
  mkdirSync(out, { recursive: true })
  if (readdirSync(out).length) throw new Error(`${out} must be empty.`)
  const copied = new Set<string>()
  const macFeeds: Feed[] = []
  for (const target of targets) {
    const dir = join(root, target)
    const names = await checkAssets(dir, version, target, provenance)
    const extra = readdirSync(dir).filter((name) => !names.includes(name))
    if (extra.length) throw new Error(`The ${target} artifact has unexpected files: ${extra.join(", ")}.`)
    for (const name of publicFiles(target, version)) {
      if (copied.has(name)) throw new Error(`Duplicate release asset ${name}.`)
      copyFileSync(join(dir, name), join(out, name), constants.COPYFILE_EXCL)
      copied.add(name)
    }
    if (TARGETS[target].targetOs === "darwin") macFeeds.push(parse(readFileSync(join(dir, MAC_FEED), "utf8")))
  }
  // Quoted strings keep js-yaml (used by electron-updater) from turning releaseDate into a Date.
  if (macFeeds.length) {
    const feed = stringify(mergeMacFeeds(macFeeds[0], macFeeds[1], version), { defaultStringType: "QUOTE_DOUBLE", defaultKeyType: "PLAIN", lineWidth: 0 })
    writeFileSync(join(out, MAC_FEED), feed, { flag: "wx" })
    copied.add(MAC_FEED)
  }
  const names = [...copied]
  const lines = await Promise.all(names.map(async (name) => `${await sha(join(out, name), "sha256", "hex")}  ${name}`))
  writeFileSync(join(out, CHECKSUMS), `${lines.join("\n")}\n`, { flag: "wx" })
  return checkRelease(out, version, scope)
}

/** Validates a composed upload directory: exactly the public set, every feed and blockmap, and the global checksums. */
export async function checkRelease(dir: string, version: string, scope: ReleaseScope = "all") {
  const names = combinedFiles(version, scope)
  const found = readdirSync(dir).sort()
  if (JSON.stringify(found) !== JSON.stringify([...names, CHECKSUMS].sort())) {
    throw new Error(`${dir} must contain exactly ${[...names, CHECKSUMS].join(", ")}; found ${found.join(", ")}.`)
  }
  for (const name of found) {
    if (!lstatSync(join(dir, name)).isFile() || statSync(join(dir, name)).size === 0) throw new Error(`${name} must be a nonempty regular file.`)
  }
  const linux = releaseFiles(version)
  await checkFeed(dir, FEED, version, [linux.deb, linux.appImage])
  if (scope === "all") {
    const windows = windowsFiles(version)
    const [intel, apple] = [macFiles(version, "x64"), macFiles(version, "arm64")]
    await checkFeed(dir, windows.feed, version, [windows.installer])
    await checkFeed(dir, MAC_FEED, version, [intel.zip, apple.zip], intel.zip)
    checkBlockmap(dir, windows.blockmap, windows.installer, "NSIS")
    for (const mac of [intel, apple]) checkBlockmap(dir, mac.blockmap, mac.zip, "ZIP")
  }
  await checkChecksums(dir, names)
  return [...names, CHECKSUMS]
}

/** Maps `gh release view --json isDraft` (or "missing") to the draft step; published versions are immutable. */
export function draftAction(tag: string, state: string) {
  if (state === "missing") return "create"
  if (state === "true") return "reuse"
  if (state === "false") throw new Error(`${tag} is already published. Its binaries are immutable; release a new patch version.`)
  throw new Error(`Unexpected release state ${JSON.stringify(state)} for ${tag}.`)
}

async function main([command, ...args]: string[]) {
  const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string }
  const verify = (dir: string, target?: string) => (target === "all" || target === "linux") ? checkRelease(dir, version, target) : checkAssets(dir, version, target)
  if (command === "tag") console.log(checkTag(args[0] ?? "", version))
  else if (command === "build-info") console.log(JSON.stringify(writeBuildInfo(args[0], version, args[1])))
  else if (command === "assets") console.log((await verify(args[0], args[1])).join("\n"))
  else if (command === "uploaded") {
    const { assets } = JSON.parse(readFileSync(args[1], "utf8")) as { assets: { name: string, size: number }[] }
    checkUploaded(args[0], await verify(args[0], args[2]), assets)
    console.log(`Release assets match ${args[0]}.`)
  } else if (command === "builds") {
    checkBuildOutputs(JSON.parse(process.env.BUILDS ?? "{}"), version, checkoutProvenance(), (args[0] ?? "all") as ReleaseScope)
    console.log(`All builds match ${version}.`)
  } else if (command === "compose") console.log((await composeRelease(args[0], args[1], version, checkoutProvenance(), (args[2] ?? "all") as ReleaseScope)).join("\n"))
  else if (command === "draft-action") console.log(draftAction(args[0] ?? "", args[1] ?? ""))
  else {
    throw new Error("Usage: release-checks.mts tag <tag> | build-info <dir> <target> | assets <dir> [target|all|linux] | uploaded <dir> <assets.json> [target|all|linux]"
      + " | builds [all|linux] | compose <artifacts> <out> [all|linux] | draft-action <tag> <true|false|missing>")
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error: Error) => {
    console.error(error.message)
    process.exit(1)
  })
}

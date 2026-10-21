// Build/release gates. Run with Node 22.18+ (type stripping):
//   node desktop/scripts/release-checks.mts tag v1.0.0
//   node desktop/scripts/release-checks.mts build-info release linux-x64
//   node desktop/scripts/release-checks.mts assets release linux-x64
//   node desktop/scripts/release-checks.mts assets release/mac-arm64 macos-arm64
//   node desktop/scripts/release-checks.mts uploaded release assets.json linux-x64
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { createReadStream, existsSync, lstatSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { gunzipSync } from "node:zlib"
import { parse } from "yaml"

const STABLE_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
export const FEED = "latest-linux.yml"
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

function targetInfo(target: string) {
  if (!Object.hasOwn(TARGETS, target)) throw new Error(`Unsupported artifact target ${target}.`)
  return TARGETS[target]
}

export function windowsFiles(version: string) {
  const installer = `life-board-${version}-win-x64.exe`
  return { installer, blockmap: `${installer}.blockmap`, feed: "latest.yml" }
}

/** Both Mac builds write latest-mac.yml; each feed lists only its own ZIP until #31 combines them. */
export function macFiles(version: string, arch: "x64" | "arm64") {
  const zip = `life-board-${version}-mac-${arch}.zip`
  return { dmg: `life-board-${version}-mac-${arch}.dmg`, zip, blockmap: `${zip}.blockmap`, feed: "latest-mac.yml" }
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
  const feed = parse(readFileSync(join(dir, feedName), "utf8")) as { version?: unknown, files?: FeedFile[], path?: unknown, sha512?: unknown, packages?: unknown }
  if (feed?.version !== version) throw new Error(`${feedName} announces ${String(feed?.version)}, expected ${version}.`)
  if (!Array.isArray(feed.files)) throw new Error(`${feedName} has no files list.`)
  if (windows && feed.packages !== undefined) throw new Error("Windows requires a full NSIS installer, not a web package.")
  const urls = feed.files.map((file) => file?.url).sort()
  if (JSON.stringify(urls) !== JSON.stringify(Object.values(expected).sort())) {
    throw new Error(`${feedName} must list exactly ${Object.values(expected).join(", ")}; found ${urls.join(", ")}.`)
  }
  for (const file of feed.files) {
    const path = join(dir, file.url)
    if (!existsSync(path)) throw new Error(`${feedName} references missing ${file.url}.`)
    if (statSync(path).size !== file.size) throw new Error(`${file.url} size does not match ${feedName}.`)
    if (await sha(path, "sha512", "base64") !== file.sha512) throw new Error(`${file.url} sha512 does not match ${feedName}.`)
  }
  const legacy = feed.files.find((file) => file.url === feed.path)
  if (!legacy || legacy.sha512 !== feed.sha512) throw new Error(`${feedName} path/sha512 must match one of its files.`)

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

  const sums = new Map<string, string>()
  for (const line of readFileSync(join(dir, CHECKSUMS), "utf8").trimEnd().split(/\r?\n/)) {
    const match = /^([a-f0-9]{64}) [ *]([^/\\\r\n]+)$/.exec(line)
    if (!match || sums.has(match[2])) throw new Error(`${CHECKSUMS} has a malformed or duplicate entry.`)
    sums.set(match[2], match[1])
  }
  if (JSON.stringify([...sums.keys()].sort()) !== JSON.stringify([...assets].sort())) {
    throw new Error(`${CHECKSUMS} must list exactly ${assets.join(", ")}.`)
  }
  for (const name of assets) {
    if (await sha(join(dir, name), "sha256", "hex") !== sums.get(name)) throw new Error(`${name} sha256 does not match ${CHECKSUMS}.`)
  }
  return [...assets, CHECKSUMS]
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

async function main([command, ...args]: string[]) {
  const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string }
  if (command === "tag") console.log(checkTag(args[0] ?? "", version))
  else if (command === "build-info") console.log(JSON.stringify(writeBuildInfo(args[0], version, args[1])))
  else if (command === "assets") console.log((await checkAssets(args[0], version, args[1])).join("\n"))
  else if (command === "uploaded") {
    const { assets } = JSON.parse(readFileSync(args[1], "utf8")) as { assets: { name: string, size: number }[] }
    checkUploaded(args[0], await checkAssets(args[0], version, args[2]), assets)
    console.log(`Release assets match ${args[0]}.`)
  } else throw new Error("Usage: release-checks.mts tag <tag> | build-info <dir> <target> | assets <dir> [target] | uploaded <dir> <assets.json> [target]")
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error: Error) => {
    console.error(error.message)
    process.exit(1)
  })
}

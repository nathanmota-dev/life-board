// Build/release gates. Run with Node 22.18+ (type stripping):
//   node desktop/scripts/release-checks.mts tag v1.0.0
//   node desktop/scripts/release-checks.mts build-info release linux-x64
//   node desktop/scripts/release-checks.mts assets release linux-x64
//   node desktop/scripts/release-checks.mts uploaded release assets.json linux-x64
import { execFileSync } from "node:child_process"
import { createHash } from "node:crypto"
import { createReadStream, existsSync, lstatSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { parse } from "yaml"

const STABLE_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
export const FEED = "latest-linux.yml"
export const CHECKSUMS = "SHA256SUMS.txt"
export const BUILD_INFO = "build-info.json"

export type Provenance = { sourceSha: string, releaseTag: string | null }
export type BuildInfo = Provenance & { schemaVersion: 1, version: string, targetOs: string, architecture: string }

function targetInfo(target: string) {
  if (target !== "linux-x64") throw new Error(`Unsupported artifact target ${target}.`)
  return { targetOs: "linux", architecture: "x64" }
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
  targetInfo(target ?? "linux-x64")
  const expected = releaseFiles(version)
  // Legacy Linux builds without a manifest remain valid only with no explicit target.
  const hasBuildInfo = target !== undefined || existsSync(join(dir, BUILD_INFO))
  const assets = [...Object.values(expected), FEED, ...(hasBuildInfo ? [BUILD_INFO] : [])]
  for (const name of assets) {
    const path = join(dir, name)
    if (!existsSync(path)) throw new Error(`Artifact is missing ${name}.`)
    if (!lstatSync(path).isFile() || statSync(path).size === 0) throw new Error(`${name} must be a nonempty regular file.`)
  }
  if (hasBuildInfo) checkBuildInfo(JSON.parse(readFileSync(join(dir, BUILD_INFO), "utf8")), version, target ?? "linux-x64", provenance ?? checkoutProvenance())
  const feed = parse(readFileSync(join(dir, FEED), "utf8")) as { version?: unknown, files?: FeedFile[], path?: unknown, sha512?: unknown }
  if (feed?.version !== version) throw new Error(`${FEED} announces ${String(feed?.version)}, expected ${version}.`)
  if (!Array.isArray(feed.files)) throw new Error(`${FEED} has no files list.`)
  const urls = feed.files.map((file) => file?.url).sort()
  if (JSON.stringify(urls) !== JSON.stringify(Object.values(expected).sort())) {
    throw new Error(`${FEED} must list exactly ${Object.values(expected).join(", ")}; found ${urls.join(", ")}.`)
  }
  for (const file of feed.files) {
    const path = join(dir, file.url)
    if (!existsSync(path)) throw new Error(`${FEED} references missing ${file.url}.`)
    if (statSync(path).size !== file.size) throw new Error(`${file.url} size does not match ${FEED}.`)
    if (await sha(path, "sha512", "base64") !== file.sha512) throw new Error(`${file.url} sha512 does not match ${FEED}.`)
  }
  const legacy = feed.files.find((file) => file.url === feed.path)
  if (!legacy || legacy.sha512 !== feed.sha512) throw new Error(`${FEED} path/sha512 must match one of its files.`)

  const sums = new Map<string, string>()
  for (const line of readFileSync(join(dir, CHECKSUMS), "utf8").trimEnd().split("\n")) {
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

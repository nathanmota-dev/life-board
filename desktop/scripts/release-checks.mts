// Release gate used by .github/workflows/release.yml. Run with Node 22.18+ (type stripping):
//   node desktop/scripts/release-checks.mts tag v1.0.0
//   node desktop/scripts/release-checks.mts assets release
//   node desktop/scripts/release-checks.mts uploaded release assets.json
import { createHash } from "node:crypto"
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { parse } from "yaml"

const STABLE_TAG = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
export const FEED = "latest-linux.yml"
export const CHECKSUMS = "SHA256SUMS.txt"

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
export async function checkAssets(dir: string, version: string) {
  const expected = releaseFiles(version)
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

  const sums = new Map(readFileSync(join(dir, CHECKSUMS), "utf8").trim().split("\n").map((line) => {
    const [digest, name] = line.split(/\s+\*?/)
    return [name, digest] as const
  }))
  const assets = [...Object.values(expected), FEED]
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
  else if (command === "assets") console.log((await checkAssets(args[0], version)).join("\n"))
  else if (command === "uploaded") {
    const { assets } = JSON.parse(readFileSync(args[1], "utf8")) as { assets: { name: string, size: number }[] }
    checkUploaded(args[0], await checkAssets(args[0], version), assets)
    console.log(`Release assets match ${args[0]}.`)
  } else throw new Error("Usage: release-checks.mts tag <tag> | assets <dir> | uploaded <dir> <assets.json>")
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error: Error) => {
    console.error(error.message)
    process.exit(1)
  })
}

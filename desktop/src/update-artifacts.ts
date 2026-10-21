import { createHash } from "node:crypto"
import { createReadStream } from "node:fs"
import type { RequestOptions } from "node:http"
import { basename } from "node:path"
import { CancellationToken } from "builder-util-runtime"
import type { WindowsUpdateInfo } from "builder-util-runtime"
import type { UpdateInfo } from "electron-updater"
import { ElectronHttpExecutor } from "electron-updater/out/electronHttpExecutor"
import { valid, prerelease } from "semver"
import type { UpdateState } from "../../web/src/types/updates"
import { UpdateFailure } from "./update-state"

/** Filter before the native provider can fall back to an incompatible payload. */
export function selectUpdate(info: UpdateInfo, format: NonNullable<UpdateState["format"]>, arch: string): WindowsUpdateInfo {
  if (!info || !valid(info.version) || prerelease(info.version) || !Array.isArray(info.files)) throw new UpdateFailure("metadata")
  const aliases = arch === "x64" ? ["x64", "amd64", "x86_64"] : arch === "arm64" ? ["arm64", "aarch64"] : []
  const extension = format === "nsis" ? "exe" : format === "mac" ? "zip" : format.toLowerCase()
  const file = info.files.find((file) => {
    if (typeof file?.url !== "string" || typeof file.sha512 !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(file.sha512)) return false
    const name = basename(file.url)
    const platform = format === "nsis" ? /-win-x64\.exe$/i.test(name) : format === "mac" ? /-mac-(x64|arm64)\.zip$/i.test(name) : true
    return platform && name.toLowerCase().endsWith(`.${extension}`) && aliases.some((nameArch) => new RegExp(`[-_]${nameArch}\\.`, "i").test(name))
  })
  if (!file) throw new UpdateFailure("metadata")
  // Keep native package metadata; NSIS can download an auxiliary package as well.
  const packages = (info as WindowsUpdateInfo).packages
  if (packages) {
    const auxiliary = packages[arch]
    if (!auxiliary || typeof auxiliary.path !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(auxiliary.sha512)) throw new UpdateFailure("metadata")
  }
  return { ...info, files: [file], path: file.url, sha512: file.sha512 }
}

/** Each metadata request, including redirects, has an absolute cancellable deadline. */
export class UpdateHttpExecutor extends ElectronHttpExecutor {
  private requests = new Set<CancellationToken>()
  override async request(options: RequestOptions, parent?: CancellationToken, data?: Record<string, unknown> | null) {
    const token = new CancellationToken(parent)
    this.requests.add(token)
    const timer = setTimeout(() => token.cancel(), 30_000)
    try { return await super.request(options, token, data) }
    finally { clearTimeout(timer); this.requests.delete(token); token.dispose() }
  }
  dispose() { for (const token of this.requests) token.cancel(); this.requests.clear() }
}

export async function verifyArtifact(path: string, sha512: string) {
  const hash = createHash("sha512")
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  if (hash.digest("base64") !== sha512) throw new UpdateFailure("integrity")
}

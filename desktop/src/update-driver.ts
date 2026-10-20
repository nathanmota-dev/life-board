import { execFile } from "node:child_process"
import { createHash } from "node:crypto"
import { createReadStream, constants } from "node:fs"
import { access, chmod, copyFile, open, rename, rm } from "node:fs/promises"
import type { RequestOptions } from "node:http"
import { basename, dirname, isAbsolute, join } from "node:path"
import { promisify } from "node:util"
import { CancellationToken } from "builder-util-runtime"
import { AppImageUpdater, DebUpdater } from "electron-updater"
import type { UpdateInfo } from "electron-updater"
import { ElectronHttpExecutor } from "electron-updater/out/electronHttpExecutor"
import { valid, prerelease } from "semver"
import type { UpdateDriver } from "./app-updates"
import type { UpdateState } from "../../web/src/types/updates"
import { isNewStable, releaseUrl, UpdateFailure } from "./update-state"

const runFile = promisify(execFile)

/** Never let the provider fall back to another format or architecture. */
export function selectUpdate(info: UpdateInfo, format: "deb" | "AppImage", arch: string): UpdateInfo {
  if (!info || !valid(info.version) || prerelease(info.version) || !Array.isArray(info.files)) throw new UpdateFailure("metadata")
  const aliases = arch === "x64" ? ["x64", "amd64", "x86_64"] : arch === "arm64" ? ["arm64", "aarch64"] : []
  const file = info.files.find((file) => {
    if (typeof file?.url !== "string" || typeof file.sha512 !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(file.sha512)) return false
    const name = basename(file.url)
    return name.toLowerCase().endsWith(`.${format.toLowerCase()}`) && aliases.some((nameArch) => new RegExp(`[-_]${nameArch}\\.`, "i").test(name))
  })
  if (!file) throw new UpdateFailure("metadata")
  return { ...info, files: [file] }
}

/** Each metadata request, including redirects, has an absolute cancellable deadline. */
class UpdateHttpExecutor extends ElectronHttpExecutor {
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

class SafeDebUpdater extends DebUpdater {
  readonly httpExecutor = new UpdateHttpExecutor()
  protected override async getUpdateInfoAndProvider() {
    const result = await super.getUpdateInfoAndProvider()
    return { ...result, info: selectUpdate(result.info, "deb", process.arch) }
  }
}
class SafeAppImageUpdater extends AppImageUpdater {
  readonly httpExecutor = new UpdateHttpExecutor()
  protected override async getUpdateInfoAndProvider() {
    const result = await super.getUpdateInfoAndProvider()
    return { ...result, info: selectUpdate(result.info, "AppImage", process.arch) }
  }
}

export async function verifyArtifact(path: string, sha512: string) {
  const hash = createHash("sha512")
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  if (hash.digest("base64") !== sha512) throw new UpdateFailure("integrity")
}

/** Copy on the destination filesystem, then rename: failures leave the installed image intact. */
export async function replaceAppImage(source: string, destination: string, sha512: string) {
  if (!isAbsolute(destination)) throw new UpdateFailure("permission")
  await access(destination, constants.W_OK)
  await access(dirname(destination), constants.W_OK)
  const staged = `${destination}.update-${process.pid}`
  try {
    await copyFile(source, staged, constants.COPYFILE_EXCL)
    await verifyArtifact(staged, sha512)
    await chmod(staged, 0o755)
    const handle = await open(staged, "r")
    try { await handle.sync() } finally { await handle.close() }
    await rename(staged, destination)
  } finally { await rm(staged, { force: true }) }
}

export function createUpdateDriver(format: NonNullable<UpdateState["format"]>, installedVersion: string, restart: (executable?: string) => void): UpdateDriver {
  const updater = format === "deb" ? new SafeDebUpdater() : new SafeAppImageUpdater()
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = false
  updater.channel = "latest"
  updater.allowPrerelease = false
  updater.allowDowngrade = false
  // Full downloads also provide progress consistently and avoid unnecessary differential failures.
  updater.disableDifferentialDownload = true
  const cancellation = new CancellationToken()
  let selected: UpdateInfo | null = null
  let downloaded: string | null = null
  // Errors also reject the action promise; a listener prevents EventEmitter's unhandled error behavior.
  const onError = (error: Error) => console.error("Application updater:", error.message)
  updater.on("error", onError)
  return {
    async check() {
      const result = await updater.checkForUpdates()
      if (!result) throw new UpdateFailure("metadata")
      selected = result.updateInfo
      if (!isNewStable(selected.version, installedVersion)) return null
      const notes = selected.releaseNotes
      return {
        version: selected.version,
        releaseDate: typeof selected.releaseDate === "string" && Number.isFinite(Date.parse(selected.releaseDate)) ? selected.releaseDate : null,
        notes: (typeof notes === "string" ? notes : Array.isArray(notes) ? notes.map((entry) => entry.note).join("\n\n") : "").slice(0, 20_000) || null,
        url: releaseUrl(selected.version),
      }
    },
    async download(version, progress) {
      downloaded = null
      // On a fresh process the snapshot can be restored, but the provider must be resolved again.
      if (!selected) await this.check()
      if (!selected || selected.version !== version || !isNewStable(version, installedVersion)) throw new UpdateFailure("metadata")
      if (format === "AppImage") {
        const image = process.env.APPIMAGE
        if (!image || !isAbsolute(image)) throw new UpdateFailure("permission")
        await access(image, constants.W_OK)
        await access(dirname(image), constants.W_OK)
      }
      const listener = (event: { percent: number }) => progress(event.percent)
      updater.on("download-progress", listener)
      try {
        const paths = await updater.downloadUpdate(cancellation)
        if (paths.length !== 1) throw new UpdateFailure("metadata")
        await verifyArtifact(paths[0], selected.files[0].sha512)
        downloaded = paths[0]
      } finally { updater.removeListener("download-progress", listener) }
    },
    async install() {
      if (!downloaded || !selected) throw new UpdateFailure("installation")
      await verifyArtifact(downloaded, selected.files[0].sha512)
      if (format === "deb") {
        try {
          // Fixed binaries and argv; no shell, passwords, renderer-supplied URLs or commands.
          // apt resolves dependencies as one operation. Never retry elevation after cancellation.
          await runFile("/usr/bin/pkexec", ["--disable-internal-agent", "/usr/bin/apt-get", "install", "--yes", "--no-remove", downloaded], {
            env: { ...process.env, PATH: "/usr/sbin:/usr/bin:/sbin:/bin" },
          })
        } catch (error) {
          const code = (error as { code?: number }).code
          throw new UpdateFailure(code === 126 || code === 127 ? "permission" : "installation")
        }
        restart()
      } else {
        const destination = process.env.APPIMAGE
        if (!destination) throw new UpdateFailure("permission")
        await replaceAppImage(downloaded, destination, selected.files[0].sha512)
        restart(destination)
      }
    },
    dispose() {
      cancellation.cancel()
      updater.httpExecutor.dispose()
      updater.removeListener("error", onError)
    },
  }
}

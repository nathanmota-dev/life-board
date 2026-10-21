import { execFile } from "node:child_process"
import { constants } from "node:fs"
import { access, chmod, copyFile, open, rename, rm } from "node:fs/promises"
import { dirname, isAbsolute } from "node:path"
import { promisify } from "node:util"
import { CancellationToken } from "builder-util-runtime"
import { AppImageUpdater, DebUpdater } from "electron-updater"
import type { UpdateInfo } from "electron-updater"
import type { UpdateDriver } from "./app-updates"
import type { UpdateState } from "../../web/src/types/updates"
import { isNewStable, releaseUrl, UpdateFailure } from "./update-state"
import { selectUpdate, UpdateHttpExecutor, verifyArtifact } from "./update-artifacts"
import { createNativeUpdateDriver } from "./update-driver-native"
export { selectUpdate, verifyArtifact } from "./update-artifacts"

const runFile = promisify(execFile)

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

export type UpdateLifecycle = {
  prepare: () => void
  cancel: () => void
  restart: (executable?: string) => void
}

export function createUpdateDriver(format: NonNullable<UpdateState["format"]>, installedVersion: string, lifecycle: UpdateLifecycle): UpdateDriver {
  if (format === "nsis" || format === "mac") return createNativeUpdateDriver(format, installedVersion, lifecycle)
  if (process.platform !== "linux") throw new UpdateFailure("metadata")
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
        lifecycle.prepare()
        lifecycle.restart()
      } else {
        const destination = process.env.APPIMAGE
        if (!destination) throw new UpdateFailure("permission")
        await replaceAppImage(downloaded, destination, selected.files[0].sha512)
        lifecycle.prepare()
        lifecycle.restart(destination)
      }
    },
    dispose() {
      cancellation.cancel()
      updater.httpExecutor.dispose()
      updater.removeListener("error", onError)
    },
  }
}

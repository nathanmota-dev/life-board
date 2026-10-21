import type { EventEmitter } from "node:events"
import { app, autoUpdater } from "electron"
import { CancellationToken } from "builder-util-runtime"
import type { WindowsUpdateInfo } from "builder-util-runtime"
import type { UpdateDriver } from "./app-updates"
import type { UpdateLifecycle } from "./update-driver"
import { MacUpdateAdapter } from "./update-driver-macos"
import { WindowsUpdateAdapter } from "./update-driver-windows"
import { selectUpdate, verifyArtifact } from "./update-artifacts"
import { isNewStable, releaseUrl, UpdateFailure } from "./update-state"

/** Own only these listeners; MacUpdater's signature/staging listeners stay intact. */
function nativeEvent(source: EventEmitter, event: string, errors: EventEmitter, signal: AbortSignal, start: () => void, beforeCleanup = false) {
  return new Promise<void>((resolve, reject) => {
    const finish = (error?: unknown) => {
      clearTimeout(timer)
      source.removeListener(event, done)
      errors.removeListener("error", failed)
      signal.removeEventListener("abort", cancelled)
      if (error) reject(error)
      else resolve()
    }
    const done = () => finish()
    const failed = (error: Error) => finish(error)
    const cancelled = () => finish(new UpdateFailure("installation"))
    const timer = setTimeout(cancelled, 120_000)
    // Settle a completed handoff before registerUpdates disposes on will-quit.
    if (beforeCleanup) source.prependListener(event, done)
    else source.on(event, done)
    errors.on("error", failed)
    signal.addEventListener("abort", cancelled, { once: true })
    if (signal.aborted) cancelled()
    else { try { start() } catch (error) { finish(error) } }
  })
}

export function createNativeUpdateDriver(format: "nsis" | "mac", installedVersion: string, lifecycle: UpdateLifecycle): UpdateDriver {
  if (process.platform !== (format === "nsis" ? "win32" : "darwin")
    || !(format === "nsis" ? ["x64"] : ["x64", "arm64"]).includes(process.arch)) throw new UpdateFailure("metadata")
  const updater = format === "nsis" ? new WindowsUpdateAdapter() : new MacUpdateAdapter()
  const arch = updater instanceof MacUpdateAdapter ? updater.updateArch : "x64"
  updater.autoDownload = false
  updater.autoInstallOnAppQuit = false
  updater.autoRunAppAfterInstall = true
  updater.channel = "latest"
  updater.allowPrerelease = false
  updater.allowDowngrade = false
  updater.disableDifferentialDownload = true
  // The packaging contract uses full NSIS installers, not unsigned web payloads.
  updater.disableWebInstaller = true
  const stopped = new AbortController()
  let cancellation: CancellationToken | undefined
  let selected: WindowsUpdateInfo | null = null
  let downloaded = false
  let staged = false

  const verify = async () => {
    if (!selected) throw new UpdateFailure("metadata")
    // Native staging/cache is authoritative, not downloadUpdate's return order.
    const { file, auxiliary } = updater.artifacts()
    if (!file) throw new UpdateFailure("installation")
    await verifyArtifact(file, selected.files[0].sha512)
    if (selected.packages?.[arch] && !auxiliary) throw new UpdateFailure("metadata")
    if (auxiliary) {
      const info = selected.packages?.[arch]
      if (!info) throw new UpdateFailure("metadata")
      await verifyArtifact(auxiliary, info.sha512)
    }
  }

  return {
    async check() {
      selected = null
      const result = await updater.checkForUpdates()
      if (!result) throw new UpdateFailure("metadata")
      const candidate = selectUpdate(result.updateInfo, format, arch)
      // Preserve the library's OS compatibility and staged rollout decisions.
      if (!isNewStable(candidate.version, installedVersion) || !result.isUpdateAvailable) return null
      selected = candidate
      const notes = selected.releaseNotes
      return {
        version: selected.version,
        releaseDate: typeof selected.releaseDate === "string" && Number.isFinite(Date.parse(selected.releaseDate)) ? selected.releaseDate : null,
        notes: (typeof notes === "string" ? notes : Array.isArray(notes) ? notes.map((entry) => entry.note).join("\n\n") : "").slice(0, 20_000) || null,
        url: releaseUrl(selected.version),
      }
    },
    async download(version, progress) {
      downloaded = false
      staged = false
      if (!selected) await this.check()
      if (stopped.signal.aborted || !selected || selected.version !== version || !isNewStable(version, installedVersion)) throw new UpdateFailure("metadata")
      cancellation = new CancellationToken()
      const deadline = setTimeout(() => cancellation?.cancel(), 10 * 60_000)
      const listener = (event: { percent: number }) => progress(event.percent)
      updater.on("download-progress", listener)
      try {
        await updater.downloadUpdate(cancellation)
        await verify()
        if (stopped.signal.aborted) throw new UpdateFailure("installation")
        downloaded = true
      } finally {
        clearTimeout(deadline)
        updater.removeListener("download-progress", listener)
        cancellation.dispose()
        cancellation = undefined
      }
    },
    async install() {
      if (!downloaded || stopped.signal.aborted) throw new UpdateFailure("installation")
      try {
        await verify()
        if (format === "mac" && !staged) {
          // With autoInstallOnAppQuit=false, Squirrel has not yet verified the
          // signature. Stage on consent, then invoke quitAndInstall only once
          // native update-downloaded arrives. A failed attempt leaves no latent
          // MacUpdater quit callback that could restart during a later retry.
          await nativeEvent(autoUpdater, "update-downloaded", updater, stopped.signal, () => autoUpdater.checkForUpdates())
          staged = true
        }
        lifecycle.prepare()
        await nativeEvent(app, "will-quit", updater, stopped.signal, () => updater.quitAndInstall(), true)
      } catch (error) {
        if (updater instanceof WindowsUpdateAdapter) updater.cancelInstall()
        lifecycle.cancel()
        throw error
      }
    },
    dispose() {
      stopped.abort()
      cancellation?.cancel()
      updater.httpExecutor.dispose()
      // The library owns its error sink and native staging listeners.
      // Only operation/progress listeners added here are removed.
    },
  }
}

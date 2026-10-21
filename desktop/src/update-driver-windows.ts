import type { StdioOptions } from "node:child_process"
import { autoUpdater } from "electron"
import { NsisUpdater } from "electron-updater"
import { selectUpdate, UpdateHttpExecutor } from "./update-artifacts"

export class WindowsUpdateAdapter extends NsisUpdater {
  readonly httpExecutor = new UpdateHttpExecutor()
  private handoff?: () => void

  protected override async getUpdateInfoAndProvider() {
    const result = await super.getUpdateInfoAndProvider()
    return { ...result, info: selectUpdate(result.info, "nsis", "x64") }
  }

  artifacts() {
    return { file: this.downloadedUpdateHelper?.file, auxiliary: this.downloadedUpdateHelper?.packageFile }
  }

  /** BaseUpdater quits before asynchronous spawn failures arrive. Wait for its
   * own NSIS launch/elevation path to hand off successfully before quitting. */
  override quitAndInstall() {
    this.handoff = () => {
      this.handoff = undefined
      autoUpdater.emit("before-quit-for-update")
      this.app.quit()
    }
    if (!this.install(false, true)) this.cancelInstall()
  }

  protected override async spawnLog(command: string, args?: string[], env?: NodeJS.ProcessEnv, stdio?: StdioOptions) {
    const handoff = this.handoff
    try {
      const started = await super.spawnLog(command, args, env, stdio)
      if (handoff !== this.handoff) return false
      if (started) handoff?.()
      return started
    } catch (error) {
      // A timed-out attempt must not quit or elevate a later retry.
      if (handoff !== this.handoff) return false
      throw error
    }
  }

  cancelInstall() {
    this.handoff = undefined
    this.quitAndInstallCalled = false
  }
}

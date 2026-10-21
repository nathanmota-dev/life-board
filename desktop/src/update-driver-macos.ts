import { app } from "electron"
import { MacUpdater } from "electron-updater"
import { selectUpdate, UpdateHttpExecutor } from "./update-artifacts"

export class MacUpdateAdapter extends MacUpdater {
  readonly httpExecutor = new UpdateHttpExecutor()
  // Match the pinned MacUpdater's hardware selection, including Rosetta.
  readonly updateArch = process.arch === "arm64" || app.runningUnderARM64Translation ? "arm64" : "x64"

  protected override async getUpdateInfoAndProvider() {
    const result = await super.getUpdateInfoAndProvider()
    return { ...result, info: selectUpdate(result.info, "mac", this.updateArch) }
  }

  artifacts() {
    return { file: this.downloadedUpdateHelper?.file, auxiliary: this.downloadedUpdateHelper?.packageFile }
  }
}

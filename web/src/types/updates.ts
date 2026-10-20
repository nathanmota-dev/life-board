export type UpdateStatus = "idle" | "checking" | "up-to-date" | "available" | "downloading" | "ready" | "installing" | "unavailable" | "error"
export type UpdateError = "network" | "metadata" | "permission" | "integrity" | "installation" | "storage"
export type UpdateRelease = { version: string; releaseDate: string | null; notes: string | null; url: string }
export type UpdateState = {
  status: UpdateStatus
  installedVersion: string
  format: "deb" | "AppImage" | null
  lastAttempt: number | null
  lastSuccess: number | null
  release: UpdateRelease | null
  progress: number | null
  error: UpdateError | null
  retryAction: "check" | "download" | "install"
}
export type UpdatesBridge = {
  getState: () => Promise<UpdateState>
  check: () => Promise<UpdateState>
  download: () => Promise<UpdateState>
  install: () => Promise<UpdateState>
  onState: (callback: (state: UpdateState) => void) => () => void
}

import { readFileSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { gt, prerelease, valid } from "semver"
import type { UpdateError, UpdateRelease } from "../../web/src/types/updates"

export const DAY = 24 * 60 * 60 * 1000
export const RETRIES = [5 * 60_000, 30 * 60_000, 2 * 60 * 60_000]
export type UpdateHistory = {
  lastAttempt: number | null
  lastSuccess: number | null
  nextCheck: number
  failures: number
  lastNotified: string | null
  release: UpdateRelease | null
}
export type UpdateStore = { load: () => UpdateHistory; save: (history: UpdateHistory) => void }
export const emptyHistory = (): UpdateHistory => ({ lastAttempt: null, lastSuccess: null, nextCheck: 0, failures: 0, lastNotified: null, release: null })
export function isNewStable(version: string, installed: string) {
  return Boolean(valid(version) && valid(installed) && !prerelease(version) && gt(version, installed))
}
export function releaseUrl(version: string) {
  return `https://github.com/nathanmota-dev/life-board/releases/tag/v${encodeURIComponent(version)}`
}

export function updateStore(directory: string): UpdateStore {
  const path = join(directory, "updates.json")
  return {
    load() {
      try {
        const input = JSON.parse(readFileSync(path, "utf8"))
        const history = emptyHistory()
        const timestamp = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0
        if (timestamp(input.lastAttempt)) history.lastAttempt = Math.min(input.lastAttempt, Date.now())
        if (timestamp(input.lastSuccess)) history.lastSuccess = Math.min(input.lastSuccess, Date.now())
        // Clamp future dates, including a clock moving backwards.
        if (timestamp(input.nextCheck)) history.nextCheck = Math.min(input.nextCheck, Date.now() + DAY)
        if (Number.isInteger(input.failures) && input.failures >= 0) history.failures = Math.min(input.failures, RETRIES.length + 1)
        if (typeof input.lastNotified === "string" && valid(input.lastNotified)) history.lastNotified = input.lastNotified
        if (typeof input.release?.version === "string" && valid(input.release.version)) {
          history.release = {
            version: input.release.version, url: releaseUrl(input.release.version),
            releaseDate: typeof input.release.releaseDate === "string" ? input.release.releaseDate : null,
            notes: typeof input.release.notes === "string" ? input.release.notes.slice(0, 20_000) : null,
          }
        }
        return history
      } catch { return emptyHistory() }
    },
    save(history) {
      writeFileSync(`${path}.tmp`, JSON.stringify(history), { mode: 0o600 })
      renameSync(`${path}.tmp`, path)
    },
  }
}

export class UpdateFailure extends Error {
  constructor(public readonly kind: UpdateError) { super(kind) }
}
export function updateError(error: unknown): UpdateError {
  if (error instanceof UpdateFailure) return error.kind
  const message = String(error)
  if (/sha512|checksum|digest/i.test(message)) return "integrity"
  if (/EACCES|EPERM|authorization|not authorized|dismissed|code 12[67]/i.test(message)) return "permission"
  if (/metadata|version|channel|no files|checksum|ERR_UPDATER/i.test(message)) return "metadata"
  return "network"
}

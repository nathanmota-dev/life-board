import type { CalendarEvent } from "@/types/calendar"
import type { GoogleStatus, GoogleSyncProblem } from "@/types/google"

/** Where the user creates the OAuth client (allow-listed in the desktop shell). */
export const GOOGLE_CONSOLE_URL = "https://console.cloud.google.com/apis/credentials"

/** How often Settings checks whether the browser login finished. */
export const GOOGLE_POLL_INTERVAL_MS = 2000

/** How often the calendar checks whether a sync finished, to show its changes. */
export const GOOGLE_CALENDAR_POLL_INTERVAL_MS = 60_000

/** How often the calendar reloads its events while some change hasn't reached Google yet. */
export const GOOGLE_PENDING_REFETCH_MS = 3000

const CLIENT_ID_SUFFIX = ".apps.googleusercontent.com"

/** The client IDs Google issues end with `.apps.googleusercontent.com`. */
export function isGoogleClientId(value: string) {
  const clientId = value.trim()
  return clientId.length > CLIENT_ID_SUFFIX.length && clientId.endsWith(CLIENT_ID_SUFFIX)
}

/** Polls the status every 2 seconds while a browser login is pending (the API ends it after 10 minutes). */
export function googleStatusInterval(pending: boolean | undefined) {
  return pending ? GOOGLE_POLL_INTERVAL_MS : false
}

/** Whether an event still has a change waiting to be sent to Google. */
export function hasPendingSync(events: Pick<CalendarEvent, "syncState">[] | undefined) {
  return Boolean(events?.some((event) => event.syncState))
}

/** What is wrong with the Google sync, if anything; `null` while it is fine or not in use. */
export function googleSyncProblem(status: GoogleStatus | undefined): GoogleSyncProblem | null {
  if (!status) return null
  if (status.reauthRequired) return "reauth"
  return status.connected && status.lastSyncError ? "error" : null
}

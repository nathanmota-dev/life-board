import type { ReactNode } from "react"

export type GoogleStatus = {
  /** A refresh token is stored. */
  connected: boolean
  email: string | null
  hasCredentials: boolean
  /** A login started in the browser is waiting for Google's answer. */
  pending: boolean
  /** Google refused the stored authorization; connecting again fixes it. */
  reauthRequired: boolean
  lastSyncAt: string | null
  lastSyncError: string | null
  /** Changes made in Life Board that Google doesn't have yet. */
  pendingChanges: number
  /** The last time Google's version of an event won over a change made here. */
  lastConflict: GoogleConflict | null
}

/** An event whose local change was dropped because Google had a newer version. */
export type GoogleConflict = { title: string; at: string }

export type GoogleCredentialsInput = { clientId: string; clientSecret: string }

/** What one sync changed. */
export type GoogleSyncResult = { imported: number; updated: number; removed: number }

/** Why the calendar warns about Google: Google refused the authorization, or the last sync failed. */
export type GoogleSyncProblem = "reauth" | "error"

export type GoogleConnectStart = { authUrl: string }

export type GoogleStatusProps = { status: GoogleStatus }

export type GoogleConnectButtonProps = {
  pending: boolean
  /** "Reconnect" instead of "Connect Google Calendar". */
  reconnect?: boolean
}

export type GoogleDetailRow = { label: string; value: ReactNode }

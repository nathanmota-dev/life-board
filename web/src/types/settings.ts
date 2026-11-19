export type AccentState = {
  accent: string
  setAccent: (accent: string) => void
  resetAccent: () => void
}

export type StartupSettings = {
  startOnLogin: boolean
  keepInBackground: boolean
}

export type StartupSettingsBridge = {
  getStartupSettings: () => Promise<StartupSettings>
  updateStartupSettings: (patch: Partial<StartupSettings>) => Promise<StartupSettings>
  pickDirectory?: () => Promise<string | null>
}

export type FilesSettings = {
  /** Folder picked in Settings > Files; null keeps uploads in the app data directory. */
  baseDir: string | null
  uploadsDir: string
  defaultUploadsDir: string
  pagesDir: string
  defaultPagesDir: string
}

/** The tabs of Settings, also accepted as `?tab=` in its URL. */
export const SETTINGS_TABS = ["general", "files", "updates", "github", "google"] as const

export type SettingsTab = (typeof SETTINGS_TABS)[number]

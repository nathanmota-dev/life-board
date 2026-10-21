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
}

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
}

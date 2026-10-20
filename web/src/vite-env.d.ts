/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
}

interface Window {
  desktop?: {
    getVersion: () => Promise<string>
    getApiBaseUrl: () => Promise<string>
    openExternal: (url: string) => Promise<void>
    setLanguage?: (language: string) => void
    onNavigate?: (callback: (route: string) => void) => () => void
    updates?: import("@/types/updates").UpdatesBridge
    app?: import("@/types/settings").StartupSettingsBridge
    capture?: {
      getShortcut: () => Promise<string | null>
      close: () => void
      notifySaved: () => void
      onSaved: (callback: () => void) => () => void
    }
    notifications?: {
      show: (notification: import("@/types/notification").AppNotification) => Promise<boolean>
    }
    pomodoro?: {
      getState: () => Promise<import("@/types/pomodoro").PomodoroState>
      dispatch: (command: import("@/types/pomodoro").PomodoroCommand) => Promise<import("@/types/pomodoro").PomodoroState>
      updateSettings: (
        patch: Partial<import("@/types/pomodoro").PomodoroSettings>,
      ) => Promise<import("@/types/pomodoro").PomodoroState>
      onState: (callback: (state: import("@/types/pomodoro").PomodoroState) => void) => () => void
      onCompleted: (callback: (completion: import("@/types/pomodoro").PomodoroCompletion) => void) => () => void
    }
  }
}

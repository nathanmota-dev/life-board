/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
}

interface Window {
  desktop?: {
    getVersion: () => Promise<string>
    getApiBaseUrl: () => Promise<string>
    openExternal: (url: string) => Promise<void>
    capture?: {
      getShortcut: () => Promise<string | null>
      close: () => void
      notifySaved: () => void
      onSaved: (callback: () => void) => () => void
    }
  }
}

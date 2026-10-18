/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
}

interface Window {
  desktop?: {
    getVersion: () => Promise<string>
    getApiBaseUrl: () => Promise<string>
    openExternal: (url: string) => Promise<void>
  }
}

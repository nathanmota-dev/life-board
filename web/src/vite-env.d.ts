/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string
}

interface Window {
  desktop?: import("@/types/desktop").DesktopBridge
  __TAURI__?: import("@/types/desktop").TauriGlobal
}

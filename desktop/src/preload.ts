import { contextBridge, ipcRenderer } from "electron"

/** Forwards a main-process event to `callback` and returns the unsubscribe function. */
function subscribe<T>(channel: string, callback: (payload: T) => void) {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld("desktop", {
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:get-version"),
  getApiBaseUrl: (): Promise<string> => ipcRenderer.invoke("api:get-base-url"),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke("app:open-external", url),
  // Lets the tray and notifications speak the language picked in Settings.
  setLanguage: (language: string) => ipcRenderer.send("app:set-language", language),
  onNavigate: (callback: (route: string) => void) => subscribe("app:navigate", callback),
  updates: {
    getState: () => ipcRenderer.invoke("updates:get-state"),
    check: () => ipcRenderer.invoke("updates:check"),
    download: () => ipcRenderer.invoke("updates:download"),
    install: () => ipcRenderer.invoke("updates:install"),
    onState: (callback: (state: unknown) => void) => subscribe("updates:state", callback),
  },
  app: {
    getStartupSettings: () => ipcRenderer.invoke("app:get-startup-settings"),
    updateStartupSettings: (patch: unknown) => ipcRenderer.invoke("app:update-startup-settings", patch),
  },
  // The global capture shortcut and its window; React only sees these methods.
  capture: {
    getShortcut: (): Promise<string | null> => ipcRenderer.invoke("capture:get-shortcut"),
    close: () => ipcRenderer.send("capture:close"),
    notifySaved: () => ipcRenderer.send("capture:saved"),
    onSaved: (callback: () => void) => subscribe("capture:saved", callback),
  },
  notifications: {
    show: (notification: unknown): Promise<boolean> => ipcRenderer.invoke("notification:show", notification),
  },
  // The timer runs in the main process; windows send commands and render its broadcasts.
  pomodoro: {
    getState: () => ipcRenderer.invoke("pomodoro:get-state"),
    dispatch: (command: unknown) => ipcRenderer.invoke("pomodoro:dispatch", command),
    updateSettings: (patch: unknown) => ipcRenderer.invoke("pomodoro:update-settings", patch),
    onState: (callback: (state: unknown) => void) => subscribe("pomodoro:state", callback),
    onCompleted: (callback: (completion: unknown) => void) => subscribe("pomodoro:completed", callback),
  },
})

import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("desktop", {
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:get-version"),
  getApiBaseUrl: (): Promise<string> => ipcRenderer.invoke("api:get-base-url"),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke("app:open-external", url),
  // The global capture shortcut and its window; React only sees these methods.
  capture: {
    getShortcut: (): Promise<string | null> => ipcRenderer.invoke("capture:get-shortcut"),
    close: () => ipcRenderer.send("capture:close"),
    notifySaved: () => ipcRenderer.send("capture:saved"),
    onSaved: (callback: () => void) => {
      const listener = () => callback()
      ipcRenderer.on("capture:saved", listener)
      return () => {
        ipcRenderer.removeListener("capture:saved", listener)
      }
    },
  },
})

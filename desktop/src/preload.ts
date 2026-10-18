import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("desktop", {
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:get-version"),
  getApiBaseUrl: (): Promise<string> => ipcRenderer.invoke("api:get-base-url"),
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke("app:open-external", url),
})

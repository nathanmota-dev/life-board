import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions, type WebContents } from "electron"

const OPTIONS: OpenDialogOptions = { properties: ["openDirectory", "createDirectory"] }

/** Native folder picker for Settings > Files; the backend validates whatever path comes back. */
export async function pickDirectory(sender: WebContents) {
  const window = BrowserWindow.fromWebContents(sender)
  const result = window ? await dialog.showOpenDialog(window, OPTIONS) : await dialog.showOpenDialog(OPTIONS)
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

export function registerDirectoryPicker() {
  ipcMain.handle("app:pick-directory", (event) => pickDirectory(event.sender))
}

/** Opens a link in the system browser (Electron), or a new tab outside the app. */
export function openExternal(url: string) {
  if (window.desktop?.openExternal) void window.desktop.openExternal(url)
  else window.open(url, "_blank", "noopener,noreferrer")
}

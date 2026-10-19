// The global capture window lives in Electron; outside it (tests, plain browser) these are no-ops.

/** The global capture shortcut label, or null when it isn't registered. */
export function getCaptureShortcut() {
  return window.desktop?.capture?.getShortcut() ?? Promise.resolve(null)
}

export function closeCaptureWindow() {
  window.desktop?.capture?.close()
}

/** Tells the main window a capture was saved, so its lists refresh. */
export function notifyCaptureSaved() {
  window.desktop?.capture?.notifySaved()
}

export function onCaptureSaved(callback: () => void) {
  return window.desktop?.capture?.onSaved(callback) ?? (() => {})
}

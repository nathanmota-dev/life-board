/** Ctrl+S, or Cmd+S on macOS: the shortcut that saves the open file. */
export function isSaveShortcut(event: Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "key">) {
  return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s"
}

/** Ctrl+E, or Cmd+E on macOS: switches a page between reading and editing. */
export function isEditShortcut(event: Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "key">) {
  return (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "e"
}

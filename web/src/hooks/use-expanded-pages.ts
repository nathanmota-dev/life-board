import { useCallback, useEffect, useState } from "react"

const STORAGE_KEY = "life-board:pages-expanded"

function readExpanded(): Set<string> {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]")
    return new Set(Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [])
  } catch {
    return new Set()
  }
}

/** The folders open in the tree, kept per viewer in `localStorage` (the tree still works without it). */
export function useExpandedPages() {
  const [expanded, setExpanded] = useState(readExpanded)

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...expanded]))
    } catch {
      // Storage can be blocked or full; the open folders just aren't remembered.
    }
  }, [expanded])

  const toggle = useCallback((id: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }, [])

  /** Opens the given folders; nothing changes (and nothing re-renders) when they already are. */
  const expand = useCallback((ids: string[]) => {
    setExpanded((current) => (ids.every((id) => current.has(id)) ? current : new Set([...current, ...ids])))
  }, [])

  const collapseAll = useCallback(() => setExpanded(new Set()), [])

  return { expanded, toggle, expand, collapseAll }
}

import { useEffect, useState } from "react"
import { masonryColumns } from "@/lib/masonry"

/** A callback ref and the number of masonry columns that fit the element's width. */
export function useColumnCount() {
  const [node, setNode] = useState<HTMLElement | null>(null)
  const [columns, setColumns] = useState(1)

  useEffect(() => {
    if (!node) return
    const observer = new ResizeObserver(([entry]) => setColumns(masonryColumns(entry.contentRect.width)))
    observer.observe(node)
    return () => observer.disconnect()
  }, [node])

  return [setNode, columns] as const
}

import type { ReactNode } from "react"

/** The item ids in each column, by column id. */
export type BoardLayout = Record<string, string[]>

export type BoardColumnItems<T> = { id: string; items: T[] }

/** A drop that changed something: `ids` is the target column's visible order once the item landed. */
export type BoardMove = { itemId: string; from: string; to: string; ids: string[] }

export type BoardColumnsProps<T> = {
  columns: BoardColumnItems<T>[]
  getItemId: (item: T) => string
  renderItem: (item: T) => ReactNode
  /** Wraps a column's sortable list (`list`) with its header and other chrome. */
  renderColumn: (columnId: string, list: ReactNode) => ReactNode
  onMove: (move: BoardMove) => void
}

export type BoardDropZoneProps = { id: string; itemIds: string[]; children: ReactNode }

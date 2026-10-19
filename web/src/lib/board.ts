import { arrayMove } from "@dnd-kit/sortable"
import type { BoardColumnItems, BoardLayout, BoardMove } from "@/types/board"

export function toBoardLayout<T>(columns: BoardColumnItems<T>[], getItemId: (item: T) => string): BoardLayout {
  return Object.fromEntries(columns.map((column) => [column.id, column.items.map(getItemId)]))
}

/** The column holding `id`, or `id` itself when it names a column. */
export function findBoardColumn(layout: BoardLayout, id: string) {
  return id in layout ? id : Object.keys(layout).find((column) => layout[column].includes(id))
}

/** Carries `activeId` into the column under `overId`, at the hovered item or at the end. Same layout if it stays put. */
export function moveAcrossColumns(layout: BoardLayout, activeId: string, overId: string | null) {
  const from = findBoardColumn(layout, activeId)
  const to = overId === null ? undefined : findBoardColumn(layout, overId)
  if (!from || !to || from === to) return layout
  const target = layout[to].filter((id) => id !== activeId)
  const index = target.indexOf(overId!)
  target.splice(index === -1 ? target.length : index, 0, activeId)
  return { ...layout, [from]: layout[from].filter((id) => id !== activeId), [to]: target }
}

/**
 * The layout once `activeId` is dropped on `overId`: it takes the hovered item's place in its column.
 * Drag-over events usually carried it across already; a drop straight onto another column does it here.
 */
export function settleBoardLayout(layout: BoardLayout, activeId: string, overId: string) {
  const moved = moveAcrossColumns(layout, activeId, overId)
  const column = findBoardColumn(moved, activeId)
  if (moved !== layout || !column) return moved
  const ids = moved[column]
  const from = ids.indexOf(activeId)
  const to = ids.indexOf(overId)
  return to === -1 || from === to ? moved : { ...moved, [column]: arrayMove(ids, from, to) }
}

/** What changed for `itemId` between two layouts, or null when it ended where it started. */
export function getBoardMove(start: BoardLayout, end: BoardLayout, itemId: string): BoardMove | null {
  const from = findBoardColumn(start, itemId)
  const to = findBoardColumn(end, itemId)
  if (!from || !to || (from === to && start[from].indexOf(itemId) === end[to].indexOf(itemId))) return null
  return { itemId, from, to, ids: end[to] }
}

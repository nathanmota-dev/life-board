import { Fragment, useState } from "react"
import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core"
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { getBoardMove, moveAcrossColumns, settleBoardLayout, toBoardLayout } from "@/lib/board"
import type { BoardColumnsProps, BoardDropZoneProps, BoardLayout } from "@/types/board"

function BoardDropZone({ id, itemIds, children }: BoardDropZoneProps) {
  const { setNodeRef } = useDroppable({ id })

  return (
    <SortableContext id={id} items={itemIds} strategy={verticalListSortingStrategy}>
      <div ref={setNodeRef} className="flex min-h-20 flex-1 flex-col gap-2">
        {children}
      </div>
    </SortableContext>
  )
}

/**
 * Side-by-side columns of sortable items. Items are dragged (or moved with the
 * keyboard) inside a column or across columns; each item renders its own
 * `useSortable` handle. The board scrolls sideways when the columns don't fit.
 */
export function BoardColumns<T>({ columns, getItemId, renderItem, renderColumn, onMove }: BoardColumnsProps<T>) {
  const [draft, setDraft] = useState<BoardLayout | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const start = toBoardLayout(columns, getItemId)
  const layout = draft ?? start
  const items = new Map(columns.flatMap((column) => column.items.map((item) => [getItemId(item), item] as const)))

  const handleDragOver = ({ active, over }: DragOverEvent) =>
    setDraft((current) => current && moveAcrossColumns(current, String(active.id), over ? String(over.id) : null))

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id)
    const move = over ? getBoardMove(start, settleBoardLayout(layout, id, String(over.id)), id) : null
    setDraft(null)
    if (move) onMove(move)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={() => setDraft(start)}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraft(null)}
    >
      <div className="flex min-w-0 flex-1 items-stretch gap-3 overflow-x-auto pb-2">
        {columns.map((column) => (
          <Fragment key={column.id}>
            {renderColumn(
              column.id,
              <BoardDropZone id={column.id} itemIds={layout[column.id]}>
                {layout[column.id]
                  .filter((id) => items.has(id))
                  .map((id) => (
                    <Fragment key={id}>{renderItem(items.get(id)!)}</Fragment>
                  ))}
              </BoardDropZone>,
            )}
          </Fragment>
        ))}
      </div>
    </DndContext>
  )
}

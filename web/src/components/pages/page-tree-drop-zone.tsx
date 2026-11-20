import { DndContext, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { ROOT_DROP_ID } from "@/lib/pages"
import { cn } from "@/lib/utils"
import type { PageTreeDropZoneProps } from "@/types/page"

/** The area behind the tree: dropping an item here moves it to the root. */
function RootDropArea({ children }: { children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: ROOT_DROP_ID })
  return (
    <div ref={setNodeRef} className={cn("min-h-0 flex-1 overflow-y-auto p-2", isOver && "bg-primary/5 ring-1 ring-inset ring-primary")}>
      {children}
    </div>
  )
}

/** Where items are dragged and dropped. A drag starts after a few pixels, so clicks and double clicks still work. */
export function PageTreeDropZone({ onDrop, children }: PageTreeDropZoneProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))
  const onDragEnd = ({ active, over }: DragEndEvent) => onDrop(String(active.id), over ? String(over.id) : null)

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <RootDropArea>{children}</RootDropArea>
    </DndContext>
  )
}

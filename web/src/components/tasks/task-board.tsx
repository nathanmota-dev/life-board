import { useTranslation } from "react-i18next"
import { closestCorners, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { TaskBoardSection } from "@/components/tasks/task-board-section"
import { useReorderTasks } from "@/hooks/queries/use-tasks"
import { boardOrder, moveBoardTask } from "@/lib/tasks"
import type { TaskBoardProps } from "@/types/task"

/**
 * Pinned and Others in a masonry layout, reordered by dragging (pointer or keyboard).
 * The sections never change while dragging: dnd-kit measures the card when the drag starts, so
 * anything inserted above it would leave the card behind the pointer.
 */
export function TaskBoard({ sections, sortable, onEdit }: TaskBoardProps) {
  const { t } = useTranslation()
  const reorder = useReorderTasks()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const showSections = sections.pinned.length > 0

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const next = moveBoardTask(sections, String(active.id), over ? String(over.id) : null)
    if (next) reorder.mutate(boardOrder(next))
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleDragEnd}>
      <div className="flex min-w-0 flex-col gap-6">
        {showSections ? <TaskBoardSection id="pinned" title={t("tasks.pinned")} tasks={sections.pinned} sortable={sortable} onEdit={onEdit} /> : null}
        {sections.others.length > 0 || showSections ? (
          <TaskBoardSection id="others" title={showSections ? t("tasks.others") : undefined} tasks={sections.others} sortable={sortable} onEdit={onEdit} />
        ) : null}
      </div>
    </DndContext>
  )
}

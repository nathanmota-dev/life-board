import { useState } from "react"
import { useTranslation } from "react-i18next"
import { closestCorners, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { TaskBoardSection } from "@/components/tasks/task-board-section"
import { TaskCompletedSection } from "@/components/tasks/task-completed-section"
import { useReorderTasks } from "@/hooks/queries/use-tasks"
import { boardOrder, moveBoardTask } from "@/lib/tasks"
import type { TaskBoardProps } from "@/types/task"

/** Pinned and Others in a masonry layout, reordered by dragging (pointer or keyboard), then Completed. */
export function TaskBoard({ sections, sortable, onEdit }: TaskBoardProps) {
  const { t } = useTranslation()
  const reorder = useReorderTasks()
  const [dragging, setDragging] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  const showSections = sections.pinned.length > 0 || dragging

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(false)
    const next = moveBoardTask(sections, String(active.id), over ? String(over.id) : null)
    if (next) reorder.mutate(boardOrder(next))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={() => setDragging(true)}
      onDragCancel={() => setDragging(false)}
      onDragEnd={handleDragEnd}
    >
      <div className="flex min-w-0 flex-col gap-6">
        {showSections ? <TaskBoardSection id="pinned" title={t("tasks.pinned")} tasks={sections.pinned} sortable={sortable} onEdit={onEdit} /> : null}
        {sections.others.length > 0 || showSections ? (
          <TaskBoardSection id="others" title={showSections ? t("tasks.others") : undefined} tasks={sections.others} sortable={sortable} onEdit={onEdit} />
        ) : null}
        {sections.completed.length > 0 ? <TaskCompletedSection tasks={sections.completed} onEdit={onEdit} /> : null}
      </div>
    </DndContext>
  )
}

import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { rectSortingStrategy, SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable"
import { ProjectCard } from "@/components/projects/project-card"
import { useReorderProjects } from "@/hooks/queries/use-projects"
import { moveProject } from "@/lib/projects"
import type { ProjectGridProps } from "@/types/project"

export function ProjectGrid({ projects, onEdit }: ProjectGridProps) {
  const reorder = useReorderProjects()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const next = moveProject(projects, String(active.id), over ? String(over.id) : null)
    if (next) reorder.mutate(next)
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={projects.map((project) => project.id)} strategy={rectSortingStrategy}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {projects.map((project, index) => (
            <ProjectCard key={project.id} project={project} position={index + 1} onEdit={onEdit} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

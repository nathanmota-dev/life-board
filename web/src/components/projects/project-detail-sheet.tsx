import { ProjectDetailBody } from "@/components/projects/project-detail-body"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import type { ProjectDetailSheetProps } from "@/types/project"

export function ProjectDetailSheet({ project, actions, onClose }: ProjectDetailSheetProps) {
  return (
    <Sheet open={project !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-md" aria-describedby={undefined}>
        {project ? <ProjectDetailBody project={project} actions={actions} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  )
}

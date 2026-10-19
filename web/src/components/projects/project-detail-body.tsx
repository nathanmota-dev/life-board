import { useTranslation } from "react-i18next"
import { Archive, Pencil, Trash2 } from "lucide-react"
import { ProjectHistory } from "@/components/projects/project-history"
import { SelectField } from "@/components/shared/select-field"
import { Button } from "@/components/ui/button"
import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { daysSinceStatusChange, getProjectStatusOptions } from "@/lib/projects"
import type { ProjectDetailBodyProps } from "@/types/project"

export function ProjectDetailBody({ project, actions, onClose }: ProjectDetailBodyProps) {
  const { t } = useTranslation()
  const closeAnd = (action: () => void) => () => {
    onClose()
    action()
  }

  return (
    <div className="flex h-full flex-col">
      <SheetHeader className="border-b px-5 py-4">
        <SheetTitle className="pr-8 break-words">{project.title}</SheetTitle>
        <SheetDescription className="whitespace-pre-line">{project.description || t("projects.noDescription")}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
        <section className="grid grid-cols-2 gap-3 text-sm">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">{t("common.status")}</span>
            <SelectField
              id="project-detail-status"
              value={project.status}
              options={getProjectStatusOptions()}
              onChange={(status) => status !== project.status && actions.move({ id: project.id, input: { status, order: 0 } })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">{t("projects.inStatus")}</span>
            <span className="flex h-9 items-center rounded-md border px-3">
              {t("projects.daysInStatus", { count: daysSinceStatusChange(project) })}
            </span>
          </div>
        </section>
        {project.status === "paused" ? (
          <section className="flex flex-col gap-1.5 text-sm">
            <h3 className="text-xs text-muted-foreground">{t("projects.pauseReason")}</h3>
            <p className="break-words">{project.pauseReason || t("projects.noPauseReason")}</p>
          </section>
        ) : null}
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-medium">{t("projects.history")}</h3>
          <ProjectHistory projectId={project.id} />
        </section>
      </div>
      <div className="flex flex-wrap justify-between gap-2 border-t px-5 py-3">
        <Button variant="ghost" className="text-destructive" onClick={closeAnd(() => actions.remove(project))}>
          <Trash2 />
          {t("common.delete")}
        </Button>
        <div className="flex gap-2">
          {project.status === "done" ? (
            <Button variant="outline" onClick={closeAnd(() => actions.archive(project))}>
              <Archive />
              {t("projects.archive")}
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => actions.edit(project)}>
            <Pencil />
            {t("projects.editProject")}
          </Button>
        </div>
      </div>
    </div>
  )
}

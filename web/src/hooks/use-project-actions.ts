import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { useArchiveProject, useMoveProject, useRemoveProject, useRestoreProject } from "@/hooks/queries/use-projects"
import { errorMessage } from "@/lib/format"
import { needsPauseReason } from "@/lib/projects"
import type { Project, ProjectActionHandlers, ProjectActions } from "@/types/project"

/** Board actions shared by the cards and the detail sheet. Archive and delete offer an "Undo" toast. */
export function useProjectActions(projects: Project[], handlers: ProjectActionHandlers): ProjectActions {
  const { t } = useTranslation()
  const move = useMoveProject()
  const archive = useArchiveProject()
  const remove = useRemoveProject()
  const restore = useRestoreProject()
  const onError = (error: unknown) => toast.error(errorMessage(error))
  const offerUndo = (message: string, id: string) =>
    toast(message, { action: { label: t("common.undo"), onClick: () => restore.mutate(id, { onError }) } })

  return {
    open: handlers.open,
    edit: handlers.edit,
    move: (request) => (needsPauseReason(projects, request) ? handlers.askPauseReason(request) : move.mutate(request, { onError })),
    archive: (project) =>
      archive.mutate(project.id, { onSuccess: () => offerUndo(t("projects.archivedToast", { title: project.title }), project.id), onError }),
    remove: (project) =>
      remove.mutate(project.id, { onSuccess: () => offerUndo(t("projects.deletedToast", { title: project.title }), project.id), onError }),
  }
}

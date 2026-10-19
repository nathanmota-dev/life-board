import { useQueryClient } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import { queryKeys } from "@/hooks/queries/query-keys"
import { errorMessage } from "@/lib/format"
import { tasksService } from "@/services/tasks-service"
import type { Task } from "@/types/task"

/**
 * Archive, unarchive and delete, each confirmed by a toast with Undo. They run
 * outside React Query's observers so the toast still shows once the card unmounts.
 */
export function useTaskActions() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const run = async (work: () => Promise<unknown>) => {
    await work()
    await Promise.all(
      [queryKeys.tasks, queryKeys.stats, queryKeys.links].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    )
  }
  const withUndo = (work: () => Promise<unknown>, message: string, undo: () => Promise<unknown>) =>
    run(work)
      .then(() =>
        toast(message, { action: { label: t("common.undo"), onClick: () => void run(undo).catch(reportError) } }),
      )
      .catch(reportError)

  return {
    archive: (task: Task) =>
      withUndo(
        () => tasksService.update(task.id, { archivedAt: new Date().toISOString() }),
        t("tasks.archivedToast", { title: task.title }),
        () => tasksService.update(task.id, { archivedAt: null }),
      ),
    unarchive: (task: Task) =>
      withUndo(
        () => tasksService.update(task.id, { archivedAt: null }),
        t("tasks.unarchivedToast", { title: task.title }),
        () => tasksService.update(task.id, { archivedAt: new Date().toISOString() }),
      ),
    remove: (task: Task) =>
      withUndo(
        () => tasksService.remove(task.id),
        t("tasks.deletedToast", { title: task.title }),
        () => tasksService.restore(task.id),
      ),
  }
}

function reportError(error: unknown) {
  toast.error(errorMessage(error))
}

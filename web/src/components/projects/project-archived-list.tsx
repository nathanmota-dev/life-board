import { useTranslation } from "react-i18next"
import { Archive, ArchiveRestore } from "lucide-react"
import { toast } from "sonner"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { useArchivedProjects, useRestoreProject } from "@/hooks/queries/use-projects"
import { formatDate } from "@/lib/dates"
import { errorMessage } from "@/lib/format"
import type { ProjectArchivedRowProps } from "@/types/project"

function ProjectArchivedRow({ project }: ProjectArchivedRowProps) {
  const { t } = useTranslation()
  const restore = useRestoreProject()

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{project.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {t("projects.archivedOn", { date: formatDate(project.archivedAt ?? project.updatedAt, { dateStyle: "medium" }) })}
          {project.description ? ` · ${project.description}` : ""}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={restore.isPending}
        aria-label={t("projects.restoreItem", { title: project.title })}
        onClick={() => restore.mutate(project.id, { onError: (error) => toast.error(errorMessage(error)) })}
      >
        <ArchiveRestore />
        {t("projects.restore")}
      </Button>
    </li>
  )
}

/** Archived projects, newest first; restoring one puts it back in Done. */
export function ProjectArchivedList() {
  const { t } = useTranslation()
  const archived = useArchivedProjects()
  const items = archived.data ?? []

  return (
    <DataState
      isLoading={archived.isLoading}
      error={archived.error}
      isEmpty={items.length === 0}
      empty={<EmptyState icon={Archive} title={t("projects.archivedEmpty")} description={t("projects.archivedEmptyDescription")} />}
    >
      <ul className="divide-y rounded-2xl border bg-card">
        {items.map((project) => (
          <ProjectArchivedRow key={project.id} project={project} />
        ))}
      </ul>
    </DataState>
  )
}

import { useTranslation } from "react-i18next"
import { DataState } from "@/components/shared/data-state"
import { StatusBadge } from "@/components/shared/status-badge"
import { useProjectHistory } from "@/hooks/queries/use-projects"
import { formatDate } from "@/lib/dates"
import { PROJECT_STATUS_TONES } from "@/lib/projects"
import type { ProjectHistoryProps } from "@/types/project"

export function ProjectHistory({ projectId }: ProjectHistoryProps) {
  const { t } = useTranslation()
  const history = useProjectHistory(projectId)
  const items = history.data ?? []

  return (
    <DataState
      isLoading={history.isLoading}
      error={history.error}
      isEmpty={items.length === 0}
      empty={<p className="text-sm text-muted-foreground">{t("projects.noHistory")}</p>}
    >
      <ol className="flex flex-col gap-3 border-l pl-4">
        {items.map((change) => (
          <li key={change.id} className="relative flex flex-col gap-1 text-sm">
            <span className="absolute top-2 -left-[1.3rem] size-2 rounded-full border-2 border-background bg-primary" aria-hidden="true" />
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge label={t(`projectStatuses.${change.status}`)} tone={PROJECT_STATUS_TONES[change.status]} />
              <time dateTime={change.changedAt} className="text-xs text-muted-foreground">
                {formatDate(change.changedAt, { dateStyle: "medium", timeStyle: "short" })}
              </time>
            </div>
            {change.pauseReason ? <p className="text-xs text-muted-foreground">{change.pauseReason}</p> : null}
          </li>
        ))}
      </ol>
    </DataState>
  )
}

import { useTranslation } from "react-i18next"
import { TriangleAlert } from "lucide-react"
import { StatusBadge } from "@/components/shared/status-badge"
import { PROJECT_STATUS_TONES } from "@/lib/projects"
import { cn } from "@/lib/utils"
import type { ProjectColumnProps } from "@/types/project"

export function ProjectColumn({ status, count, warning, action, top, bottom, children }: ProjectColumnProps) {
  const { t } = useTranslation()
  const label = t(`projectStatuses.${status}`)

  return (
    <section
      aria-label={label}
      className={cn(
        "flex w-72 shrink-0 flex-col gap-2 rounded-2xl border bg-muted/30 p-2 transition-colors",
        warning && "border-warning/60 bg-warning/5",
      )}
    >
      <header className="flex h-8 items-center justify-between gap-2 pl-1">
        <h2 className="flex min-w-0 items-center gap-2">
          <StatusBadge label={label} tone={PROJECT_STATUS_TONES[status]} />
          <span className="text-xs text-muted-foreground tabular-nums" aria-label={t("projects.columnCount", { count })}>
            {count}
          </span>
        </h2>
        {action}
      </header>
      {warning ? (
        <p role="status" className="flex items-center gap-1.5 rounded-lg bg-warning/10 px-2 py-1.5 text-xs text-warning">
          <TriangleAlert className="size-3.5 shrink-0" />
          {warning}
        </p>
      ) : null}
      {top}
      {children}
      {bottom}
    </section>
  )
}

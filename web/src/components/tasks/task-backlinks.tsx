import { useTranslation } from "react-i18next"
import { Link2 } from "lucide-react"
import { useBacklinks } from "@/hooks/queries/use-links"
import type { TaskBacklinksProps } from "@/types/task"

export function TaskBacklinks({ taskId }: TaskBacklinksProps) {
  const { t } = useTranslation()
  const backlinks = useBacklinks({ kind: "task", id: taskId })
  const items = backlinks.data ?? []

  return items.length > 0 ? (
    <div className="rounded-xl border bg-muted/30 p-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Link2 className="size-3.5" />
        {t("tasks.linkedFrom")}
      </p>
      <ul className="flex flex-col gap-1.5">
        {items.map((link) => (
          <li key={`${link.source}-${link.sourceId}`} className="flex items-center justify-between gap-3 text-sm">
            <span className="truncate">{link.label}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{t(`linkSources.${link.source}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  ) : null
}

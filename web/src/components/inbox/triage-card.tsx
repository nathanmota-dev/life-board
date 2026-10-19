import { useTranslation } from "react-i18next"
import { TagList } from "@/components/shared/tag-list"
import { Progress } from "@/components/ui/progress"
import { formatRelativeDay, formatTime } from "@/lib/dates"
import type { TriageCardProps } from "@/types/inbox"

export function TriageCard({ task, position, total }: TriageCardProps) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Progress aria-label={t("inbox.triageProgress")} value={((position - 1) / total) * 100} className="flex-1" />
        <span className="text-xs text-muted-foreground tabular-nums">{t("common.ofTotal", { count: position, total })}</span>
      </div>
      <article className="flex min-h-40 flex-col justify-center gap-3 rounded-2xl border bg-card p-6 shadow-xs">
        <p className="text-xs text-muted-foreground">
          {t("inbox.capturedOn", { date: `${formatRelativeDay(task.createdAt)} · ${formatTime(task.createdAt)}` })}
        </p>
        <h2 className="text-xl font-semibold tracking-tight break-words">{task.title}</h2>
        {task.description ? <p className="line-clamp-3 text-sm text-muted-foreground">{task.description}</p> : null}
        {task.tags.length > 0 ? <TagList tags={task.tags} /> : null}
      </article>
    </div>
  )
}

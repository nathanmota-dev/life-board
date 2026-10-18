import { useTranslation } from "react-i18next"
import { Progress } from "@/components/ui/progress"
import type { GoalsProgressListProps } from "@/types/dashboard"

export function GoalsProgressList({ goals }: GoalsProgressListProps) {
  const { t } = useTranslation()
  return (
    <ul className="flex flex-col gap-3">
      {goals.map((goal) => (
        <li key={goal.id}>
          <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
            <span className="truncate font-medium">{goal.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {t(`goalDomains.${goal.domain}`)} · <span className="font-medium text-foreground tabular-nums">{goal.progress}%</span>
            </span>
          </div>
          <Progress value={goal.progress} aria-label={t("common.itemProgress", { title: goal.title })} className="h-1.5" />
        </li>
      ))}
    </ul>
  )
}

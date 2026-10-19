import { useTranslation } from "react-i18next"
import { GOAL_DOMAIN_COLORS } from "@/lib/goals"
import type { GoalUndatedListProps } from "@/types/goal"

/** Goals without a target date, which can't sit on the timeline. */
export function GoalUndatedList({ goals, onOpen }: GoalUndatedListProps) {
  const { t } = useTranslation()
  return goals.length > 0 ? (
    <section aria-label={t("goals.undated")} className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{t("goals.undated")}</h3>
      <ul className="divide-y rounded-xl border">
        {goals.map((goal) => (
          <li key={goal.id}>
            <button type="button" onClick={() => onOpen(goal)} className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/30 focus-visible:outline-2 focus-visible:outline-ring">
              <span className="size-2 shrink-0 rounded-full" style={{ background: GOAL_DOMAIN_COLORS[goal.domain] }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{goal.title}</span>
              <span className="text-xs text-muted-foreground">{t(`goalDomains.${goal.domain}`)}</span>
              <span className="w-10 text-right text-xs font-medium tabular-nums">{goal.progress}%</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  ) : null
}

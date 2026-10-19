import { useTranslation } from "react-i18next"
import { GoalCardList } from "@/components/goals/goal-card-list"
import { GOAL_DOMAIN_COLORS, groupByDomain } from "@/lib/goals"
import type { GoalGridProps } from "@/types/goal"

export function GoalGrid({ goals, grouped, onOpen }: GoalGridProps) {
  const { t } = useTranslation()
  return grouped ? (
    <div className="flex flex-col gap-6">
      {groupByDomain(goals).map((group) => (
        <section key={group.domain} aria-label={t(`goalDomains.${group.domain}`)} className="flex flex-col gap-3">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <span className="size-2.5 rounded-full" style={{ background: GOAL_DOMAIN_COLORS[group.domain] }} aria-hidden="true" />
            {t(`goalDomains.${group.domain}`)}
            <span className="text-xs font-normal text-muted-foreground tabular-nums">{group.goals.length}</span>
          </h3>
          <GoalCardList goals={group.goals} onOpen={onOpen} />
        </section>
      ))}
    </div>
  ) : (
    <GoalCardList goals={goals} onOpen={onOpen} />
  )
}

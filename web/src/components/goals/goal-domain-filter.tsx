import { useTranslation } from "react-i18next"
import { GOAL_DOMAIN_COLORS, getGoalDomainOptions } from "@/lib/goals"
import { cn } from "@/lib/utils"
import type { GoalDomainFilter as DomainFilter, GoalDomainFilterProps } from "@/types/goal"

/** Area chips, each with its domain color. */
export function GoalDomainFilter({ value, onChange }: GoalDomainFilterProps) {
  const { t } = useTranslation()
  const options: { value: DomainFilter; label: string }[] = [{ value: "all", label: t("goals.allAreas") }, ...getGoalDomainOptions()]

  return (
    <div role="group" aria-label={t("goals.areaFilter")} className="flex max-w-full flex-wrap items-center gap-1.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            "flex h-7 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
            option.value === value && "border-primary/40 bg-primary/10 font-medium text-foreground",
          )}
        >
          {option.value === "all" ? null : <span className="size-2 rounded-full" style={{ background: GOAL_DOMAIN_COLORS[option.value] }} aria-hidden="true" />}
          {option.label}
        </button>
      ))}
    </div>
  )
}

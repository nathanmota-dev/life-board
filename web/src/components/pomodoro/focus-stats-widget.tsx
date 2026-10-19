import { useTranslation } from "react-i18next"
import { Clock3, Target } from "lucide-react"
import { cn } from "@/lib/utils"
import type { FocusStatsWidgetProps } from "@/types/pomodoro"

export function FocusStatsWidget({ state }: FocusStatsWidgetProps) {
  const { t } = useTranslation()
  const { sessions, focusMinutes } = state.today
  const goal = state.settings.dailyGoal
  const formatMinutes = (total: number) =>
    total >= 60 ? t("pomodoro.hoursMinutes", { hours: Math.floor(total / 60), minutes: total % 60 }) : t("pomodoro.minutes", { count: total })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs text-muted-foreground">{t("pomodoro.completed")}</p>
        <p className="mt-1 text-4xl font-light tabular-nums">
          {sessions}
          <span className="text-lg text-muted-foreground"> / {goal}</span>
        </p>
      </div>
      <div className="flex gap-1" role="img" aria-label={t("common.ofTotal", { count: sessions, total: goal })}>
        {Array.from({ length: goal }, (_, index) => (
          <span key={index} className={cn("h-1.5 flex-1 rounded-full", index < sessions ? "bg-primary" : "bg-muted")} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {sessions >= goal ? t("pomodoro.goalReached") : t("pomodoro.goalLeft", { count: goal - sessions })}
      </p>
      <dl className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-muted/60 px-3 py-2.5">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock3 className="size-3.5 text-primary" />
            {t("pomodoro.focusTime")}
          </dt>
          <dd className="mt-1 text-sm font-medium tabular-nums">{formatMinutes(focusMinutes)}</dd>
        </div>
        <div className="rounded-xl bg-muted/60 px-3 py-2.5">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Target className="size-3.5 text-primary" />
            {t("pomodoro.dailyGoal")}
          </dt>
          <dd className="mt-1 text-sm font-medium tabular-nums">{formatMinutes(goal * state.settings.focusMinutes)}</dd>
        </div>
      </dl>
    </div>
  )
}

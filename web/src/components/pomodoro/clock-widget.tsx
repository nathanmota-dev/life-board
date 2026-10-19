import { useTranslation } from "react-i18next"
import { Progress } from "@/components/ui/progress"
import { greeting } from "@/lib/dashboard"
import { dayOfYear, formatDate, formatTime, isoWeek, minutesSinceMidnight } from "@/lib/dates"
import type { ClockWidgetProps } from "@/types/weather"

export function ClockWidget({ now }: ClockWidgetProps) {
  const { t } = useTranslation()
  const dayProgress = Math.round((minutesSinceMidnight(now) / (24 * 60)) * 100)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm text-muted-foreground">{greeting(now)}</p>
        <time dateTime={now.toISOString()} className="block text-6xl font-extralight tracking-tight tabular-nums">
          {formatTime(now)}
        </time>
        <p className="mt-1 text-sm first-letter:uppercase">{formatDate(now, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
      </div>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{t("pomodoro.dayProgress")}</span>
          <span className="tabular-nums">{dayProgress}%</span>
        </div>
        <Progress value={dayProgress} aria-label={t("pomodoro.dayProgress")} className="h-1.5 bg-muted" />
        <p className="text-xs text-muted-foreground">{t("pomodoro.dayOfYear", { day: dayOfYear(now), week: isoWeek(now) })}</p>
      </div>
    </div>
  )
}

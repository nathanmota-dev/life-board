import { useTranslation } from "react-i18next"
import { Timer } from "lucide-react"
import { formatDate, formatTime } from "@/lib/dates"
import { formatCountdown } from "@/lib/pomodoro"
import { formatTemperature, weatherCondition } from "@/lib/weather"
import type { StatusBarProps } from "@/types/pomodoro"

/** A macOS-style menu bar strip: the running timer on the left, weather and clock on the right. */
export function StatusBar({ now, location, weather, pomodoro }: StatusBarProps) {
  const { t } = useTranslation()
  const WeatherIcon = weather ? weatherCondition(weather.code, weather.isDay).icon : null
  const active = pomodoro && pomodoro.state.status !== "idle" ? pomodoro : null

  return (
    <div
      role="status"
      aria-label={t("pomodoro.statusBar")}
      className="relative flex h-8 shrink-0 items-center justify-between gap-4 border-b bg-background/70 px-4 text-xs backdrop-blur-xl"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex items-center gap-1.5 font-semibold">
          <Timer className="size-3.5 text-primary" strokeWidth={2.2} />
          {t("navigation.pomodoro")}
        </span>
        {active ? (
          <span className="rounded-md bg-primary/12 px-1.5 py-0.5 font-medium text-primary tabular-nums">
            {t(`pomodoro.phases.${active.state.phase}`)} · {formatCountdown(active.remainingMs)}
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 items-center gap-4 text-muted-foreground">
        {weather && WeatherIcon && location ? (
          <span className="hidden items-center gap-1.5 truncate sm:flex">
            <WeatherIcon className="size-3.5" strokeWidth={1.8} />
            <span className="tabular-nums">{formatTemperature(weather.temperature)}C</span>
            <span className="truncate">{location.city}</span>
          </span>
        ) : null}
        <span className="first-letter:uppercase">{formatDate(now, { weekday: "short", day: "numeric", month: "short" })}</span>
        <span className="font-medium text-foreground tabular-nums">{formatTime(now)}</span>
      </div>
    </div>
  )
}

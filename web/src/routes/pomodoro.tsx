import { useTranslation } from "react-i18next"
import { MonitorSmartphone } from "lucide-react"
import { ClockWidget } from "@/components/pomodoro/clock-widget"
import { FocusStatsWidget } from "@/components/pomodoro/focus-stats-widget"
import { MacWindow } from "@/components/pomodoro/mac-window"
import { PomodoroSettingsPanel } from "@/components/pomodoro/pomodoro-settings-panel"
import { PomodoroTimer } from "@/components/pomodoro/pomodoro-timer"
import { StatusBar } from "@/components/pomodoro/status-bar"
import { WeatherWidget } from "@/components/pomodoro/weather-widget"
import { DataState } from "@/components/shared/data-state"
import { EmptyState } from "@/components/shared/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { useApproximateLocation, useWeather } from "@/hooks/queries/use-weather"
import { useNow } from "@/hooks/use-now"
import { usePomodoro } from "@/hooks/use-pomodoro"
import { isPomodoroAvailable } from "@/lib/desktop-pomodoro"

export function PomodoroPage() {
  const { t } = useTranslation()
  const now = useNow(1000)
  const pomodoro = usePomodoro()
  const available = isPomodoroAvailable()
  const location = useApproximateLocation()
  const weather = useWeather(location.data)

  return (
    <section className="relative isolate flex min-w-0 flex-1 flex-col overflow-x-hidden bg-muted/40 dark:bg-background">
      {/* A soft glow in the accent colour stands in for a desktop wallpaper. */}
      <div aria-hidden className="pointer-events-none absolute -top-48 left-1/2 -z-10 size-[42rem] -translate-x-1/2 rounded-full bg-primary/12 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -right-40 bottom-0 -z-10 size-[28rem] rounded-full bg-chart-4/30 blur-3xl" />
      <h1 className="sr-only">{t("navigation.pomodoro")}</h1>
      <StatusBar now={now} location={location.data} weather={weather.data} pomodoro={pomodoro} />
      <div className="grid flex-1 content-start gap-5 p-5 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <MacWindow title={t("pomodoro.clockWindow")}>
            <ClockWidget now={now} />
          </MacWindow>
          <MacWindow title={t("pomodoro.weatherWindow")} className="flex-1">
            <WeatherWidget location={location.data} weather={weather.data} isLoading={location.isLoading || weather.isLoading} error={weather.error} />
          </MacWindow>
        </div>
        <MacWindow title={t("pomodoro.timerWindow")} className="order-first md:col-span-2 xl:order-none xl:col-span-1">
          <DataState
            isLoading={available && !pomodoro}
            error={null}
            isEmpty={!available}
            loading={<Skeleton className="mx-auto size-72 rounded-full" />}
            empty={<EmptyState icon={MonitorSmartphone} title={t("pomodoro.desktopOnly")} description={t("pomodoro.desktopOnlyHint")} className="my-auto" />}
          >
            {pomodoro ? <PomodoroTimer pomodoro={pomodoro} /> : null}
          </DataState>
        </MacWindow>
        <div className="flex min-w-0 flex-col gap-5">
          {pomodoro ? (
            <>
              <MacWindow title={t("pomodoro.todayWindow")}>
                <FocusStatsWidget state={pomodoro.state} />
              </MacWindow>
              <MacWindow title={t("pomodoro.settingsWindow")}>
                <PomodoroSettingsPanel pomodoro={pomodoro} />
              </MacWindow>
            </>
          ) : null}
        </div>
      </div>
    </section>
  )
}

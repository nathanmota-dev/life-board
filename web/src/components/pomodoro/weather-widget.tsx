import { useTranslation } from "react-i18next"
import { Navigation } from "lucide-react"
import { DataState } from "@/components/shared/data-state"
import { Skeleton } from "@/components/ui/skeleton"
import { formatLocalTime, formatTemperature, weatherCondition } from "@/lib/weather"
import type { WeatherDetailsProps, WeatherWidgetProps } from "@/types/weather"

function WeatherDetails({ location, weather }: WeatherDetailsProps) {
  const { t } = useTranslation()
  const { condition, icon: Icon } = weatherCondition(weather.code, weather.isDay)
  const details = [
    { label: t("weather.feelsLike"), value: formatTemperature(weather.apparentTemperature) },
    { label: t("weather.humidity"), value: `${Math.round(weather.humidity)}%` },
    { label: t("weather.wind"), value: `${Math.round(weather.windSpeed)} km/h` },
    { label: t("weather.rainChance"), value: weather.precipitationChance === null ? "—" : `${weather.precipitationChance}%` },
    { label: t("weather.sunrise"), value: formatLocalTime(weather.sunrise) },
    { label: t("weather.sunset"), value: formatLocalTime(weather.sunset) },
  ]

  return (
    <div className="flex flex-1 flex-col justify-between gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate text-sm font-medium">
            <Navigation className="size-3 shrink-0 fill-current text-primary" />
            {location.city}
          </p>
          <p className="text-5xl font-extralight tabular-nums">{formatTemperature(weather.temperature)}</p>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <Icon className="size-7 text-primary" strokeWidth={1.6} />
          <p className="text-sm font-medium">{t(`weather.conditions.${condition}`)}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {t("weather.highLow", { high: formatTemperature(weather.high), low: formatTemperature(weather.low) })}
          </p>
        </div>
      </div>
      <ol aria-label={t("weather.hourly")} className="grid grid-cols-5 gap-1 border-t pt-3 text-center">
        {weather.hourly.map((hour, index) => {
          const HourIcon = weatherCondition(hour.code).icon
          return (
            <li key={hour.time} className="flex flex-col items-center gap-1.5 text-xs">
              <span className="text-muted-foreground">{index === 0 ? t("weather.now") : formatLocalTime(hour.time, { hour: "numeric" })}</span>
              <HourIcon className="size-4 text-muted-foreground" strokeWidth={1.7} />
              <span className="font-medium tabular-nums">{formatTemperature(hour.temperature)}</span>
            </li>
          )
        })}
      </ol>
      <dl className="grid grid-cols-3 gap-2">
        {details.map((detail) => (
          <div key={detail.label} className="rounded-xl bg-muted/60 px-2.5 py-2">
            <dt className="truncate text-xs text-muted-foreground">{detail.label}</dt>
            <dd className="text-sm font-medium tabular-nums">{detail.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        {location.source === "ip" ? t("weather.approximate") : t("weather.fallback")} · Open-Meteo
      </p>
    </div>
  )
}

export function WeatherWidget({ location, weather, isLoading, error }: WeatherWidgetProps) {
  return (
    <DataState isLoading={isLoading} error={error} isEmpty={!location || !weather} loading={<Skeleton className="h-72 w-full rounded-xl" />}>
      {location && weather ? <WeatherDetails location={location} weather={weather} /> : null}
    </DataState>
  )
}

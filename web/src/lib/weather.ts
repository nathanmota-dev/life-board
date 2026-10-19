import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Moon, Sun } from "lucide-react"
import { getLocale } from "@/lib/i18n"
import type { OpenMeteoResponse, Weather, WeatherConditionInfo } from "@/types/weather"

const HOURLY_COUNT = 5

/** WMO weather interpretation codes, as returned by Open-Meteo. */
export function weatherCondition(code: number, isDay = true): WeatherConditionInfo {
  if (code === 0) return { condition: "clear", icon: isDay ? Sun : Moon }
  if (code <= 2) return { condition: "partlyCloudy", icon: isDay ? CloudSun : CloudMoon }
  if (code === 3) return { condition: "cloudy", icon: Cloud }
  if (code === 45 || code === 48) return { condition: "fog", icon: CloudFog }
  if (code >= 51 && code <= 57) return { condition: "drizzle", icon: CloudDrizzle }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { condition: "snow", icon: CloudSnow }
  if (code >= 95) return { condition: "storm", icon: CloudLightning }
  return { condition: "rain", icon: CloudRain }
}

export function toWeather({ current, hourly, daily }: OpenMeteoResponse): Weather {
  return {
    temperature: current.temperature_2m,
    apparentTemperature: current.apparent_temperature,
    humidity: current.relative_humidity_2m,
    windSpeed: current.wind_speed_10m,
    code: current.weather_code,
    isDay: current.is_day === 1,
    high: daily.temperature_2m_max[0],
    low: daily.temperature_2m_min[0],
    precipitationChance: daily.precipitation_probability_max?.[0] ?? null,
    uvIndex: daily.uv_index_max?.[0] ?? null,
    sunrise: daily.sunrise[0],
    sunset: daily.sunset[0],
    hourly: hourly.time.slice(0, HOURLY_COUNT).map((time, index) => ({
      time,
      temperature: hourly.temperature_2m[index],
      code: hourly.weather_code[index],
    })),
  }
}

export function formatTemperature(value: number) {
  return `${Math.round(value)}°`
}

// Open-Meteo returns wall-clock times of the forecast location ("2026-10-19T15:00");
// reading them as UTC and formatting in UTC keeps them in that location's time.
export function formatLocalTime(value: string, options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" }) {
  return new Intl.DateTimeFormat(getLocale(), { ...options, timeZone: "UTC" }).format(new Date(`${value}Z`))
}

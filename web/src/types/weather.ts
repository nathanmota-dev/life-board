import type { LucideIcon } from "lucide-react"

export type GeoLocation = {
  city: string
  region?: string
  country?: string
  latitude: number
  longitude: number
  /** "ip" when found from the network address, "fallback" when it defaulted to São Paulo. */
  source: "ip" | "fallback"
}

export type HourlyForecast = { time: string; temperature: number; code: number }

export type Weather = {
  temperature: number
  apparentTemperature: number
  humidity: number
  windSpeed: number
  code: number
  isDay: boolean
  high: number
  low: number
  precipitationChance: number | null
  uvIndex: number | null
  sunrise: string
  sunset: string
  hourly: HourlyForecast[]
}

export type WeatherCondition = "clear" | "partlyCloudy" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm"

export type WeatherConditionInfo = { condition: WeatherCondition; icon: LucideIcon }

/** The subset of Open-Meteo's /v1/forecast response the app requests. */
export type OpenMeteoResponse = {
  current: {
    temperature_2m: number
    apparent_temperature: number
    relative_humidity_2m: number
    wind_speed_10m: number
    weather_code: number
    is_day: number
  }
  hourly: { time: string[]; temperature_2m: number[]; weather_code: number[] }
  daily: {
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    sunrise: string[]
    sunset: string[]
    precipitation_probability_max?: (number | null)[]
    uv_index_max?: (number | null)[]
  }
}

export type WeatherWidgetProps = {
  location?: GeoLocation
  weather?: Weather
  isLoading: boolean
  error: unknown
}

export type WeatherDetailsProps = { location: GeoLocation; weather: Weather }

export type ClockWidgetProps = { now: Date }

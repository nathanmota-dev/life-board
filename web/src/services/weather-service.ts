import { toWeather } from "@/lib/weather"
import type { GeoLocation, OpenMeteoResponse } from "@/types/weather"

// Open services that need no API key: IP geolocation (ipwho.is, then ipapi.co) and Open-Meteo.

const REQUEST_TIMEOUT_MS = 6000

export const SAO_PAULO: GeoLocation = {
  city: "São Paulo",
  region: "São Paulo",
  country: "BR",
  latitude: -23.5505,
  longitude: -46.6333,
  source: "fallback",
}

type IpLocation = {
  success?: boolean
  error?: boolean
  city?: string
  region?: string
  country_code?: string
  latitude?: number
  longitude?: number
}

async function getJson<T>(url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (!response.ok) throw new Error(`${url} responded ${response.status}`)
  return (await response.json()) as T
}

function toLocation(data: IpLocation): GeoLocation | null {
  if (data.success === false || data.error || !data.city) return null
  if (typeof data.latitude !== "number" || typeof data.longitude !== "number") return null
  return { city: data.city, region: data.region, country: data.country_code, latitude: data.latitude, longitude: data.longitude, source: "ip" }
}

const IP_LOOKUPS = ["https://ipwho.is/", "https://ipapi.co/json/"]

export const weatherService = {
  /** Approximate location from the network address, or São Paulo when no lookup answers. */
  locate: async (): Promise<GeoLocation> => {
    for (const url of IP_LOOKUPS) {
      const location = await getJson<IpLocation>(url).then(toLocation, () => null)
      if (location) return location
    }
    return SAO_PAULO
  },
  forecast: async ({ latitude, longitude }: GeoLocation) => {
    const url = new URL("https://api.open-meteo.com/v1/forecast")
    url.search = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day",
      hourly: "temperature_2m,weather_code",
      daily: "temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_probability_max,uv_index_max",
      forecast_hours: "6",
      forecast_days: "1",
      timezone: "auto",
    }).toString()
    return toWeather(await getJson<OpenMeteoResponse>(url.toString()))
  },
}

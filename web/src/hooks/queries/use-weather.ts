import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/hooks/queries/query-keys"
import { weatherService } from "@/services/weather-service"
import type { GeoLocation } from "@/types/weather"

const WEATHER_REFRESH_MS = 15 * 60 * 1000

/** Looked up once per app session; it already falls back to São Paulo, so it never errors. */
export function useApproximateLocation() {
  return useQuery({ queryKey: [...queryKeys.weather, "location"], queryFn: weatherService.locate, staleTime: Infinity })
}

export function useWeather(location: GeoLocation | undefined) {
  return useQuery({
    queryKey: [...queryKeys.weather, "forecast", location?.latitude, location?.longitude],
    queryFn: () => weatherService.forecast(location!),
    enabled: Boolean(location),
    staleTime: WEATHER_REFRESH_MS,
    refetchInterval: WEATHER_REFRESH_MS,
  })
}

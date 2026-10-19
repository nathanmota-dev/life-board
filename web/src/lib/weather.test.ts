import { describe, expect, it } from "vitest"
import { formatLocalTime, formatTemperature, toWeather, weatherCondition } from "@/lib/weather"
import type { OpenMeteoResponse } from "@/types/weather"

const response: OpenMeteoResponse = {
  current: { temperature_2m: 23.6, apparent_temperature: 24.2, relative_humidity_2m: 61, wind_speed_10m: 9.4, weather_code: 2, is_day: 1 },
  hourly: {
    time: ["2026-10-19T15:00", "2026-10-19T16:00", "2026-10-19T17:00", "2026-10-19T18:00", "2026-10-19T19:00", "2026-10-19T20:00"],
    temperature_2m: [23.6, 24, 23, 21.5, 20, 19],
    weather_code: [2, 2, 3, 61, 61, 3],
  },
  daily: {
    temperature_2m_max: [27.8],
    temperature_2m_min: [17.1],
    sunrise: ["2026-10-19T05:32"],
    sunset: ["2026-10-19T18:21"],
    precipitation_probability_max: [40],
    uv_index_max: [8.1],
  },
}

describe("weather", () => {
  it("maps WMO codes to conditions", () => {
    expect(weatherCondition(0).condition).toBe("clear")
    expect(weatherCondition(2).condition).toBe("partlyCloudy")
    expect(weatherCondition(45).condition).toBe("fog")
    expect(weatherCondition(53).condition).toBe("drizzle")
    expect(weatherCondition(81).condition).toBe("rain")
    expect(weatherCondition(73).condition).toBe("snow")
    expect(weatherCondition(95).condition).toBe("storm")
  })

  it("keeps the first five hours of the forecast", () => {
    const weather = toWeather(response)
    expect(weather).toMatchObject({ temperature: 23.6, isDay: true, high: 27.8, low: 17.1, precipitationChance: 40, sunset: "2026-10-19T18:21" })
    expect(weather.hourly).toHaveLength(5)
    expect(weather.hourly[3]).toEqual({ time: "2026-10-19T18:00", temperature: 21.5, code: 61 })
  })

  it("formats the location's wall-clock times without shifting them", () => {
    expect(formatLocalTime("2026-10-19T18:21", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })).toBe("18:21")
    expect(formatTemperature(23.6)).toBe("24°")
  })
})

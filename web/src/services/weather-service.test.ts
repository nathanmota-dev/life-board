import { afterEach, describe, expect, it, vi } from "vitest"
import { SAO_PAULO, weatherService } from "@/services/weather-service"

function stubFetch(responses: Record<string, unknown>) {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    const body = responses[`${url.origin}${url.pathname}`]
    return body === undefined ? new Response("", { status: 503 }) : Response.json(body)
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("weatherService", () => {
  it("locates from the first lookup that answers", async () => {
    stubFetch({
      "https://ipwho.is/": { success: false },
      "https://ipapi.co/json/": { city: "Campinas", region: "São Paulo", country_code: "BR", latitude: -22.9, longitude: -47.06 },
    })
    await expect(weatherService.locate()).resolves.toEqual({
      city: "Campinas",
      region: "São Paulo",
      country: "BR",
      latitude: -22.9,
      longitude: -47.06,
      source: "ip",
    })
  })

  it("falls back to São Paulo when every lookup fails", async () => {
    stubFetch({})
    await expect(weatherService.locate()).resolves.toEqual(SAO_PAULO)
  })

  it("asks Open-Meteo for the location's forecast", async () => {
    const fetchMock = stubFetch({
      "https://api.open-meteo.com/v1/forecast": {
        current: { temperature_2m: 20, apparent_temperature: 19, relative_humidity_2m: 70, wind_speed_10m: 5, weather_code: 0, is_day: 0 },
        hourly: { time: ["2026-10-19T22:00"], temperature_2m: [20], weather_code: [0] },
        daily: { temperature_2m_max: [25], temperature_2m_min: [15], sunrise: ["2026-10-19T05:32"], sunset: ["2026-10-19T18:21"] },
      },
    })
    const weather = await weatherService.forecast(SAO_PAULO)

    const url = new URL(String(fetchMock.mock.calls[0][0]))
    expect(url.searchParams.get("latitude")).toBe("-23.5505")
    expect(url.searchParams.get("timezone")).toBe("auto")
    expect(weather).toMatchObject({ temperature: 20, isDay: false, precipitationChance: null })
  })
})

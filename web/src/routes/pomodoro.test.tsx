import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_SETTINGS, createState, emptyDay } from "../../../desktop/src/pomodoro-timer"
import { PomodoroPage } from "@/routes/pomodoro"
import { mockApi, resetApiMock } from "@/test/mock-api"
import { renderWithProviders } from "@/test/render-with-providers"
import type { PomodoroState } from "@/types/pomodoro"

function stubWeather() {
  return mockApi({
    "GET /": () => ({ success: true, city: "Curitiba", region: "Paraná", country_code: "BR", latitude: -25.43, longitude: -49.27 }),
    "GET /v1/forecast": () => ({
      current: { temperature_2m: 18.4, apparent_temperature: 17, relative_humidity_2m: 80, wind_speed_10m: 12, weather_code: 3, is_day: 1 },
      hourly: { time: ["2026-10-19T15:00", "2026-10-19T16:00"], temperature_2m: [18.4, 18], weather_code: [3, 61] },
      daily: { temperature_2m_max: [21], temperature_2m_min: [12], sunrise: ["2026-10-19T05:40"], sunset: ["2026-10-19T18:35"] },
    }),
  })
}

function stubDesktop(state: PomodoroState) {
  const pomodoro = {
    getState: vi.fn().mockResolvedValue(state),
    dispatch: vi.fn().mockResolvedValue({ ...state, status: "running", endsAt: Date.now() + state.remainingMs }),
    updateSettings: vi.fn(async (patch: object) => ({ ...state, settings: { ...state.settings, ...patch } })),
    onState: vi.fn(() => () => {}),
    onCompleted: vi.fn(() => () => {}),
  }
  window.desktop = { pomodoro } as unknown as Window["desktop"]
  return pomodoro
}

afterEach(() => {
  resetApiMock()
  delete window.desktop
})

describe("PomodoroPage", () => {
  it("shows the timer, the weather where you are and today's progress", async () => {
    stubWeather()
    const state = createState(DEFAULT_SETTINGS, { ...emptyDay(Date.now()), sessions: 3, focusMinutes: 75 })
    const pomodoro = stubDesktop(state)
    renderWithProviders(<PomodoroPage />)

    expect(await screen.findByRole("timer")).toHaveTextContent("25:00")
    // Breaks start off, so only the focus phase is offered.
    expect(screen.getByRole("tab", { name: "Focus" })).toBeInTheDocument()
    expect(screen.queryByRole("tab", { name: "Short break" })).not.toBeInTheDocument()
    expect(screen.getByText("1h 15min")).toBeInTheDocument()
    const weather = await screen.findByRole("region", { name: "Weather" })
    expect(await within(weather).findByText("Curitiba")).toBeInTheDocument()
    expect(within(weather).getByText("Cloudy")).toBeInTheDocument()
    expect(within(screen.getByRole("status", { name: "Status bar" })).getByText("18°C")).toBeInTheDocument()
    expect(screen.getByText("Approximate location · Open-Meteo")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Start" }))
    await waitFor(() => expect(pomodoro.dispatch).toHaveBeenCalledWith({ type: "toggle" }))
    expect(await screen.findByRole("button", { name: "Pause" })).toBeInTheDocument()
  })

  it("updates durations and presets in the main process", async () => {
    stubWeather()
    const pomodoro = stubDesktop(createState(DEFAULT_SETTINGS, emptyDay(Date.now())))
    renderWithProviders(<PomodoroPage />)

    fireEvent.click(await screen.findByRole("button", { name: "Increase Focus" }))
    expect(pomodoro.updateSettings).toHaveBeenCalledWith({ focusMinutes: 30 })

    fireEvent.click(screen.getByRole("button", { name: /Deep work/ }))
    expect(pomodoro.updateSettings).toHaveBeenLastCalledWith({ focusMinutes: 90, shortBreakMinutes: 20, longBreakMinutes: 30 })

    fireEvent.click(screen.getByRole("switch", { name: /Breaks/ }))
    expect(pomodoro.updateSettings).toHaveBeenLastCalledWith({ breaksEnabled: true })
  })

  it("explains that the timer needs the desktop app", async () => {
    stubWeather()
    renderWithProviders(<PomodoroPage />)

    expect(await screen.findByText("The timer runs in the desktop app")).toBeInTheDocument()
  })
})

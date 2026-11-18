import { expect } from "vitest"
import { fireEvent, screen, waitFor } from "@testing-library/react"

/** The calendar popover that is open, the newest one when a dialog is behind it. */
export function openCalendar() {
  return screen.getAllByRole("dialog").at(-1) as HTMLElement
}

/** Moves the open calendar to the month of `day` (`YYYY-MM-DD`) and returns that day's button. */
export function calendarDay(day: string) {
  const calendar = openCalendar()
  for (let step = 0; step < 240; step++) {
    const shown = calendar.querySelector(".rdp-day:not(.rdp-outside)")?.getAttribute("data-day") ?? day
    if (shown.slice(0, 7) === day.slice(0, 7)) break
    const direction = day < shown ? ".rdp-button_previous" : ".rdp-button_next"
    fireEvent.click(calendar.querySelector(direction) as Element)
  }
  const button = calendar.querySelector(`.rdp-day:not(.rdp-outside)[data-day="${day}"] button`)
  if (!button) throw new Error(`Day ${day} is not in the calendar`)
  return button as HTMLButtonElement
}

/**
 * Opens the date picker named `label`. It's focused first, as a real click does, so
 * closing the calendar puts the focus back on it and not on the page.
 */
export function openDatePicker(label: string) {
  const trigger = screen.getByRole("button", { name: label })
  trigger.focus()
  fireEvent.click(trigger)
}

/** Opens the date picker named `label`, picks `day` and waits for the focus to come back to it. */
export async function pickDay(label: string, day: string) {
  openDatePicker(label)
  await chooseDay(label, day)
}

/** Picks `day` in the open calendar of the picker named `label`, and waits as `pickDay` does. */
export async function chooseDay(label: string, day: string) {
  fireEvent.click(calendarDay(day))
  // Radix gives the focus back after a tick; another popover opened before that would close.
  await waitFor(() => expect(screen.getByRole("button", { name: label })).toHaveFocus())
}

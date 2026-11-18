import { useState } from "react"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { DatePicker } from "@/components/shared/date-picker"
import { addDays, toDayKey } from "@/lib/dates"
import type { DatePickerProps } from "@/types/ui"

function Harness({ initial, ...props }: { initial: string } & Partial<DatePickerProps>) {
  const [day, setDay] = useState(initial)
  return (
    <>
      <DatePicker id="due" clearable value={day} onChange={setDay} {...props} />
      <output>{day || "none"}</output>
    </>
  )
}

const dialog = () => screen.getByRole("dialog")

describe("DatePicker", () => {
  it("shows a placeholder and picks a day from the calendar", () => {
    render(<Harness initial="" />)
    const trigger = screen.getByRole("button", { name: "Pick a date" })
    fireEvent.click(trigger)
    expect(within(dialog()).getByRole("button", { name: "Clear date" })).toBeDisabled()

    const day = dialog().querySelector(`[data-day="${toDayKey()}"] button`)
    expect(day).not.toBeNull()
    fireEvent.click(day as Element)
    expect(screen.getByRole("status")).toHaveTextContent(toDayKey())
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("opens on the chosen month, shows the date and clears it", () => {
    render(<Harness initial="2026-03-14" />)
    const trigger = screen.getByRole("button", { name: "03/14/2026" })
    fireEvent.click(trigger)
    expect(within(dialog()).getByText("March 2026")).toBeInTheDocument()
    expect(within(dialog()).getByRole("gridcell", { selected: true })).toHaveTextContent("14")

    fireEvent.click(within(dialog()).getByRole("button", { name: "Clear date" }))
    expect(screen.getByRole("status")).toHaveTextContent("none")
    expect(screen.getByRole("button", { name: "Pick a date" })).toBeInTheDocument()
  })

  it("closes when the selected day is picked again, keeping it", () => {
    render(<Harness initial="2026-03-14" />)
    fireEvent.click(screen.getByRole("button", { name: "03/14/2026" }))
    fireEvent.click(dialog().querySelector('[data-day="2026-03-14"] button') as Element)
    expect(screen.getByRole("status")).toHaveTextContent("2026-03-14")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("jumps to today", () => {
    render(<Harness initial="2020-01-02" />)
    fireEvent.click(screen.getByRole("button", { name: "01/02/2020" }))
    fireEvent.click(within(dialog()).getByRole("button", { name: "Today" }))
    expect(screen.getByRole("status")).toHaveTextContent(toDayKey())
  })

  it("keeps days outside min and max from being picked", () => {
    render(<Harness initial="2026-03-14" clearable={false} label="Start" min="2026-03-10" max="2026-03-20" />)
    fireEvent.click(screen.getByRole("button", { name: "Start" }))
    expect(within(dialog()).queryByRole("button", { name: "Clear date" })).not.toBeInTheDocument()
    expect(within(dialog()).getByRole("button", { name: "Today" })).toBeDisabled()

    const day = (key: string) => dialog().querySelector(`[data-day="${key}"] button`) as HTMLButtonElement
    expect(day("2026-03-09")).toBeDisabled()
    expect(day("2026-03-21")).toBeDisabled()
    fireEvent.click(day("2026-03-20"))
    expect(screen.getByRole("status")).toHaveTextContent("2026-03-20")
  })

  it("opens on the month of max when today is past it", () => {
    const max = toDayKey(addDays(new Date(), -70))
    render(<Harness initial="" max={max} />)
    fireEvent.click(screen.getByRole("button", { name: "Pick a date" }))
    expect(dialog().querySelector(`[data-day="${max}"]`)).not.toBeNull()
  })
})

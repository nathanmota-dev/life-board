import { useState } from "react"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { DatePicker } from "@/components/shared/date-picker"
import { toDayKey } from "@/lib/dates"

function Harness({ initial }: { initial: string }) {
  const [day, setDay] = useState(initial)
  return (
    <>
      <DatePicker id="due" value={day} clearLabel="Clear date" onChange={setDay} />
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

  it("jumps to today", () => {
    render(<Harness initial="2020-01-02" />)
    fireEvent.click(screen.getByRole("button", { name: "01/02/2020" }))
    fireEvent.click(within(dialog()).getByRole("button", { name: "Today" }))
    expect(screen.getByRole("status")).toHaveTextContent(toDayKey())
  })
})

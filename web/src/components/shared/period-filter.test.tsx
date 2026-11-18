import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { PeriodFilter } from "@/components/shared/period-filter"
import { usePeriod } from "@/hooks/use-period"
import { addDays, lastDays, toDayKey } from "@/lib/dates"
import { calendarDay, openDatePicker, pickDay } from "@/test/pick-day"

function Harness() {
  const period = usePeriod()
  return (
    <>
      <PeriodFilter state={period} />
      <output>{period.days.length ? `${period.days[0]}..${period.days.at(-1)} (${period.days.length})` : "invalid"}</output>
    </>
  )
}

describe("PeriodFilter", () => {
  it("switches between 7 days, 30 days and a custom range", async () => {
    render(<Harness />)
    const week = lastDays(7)
    expect(screen.getByRole("status")).toHaveTextContent(`${week[0]}..${week[6]} (7)`)
    expect(screen.queryByLabelText("From")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("tab", { name: "30 days" }))
    expect(screen.getByRole("status")).toHaveTextContent("(30)")

    fireEvent.click(screen.getByRole("tab", { name: "Custom" }))
    const from = toDayKey(addDays(new Date(), -10))
    const to = toDayKey(addDays(new Date(), -4))
    await pickDay("From", from)
    await pickDay("To", to)
    expect(screen.getByRole("status")).toHaveTextContent(`${from}..${to} (7)`)

    // The start can't pass the end, nor the end pass today.
    openDatePicker("From")
    expect(calendarDay(toDayKey(addDays(new Date(), -3)))).toBeDisabled()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    openDatePicker("To")
    expect(calendarDay(toDayKey(addDays(new Date(), 1)))).toBeDisabled()
    expect(calendarDay(toDayKey(addDays(new Date(), -11)))).toBeDisabled()
  })
})

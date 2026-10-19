import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { PeriodFilter } from "@/components/shared/period-filter"
import { usePeriod } from "@/hooks/use-period"
import { lastDays } from "@/lib/dates"

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
  it("switches between 7 days, 30 days and a custom range", () => {
    render(<Harness />)
    const week = lastDays(7)
    expect(screen.getByRole("status")).toHaveTextContent(`${week[0]}..${week[6]} (7)`)
    expect(screen.queryByLabelText("From")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("tab", { name: "30 days" }))
    expect(screen.getByRole("status")).toHaveTextContent("(30)")

    fireEvent.click(screen.getByRole("tab", { name: "Custom" }))
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-01" } })
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-07" } })
    expect(screen.getByRole("status")).toHaveTextContent("2026-10-01..2026-10-07 (7)")

    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-09" } })
    expect(screen.getByRole("status")).toHaveTextContent("invalid")
  })
})

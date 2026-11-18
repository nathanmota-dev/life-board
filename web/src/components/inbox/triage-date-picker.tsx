import { useTranslation } from "react-i18next"
import { useState } from "react"
import { DatePicker } from "@/components/shared/date-picker"
import { Button } from "@/components/ui/button"
import { addDays, toDayKey } from "@/lib/dates"
import type { TriageDatePickerProps } from "@/types/inbox"

export function TriageDatePicker({ disabled, onConfirm, onCancel }: TriageDatePickerProps) {
  const { t } = useTranslation()
  const [day, setDay] = useState(() => toDayKey(addDays(new Date(), 1)))

  return (
    <form
      className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (day) onConfirm(day)
      }}
      onKeyDown={(event) => {
        // An open calendar handles Escape itself and only closes.
        if (event.key !== "Escape" || event.defaultPrevented) return
        event.preventDefault()
        onCancel()
      }}
    >
      <label htmlFor="triage-due" className="text-sm font-medium">
        {t("inbox.dueDate")}
      </label>
      <DatePicker id="triage-due" className="w-auto" value={day} onChange={setDay} />
      {/* Focused first, so Enter right away confirms tomorrow. */}
      <Button type="submit" size="sm" autoFocus disabled={disabled || !day}>
        {t("inbox.setDate")}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        {t("common.cancel")}
      </Button>
    </form>
  )
}

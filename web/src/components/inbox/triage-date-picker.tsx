import { useTranslation } from "react-i18next"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
    >
      <label htmlFor="triage-due" className="text-sm font-medium">
        {t("inbox.dueDate")}
      </label>
      <Input
        id="triage-due"
        type="date"
        autoFocus
        required
        className="w-auto"
        value={day}
        onChange={(event) => setDay(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return
          event.preventDefault()
          onCancel()
        }}
      />
      <Button type="submit" size="sm" disabled={disabled || !day}>
        {t("inbox.setDate")}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        {t("common.cancel")}
      </Button>
    </form>
  )
}

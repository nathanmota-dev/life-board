import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { calendarLocale } from "@/lib/calendar"
import { fromDayKey, toDayKey } from "@/lib/dates"
import type { DayCalendarProps } from "@/types/ui"

/** A month calendar to pick one day, with Today (and Clear, when the date is optional) below it. */
export function DayCalendar({ value, onChange, clearable = false, min, max }: DayCalendarProps) {
  const { t, i18n } = useTranslation()
  const selected = value ? fromDayKey(value) : undefined
  const today = toDayKey()
  const disabled = [...(min ? [{ before: fromDayKey(min) }] : []), ...(max ? [{ after: fromDayKey(max) }] : [])]

  return (
    <div className="flex flex-col gap-1">
      <Calendar
        mode="single"
        selected={selected}
        defaultMonth={selected ?? (max && max < today ? fromDayKey(max) : undefined)}
        disabled={disabled}
        locale={calendarLocale(i18n.resolvedLanguage)}
        // Clicking the selected day again unselects it in DayPicker; here it picks it again.
        onSelect={(day) => onChange(day ? toDayKey(day) : value)}
        autoFocus
      />
      <div className="flex justify-between gap-2">
        {clearable ? (
          <Button type="button" size="sm" variant="ghost" disabled={!value} onClick={() => onChange("")}>
            {t("common.clearDate")}
          </Button>
        ) : (
          <span />
        )}
        <Button type="button" size="sm" variant="ghost" disabled={Boolean((min && today < min) || (max && today > max))} onClick={() => onChange(today)}>
          {t("common.today")}
        </Button>
      </div>
    </div>
  )
}

import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { calendarLocale } from "@/lib/calendar"
import { fromDayKey, toDayKey } from "@/lib/dates"
import type { DayCalendarProps } from "@/types/ui"

/** A month calendar to pick one day, with Clear and Today below it. */
export function DayCalendar({ value, onChange, clearLabel }: DayCalendarProps) {
  const { t, i18n } = useTranslation()
  const selected = value ? fromDayKey(value) : undefined

  return (
    <div className="flex flex-col gap-1">
      <Calendar
        mode="single"
        selected={selected}
        defaultMonth={selected}
        locale={calendarLocale(i18n.resolvedLanguage)}
        onSelect={(day) => day && onChange(toDayKey(day))}
        autoFocus
      />
      <div className="flex justify-between gap-2">
        <Button type="button" size="sm" variant="ghost" disabled={!value} onClick={() => onChange("")}>
          {clearLabel}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onChange(toDayKey())}>
          {t("common.today")}
        </Button>
      </div>
    </div>
  )
}

import { useTranslation } from "react-i18next"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { addDays, formatDate, startOfWeek } from "@/lib/dates"
import type { CalendarToolbarProps } from "@/types/calendar"

export function CalendarToolbar({ weekStart, onChange, nextDisabled = false }: CalendarToolbarProps) {
  const { t } = useTranslation()
  const weekEnd = addDays(weekStart, 6)

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="ghost"
        className="bg-primary/12 text-primary hover:bg-primary/20 hover:text-primary"
        onClick={() => onChange(startOfWeek())}
      >
        {t("common.today")}
      </Button>
      <Button size="icon-sm" variant="outline" aria-label={t("calendar.previousWeek")} onClick={() => onChange(addDays(weekStart, -7))}>
        <ChevronLeft />
      </Button>
      <Button size="icon-sm" variant="outline" aria-label={t("calendar.nextWeek")} disabled={nextDisabled} onClick={() => onChange(addDays(weekStart, 7))}>
        <ChevronRight />
      </Button>
      <p className="ml-1 text-sm font-medium" aria-live="polite">
        {formatDate(weekStart)} – {formatDate(weekEnd, { month: "short", day: "numeric", year: "numeric" })}
      </p>
    </div>
  )
}

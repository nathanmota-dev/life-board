import { useTranslation } from "react-i18next"
import { AllDayChip } from "@/components/calendar/all-day-chip"
import { DayColumn } from "@/components/calendar/day-column"
import { HOUR_HEIGHT, HOURS } from "@/lib/calendar"
import { formatDate, isSameDay } from "@/lib/dates"
import { cn } from "@/lib/utils"
import type { CalendarWeekProps } from "@/types/calendar"

const GRID = "grid grid-cols-[4rem_repeat(7,minmax(7rem,1fr))]"

export function CalendarWeek({ days, layout, onCreate, onOpen }: CalendarWeekProps) {
  const { t } = useTranslation()
  const today = new Date()

  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
      <div className="max-h-[calc(100svh-16rem)] overflow-auto">
        <div className="min-w-[56rem]">
          <div className="sticky top-0 z-20 bg-card">
            <div className={cn(GRID, "border-b")}>
              <div />
              {days.map((day) => (
                <div
                  key={day.toISOString()}
                  className={cn("border-l border-t-2 border-t-transparent px-2 py-2 text-center", isSameDay(day, today) && "border-t-primary")}
                >
                  <p className="text-xs text-muted-foreground">{formatDate(day, { weekday: "short" })}</p>
                  <p className={cn("text-base font-semibold tabular-nums", isSameDay(day, today) && "text-primary")}>{formatDate(day, { day: "2-digit" })}</p>
                </div>
              ))}
            </div>
            <div className={cn(GRID, "border-b bg-muted/30")}>
              <div className="px-2 py-1.5 text-right text-[11px] text-muted-foreground">{t("calendar.allDay")}</div>
              {layout.allDay.map((events, index) => (
                <div key={index} className="flex min-h-8 flex-col gap-1 border-l p-1">
                  {events.map((event) => (
                    <AllDayChip key={event.id} event={event} onOpen={onOpen} />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className={GRID}>
            <div>
              {HOURS.map((hour) => (
                <div key={hour} className="pt-1 pr-2 text-right text-[11px] text-muted-foreground" style={{ height: HOUR_HEIGHT }}>
                  {String(hour).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {days.map((day, index) => (
              <DayColumn key={day.toISOString()} day={day} events={layout.timed[index]} onCreate={onCreate} onOpen={onOpen} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

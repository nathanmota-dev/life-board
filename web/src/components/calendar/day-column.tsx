import { useTranslation } from "react-i18next"
import { EventBlock } from "@/components/calendar/event-block"
import { HOUR_HEIGHT, HOURS, minuteToOffset, START_HOUR } from "@/lib/calendar"
import { formatTime, isSameDay, minutesSinceMidnight } from "@/lib/dates"
import { cn } from "@/lib/utils"
import type { DayColumnProps } from "@/types/calendar"

export function DayColumn({ day, events, onCreate, onOpen }: DayColumnProps) {
  const { t } = useTranslation()
  const now = new Date()
  const isToday = isSameDay(day, now)
  const nowMinute = minutesSinceMidnight(now)

  return (
    <div className={cn("relative border-l", isToday && "bg-primary/[0.03]")} style={{ height: HOURS.length * HOUR_HEIGHT }}>
      {HOURS.map((hour) => (
        <button
          key={hour}
          type="button"
          aria-label={t("calendar.newEventAt", { time: formatTime(new Date(new Date(day).setHours(hour, 0, 0, 0))) })}
          className="block w-full cursor-pointer border-b border-dashed border-border/70 hover:bg-muted/50"
          style={{ height: HOUR_HEIGHT }}
          onClick={() => {
            const start = new Date(day)
            start.setHours(hour, 0, 0, 0)
            onCreate(start)
          }}
        />
      ))}
      {events.map((item) => (
        <EventBlock key={item.event.id} item={item} onOpen={onOpen} />
      ))}
      {isToday && nowMinute >= START_HOUR * 60 ? (
        <div className="pointer-events-none absolute inset-x-0 flex items-center" style={{ top: minuteToOffset(nowMinute) }} aria-hidden="true">
          <span className="-ml-1 size-2 rounded-full bg-primary" />
          <span className="h-px flex-1 bg-primary" />
        </div>
      ) : null}
    </div>
  )
}

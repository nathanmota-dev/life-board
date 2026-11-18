import { CalendarBody, CalendarShortcuts, CalendarToolbar } from "@/components/calendarcn/calendar"

/** Hour the day and week views open on. */
const SCROLL_TO_HOUR = 8

/**
 * The calendar view's toolbar over the day, week, month, year or agenda view.
 * It fills the rest of the page without growing it: the views scroll inside.
 */
export function CalendarSurface() {
  return (
    <div className="relative min-h-[28rem] flex-1">
      <div className="absolute inset-0 flex flex-col">
        <CalendarShortcuts enabled />
        <CalendarToolbar />
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <CalendarBody scrollToHour={SCROLL_TO_HOUR} />
        </div>
      </div>
    </div>
  )
}

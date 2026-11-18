import { useEffect, useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { queryKeys } from "@/hooks/queries/query-keys"
import { useCalendarRangeEvents } from "@/hooks/queries/use-calendar"
import { toCalendarRange, toEventInput } from "@/lib/calendar"
import { createEventSync, mergeServerEvents } from "@/lib/calendar-sync"
import { errorMessage } from "@/lib/format"
import { calendarService } from "@/services/calendar-service"
import type { CalendarItem, CalendarRange, CalendarVisibleRange } from "@/types/calendar"

/**
 * The calendar view's events and callbacks: loads the range it draws, keeps
 * its edits on screen right away and saves them in the background.
 */
export function useCalendarBoard() {
  const queryClient = useQueryClient()
  const [range, setRange] = useState<CalendarRange | null>(null)
  const [items, setItems] = useState<CalendarItem[]>([])
  const events = useCalendarRangeEvents(range)

  const sync = useMemo(() => {
    const refresh = () => {
      for (const queryKey of [queryKeys.calendar, queryKeys.stats, queryKeys.links, queryKeys.google]) {
        void queryClient.invalidateQueries({ queryKey })
      }
    }
    return createEventSync({
      service: calendarService,
      toInput: toEventInput,
      onSaved: refresh,
      onError: (error) => {
        toast.error(errorMessage(error))
        refresh()
      },
    })
  }, [queryClient])

  // Edits still waiting for their delay are saved when the page closes
  useEffect(() => () => void sync.flushAll(), [sync])

  useEffect(() => {
    if (events.data) setItems((local) => mergeServerEvents(events.data, local, sync))
  }, [events.data, sync])

  return {
    events: items,
    error: events.data ? null : events.error,
    loading: events.isFetching,
    onEventsChange: setItems,
    onEventCreate: (item: CalendarItem) => void sync.create(item),
    onEventUpdate: sync.update,
    onEventDelete: (item: CalendarItem) => void sync.remove(item),
    onVisibleRangeChange: (visible: CalendarVisibleRange) => setRange(toCalendarRange(visible)),
  }
}

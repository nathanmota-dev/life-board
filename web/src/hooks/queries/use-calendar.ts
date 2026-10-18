import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/hooks/queries/query-keys"
import { useInvalidatingMutation } from "@/hooks/queries/use-invalidating-mutation"
import { calendarService } from "@/services/calendar-service"
import type { CalendarEventInput, CalendarRange } from "@/types/calendar"

export function useCalendarEvents(range: CalendarRange) {
  return useQuery({ queryKey: [...queryKeys.calendar, range], queryFn: () => calendarService.list(range) })
}

export function useCreateEvent() {
  return useInvalidatingMutation(calendarService.create, [queryKeys.calendar])
}

export function useUpdateEvent() {
  return useInvalidatingMutation(
    ({ id, input }: { id: string; input: Partial<CalendarEventInput> }) => calendarService.update(id, input),
    [queryKeys.calendar],
  )
}

export function useRemoveEvent() {
  return useInvalidatingMutation(calendarService.remove, [queryKeys.calendar])
}

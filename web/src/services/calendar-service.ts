import { api } from "@/services/api-client"
import type { ListResponse, OkResponse } from "@/types/api"
import type { CalendarEvent, CalendarEventInput, CalendarRange } from "@/types/calendar"

export const calendarService = {
  list: async (range: CalendarRange) =>
    (await api.get<ListResponse<CalendarEvent>>("/calendar/events", { ...range, limit: 500 })).items,
  create: (input: CalendarEventInput) => api.post<CalendarEvent>("/calendar/events", input),
  update: (id: string, input: Partial<CalendarEventInput>) => api.patch<CalendarEvent>(`/calendar/events/${id}`, input),
  remove: (id: string) => api.delete<OkResponse>(`/calendar/events/${id}`),
}
